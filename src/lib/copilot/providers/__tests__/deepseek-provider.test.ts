import { describe, it, expect, vi, afterEach } from "vitest";
import { DeepSeekProvider } from "../deepseek-provider";
import { AIProviderError } from "../interface";

/**
 * Provider resilience — the rules that stop a stall becoming a hang, and stop a
 * retry becoming a duplicate answer.
 *
 * The three invariants:
 *   - a stalled connection fails inside the idle timeout;
 *   - one retry is allowed, but only before the first chunk reaches the operator;
 *   - a stop (the caller's AbortSignal) is never retried.
 */

const fast = { connectTimeoutMs: 50, idleTimeoutMs: 25, maxAttempts: 2 };
const provider = () => new DeepSeekProvider("test-key", fast);

const encoder = new TextEncoder();

/** A stream that emits `parts` and then stays open forever, unless `close`. */
function sseStream(parts: string[], close = false): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      if (close) controller.close();
    },
  });
}

const chunk = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

const completion = (text: string) =>
  new Response(JSON.stringify({ model: "test-model", choices: [{ message: { content: text } }] }), {
    status: 200,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chat — retry policy", () => {
  it("retries once on a 5xx and returns the second answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream", { status: 500 }))
      .mockResolvedValueOnce(completion("hello"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider().chat([{ role: "user", content: "hi" }]);

    expect(result.content).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400 — the request itself is wrong", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider().chat([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(
      AIProviderError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("streamChat — retry only before the first chunk", () => {
  it("yields a chunk, then fails on a stall without fetching again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(sseStream([chunk("Hi")]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const c of provider().streamChat([{ role: "user", content: "hi" }])) chunks.push(c);
      })(),
    ).rejects.toBeInstanceOf(AIProviderError);

    // The operator already saw "Hi": a retry would paste the answer twice.
    expect(chunks).toEqual(["Hi"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a stall that happens before anything was shown", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(sseStream([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const c of provider().streamChat([{ role: "user", content: "hi" }])) seen.push(c);
      })(),
    ).rejects.toBeInstanceOf(AIProviderError);

    expect(seen, "nothing was shown, so a retry was safe").toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats Stop as final — an aborted call is never retried", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          const fail = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          // The signal can already be aborted by the time the generator runs.
          if (init.signal.aborted) return fail();
          init.signal.addEventListener("abort", fail);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const stream = provider().streamChat([{ role: "user", content: "hi" }], {
      signal: controller.signal,
    });
    controller.abort();

    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const c of stream) seen.push(c);
      })(),
    ).resolves.toBeUndefined();

    expect(seen).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("completes normally when the stream closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sseStream([chunk("Hello"), chunk(" world"), "data: [DONE]\n\n"], true), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const chunks: string[] = [];
    for await (const c of provider().streamChat([{ role: "user", content: "hi" }])) chunks.push(c);

    expect(chunks.join("")).toBe("Hello world");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
