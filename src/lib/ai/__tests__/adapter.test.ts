import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isRetryableStatus,
  joinApiPath,
  openAiCompatibleChat,
  openAiCompatibleSpeak,
  openAiCompatibleTranscribe,
} from "../adapters/openai-compatible";
import { AiProviderError } from "../types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Call = { url: string; init: RequestInit };

/** A fetch that answers from a fixed list and records what it was asked. */
function recordingFetch(responses: Array<Response | (() => Response)>) {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init?: unknown) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return typeof next === "function" ? next() : next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const completion = (content: unknown, usage?: unknown, model = "deepseek-chat") =>
  jsonResponse({ model, choices: [{ message: { content } }], usage });

describe("joinApiPath", () => {
  it("joins a root and a path with exactly one slash", () => {
    expect(joinApiPath("https://api.deepseek.com", "chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(joinApiPath("https://api.deepseek.com/", "/chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
    expect(joinApiPath("https://api.deepseek.com///", "chat/completions")).toBe(
      "https://api.deepseek.com/chat/completions",
    );
  });

  it("does not add a version segment of its own", () => {
    // The regression this guards: an adapter that appends "v1" turns OpenAI's
    // base into /v1/v1/chat/completions, which is a 404 that looks like a bad key.
    expect(joinApiPath("https://api.openai.com/v1", "chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });
});

describe("isRetryableStatus", () => {
  it("does not retry a request the caller got wrong", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
    // 418 is unclassified 4xx: treated as the request's fault, per the rule.
    expect(isRetryableStatus(418)).toBe(false);
  });

  it("retries a provider whose own configuration is wrong", () => {
    // Another provider has its own key and its own model name.
    expect(isRetryableStatus(401)).toBe(true);
    expect(isRetryableStatus(403)).toBe(true);
    expect(isRetryableStatus(404)).toBe(true);
  });

  it("retries a provider that is throttling or broken", () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });
});

describe("openAiCompatibleChat", () => {
  it("posts to the configured root and returns text, model and usage", async () => {
    vi.stubEnv("TEST_AI_KEY", "secret-key");
    const { impl, calls } = recordingFetch([
      completion("hello", { prompt_tokens: 11, completion_tokens: 7 }),
    ]);

    const result = await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      options: { maxOutputTokens: 123, temperature: 0.2 },
      fetchImpl: impl,
    });

    expect(result.text).toBe("hello");
    expect(result.model).toBe("deepseek-chat");
    expect(result.usage).toEqual({ inputUnits: 11, outputUnits: 7 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.com/v1/chat/completions");

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe("m1");
    expect(body.max_tokens).toBe(123);
    expect(body.temperature).toBe(0.2);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("joins content returned as parts", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl } = recordingFetch([
      completion([{ type: "text", text: "a" }, { type: "text", text: "b" }]),
    ]);

    const result = await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: impl,
    });

    expect(result.text).toBe("ab");
  });

  it("treats an empty completion as a failure rather than returning an empty string", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl } = recordingFetch([jsonResponse({ choices: [{ message: { content: "   " } }] })]);

    const err = await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: impl,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).message).toContain("empty completion");
    expect((err as AiProviderError).retryable).toBe(true);
  });

  it("never places the API key in the recorded error detail", async () => {
    vi.stubEnv("TEST_AI_KEY", "super-secret-key");
    const { impl } = recordingFetch([
      jsonResponse({ error: "bad key super-secret-key" }, 401),
    ]);

    const err = (await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(err.status).toBe(401);
    expect(err.retryable).toBe(true);
    expect(err.detail).not.toContain("super-secret-key");
    expect(err.detail).toContain("[redacted]");
  });

  it("marks a 400 as fatal so the router stops instead of re-sending it", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl } = recordingFetch([jsonResponse({ error: "bad model" }, 400)]);

    const err = (await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(err.status).toBe(400);
    expect(err.retryable).toBe(false);
  });

  it("refuses to call at all when the configured key is absent", async () => {
    vi.stubEnv("TEST_AI_KEY", "");
    const { impl, calls } = recordingFetch([completion("should not happen")]);

    const err = (await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(err.message).toContain("TEST_AI_KEY");
    // The positive control for this test: no request was made, so "the key is
    // missing" cannot be passing because the call quietly succeeded.
    expect(calls).toHaveLength(0);
  });

  it("aborts a provider that does not answer, and says so", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const calls: Call[] = [];
    // Settles only when the signal aborts - so this exercises the real timeout
    // wiring (the timer, the controller), not a message string.
    const impl = ((url: unknown, init?: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
      return new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit).signal;
        signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as unknown as typeof fetch;

    const started = Date.now();
    const err = (await openAiCompatibleChat({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "m1",
      messages: [{ role: "user", content: "hi" }],
      options: { timeoutMs: 20 },
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(calls).toHaveLength(1);
    expect(err.message).toContain("did not respond within 20ms");
    expect(err.retryable).toBe(true);
    // Proof the deadline actually fired, rather than the promise failing at once.
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});

describe("openAiCompatibleTranscribe", () => {
  it("uploads exactly the bytes of the view it was given, not its whole buffer", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl, calls } = recordingFetch([jsonResponse({ text: "transcribed" })]);

    // A view into the middle of a larger buffer, which is what a read buffer is.
    const backing = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const view = backing.subarray(2, 6);

    const result = await openAiCompatibleTranscribe({
      provider: "test",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "TEST_AI_KEY",
      model: "whisper-1",
      audio: { data: view, filename: "a.mp3", mimeType: "audio/mpeg" },
      fetchImpl: impl,
    });

    expect(result.text).toBe("transcribed");
    expect(calls[0].url).toBe("https://api.example.com/v1/audio/transcriptions");

    const form = calls[0].init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("whisper-1");

    const file = form.get("file") as File;
    expect(file).toBeTruthy();
    expect(file.name).toBe("a.mp3");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect(bytes.byteLength).toBe(4);
    expect(Array.from(bytes)).toEqual([2, 3, 4, 5]);
  });

  it("leaves Content-Type unset so the runtime can supply the multipart boundary", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl, calls } = recordingFetch([jsonResponse({ text: "ok" })]);

    await openAiCompatibleTranscribe({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "whisper-1",
      audio: { data: new Uint8Array([1]), filename: "a.mp3", mimeType: "audio/mpeg" },
      language: "en",
      fetchImpl: impl,
    });

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer k");

    const form = calls[0].init.body as FormData;
    expect(form.get("language")).toBe("en");
  });

  it("fails on an empty transcription rather than storing a blank", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl } = recordingFetch([jsonResponse({ text: "" })]);

    const err = (await openAiCompatibleTranscribe({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "whisper-1",
      audio: { data: new Uint8Array([1]), filename: "a.mp3", mimeType: "audio/mpeg" },
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(err).toBeInstanceOf(AiProviderError);
    expect(err.message).toContain("empty transcription");
  });
});

describe("openAiCompatibleSpeak", () => {
  it("returns the audio bytes and the provider's content type", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const audio = new Uint8Array([9, 8, 7]);
    const { impl, calls } = recordingFetch([
      new Response(audio, { status: 200, headers: { "content-type": "audio/mpeg" } }),
    ]);

    const result = await openAiCompatibleSpeak({
      provider: "test",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "TEST_AI_KEY",
      model: "tts-1",
      input: "read this",
      fetchImpl: impl,
    });

    expect(calls[0].url).toBe("https://api.example.com/v1/audio/speech");
    expect(Array.from(result.audio)).toEqual([9, 8, 7]);
    expect(result.mimeType).toBe("audio/mpeg");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body.input).toBe("read this");
    expect(body.model).toBe("tts-1");
  });

  it("fails on empty audio", async () => {
    vi.stubEnv("TEST_AI_KEY", "k");
    const { impl } = recordingFetch([new Response(new Uint8Array([]), { status: 200 })]);

    const err = (await openAiCompatibleSpeak({
      provider: "test",
      baseUrl: "https://api.example.com",
      apiKeyEnv: "TEST_AI_KEY",
      model: "tts-1",
      input: "read this",
      fetchImpl: impl,
    }).catch((e: unknown) => e)) as AiProviderError;

    expect(err.message).toContain("empty audio");
  });
});
