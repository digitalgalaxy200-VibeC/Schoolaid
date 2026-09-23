/**
 * The OpenAI-compatible adapter — the ONLY HTTP in the AI gateway (Phase 21).
 *
 * WHY THERE IS ONE ADAPTER AND NOT ONE PER PROVIDER
 * -------------------------------------------------
 * DeepSeek, OpenAI, Groq, Together, Fireworks, vLLM and Ollama all expose the
 * same three endpoints with the same JSON: `/chat/completions`,
 * `/audio/transcriptions`, `/audio/speech`. Writing a class per provider would
 * mean seven copies of this file differing only in a base URL — and every one of
 * them a place for the timeout or the retry rule to drift.
 *
 * So the provider is not a class. It is a row: `ai_providers.base_url` plus
 * `ai_providers.api_key_env`. Supporting a provider the platform has never heard
 * of is inserting a row, not writing code. If a future provider speaks a
 * genuinely different protocol, `kind` is the seam that says so — but nothing in
 * the platform today needs it, and inventing an abstraction for a provider that
 * does not exist would be speculation.
 *
 * WHAT THIS FILE IS RESPONSIBLE FOR
 * ---------------------------------
 *   1. Turning a route into an HTTP request.
 *   2. Enforcing a timeout, so a hung provider cannot consume the request.
 *   3. Classifying the failure into "try the next provider" or "stop".
 *
 * It is NOT responsible for choosing a provider (that is the registry), for
 * retrying (that is the router), or for credits (that is the gateway).
 */

import {
  AiProviderError,
  type AiCallOptions,
  type AiMessage,
  type AiUsage,
} from "../types";

/** Injectable so tests can run the real adapter with no network. */
export type FetchLike = typeof fetch;

/**
 * Which HTTP failures are worth trying at another provider.
 *
 * The rule is about WHO is wrong, not how bad it looks:
 *
 *   - 400 / 422        the REQUEST is wrong. Every provider will reject the same
 *                      body, so retrying spends time to reach the same answer.
 *                      This is a caller bug; it should surface immediately.
 *   - 401 / 403 / 404  the PROVIDER'S CONFIGURATION is wrong — bad key, no
 *                      access to the model, model name that provider does not
 *                      serve. Another provider has its own key and its own model
 *                      name, so this is exactly the case fallback exists for.
 *   - 408 / 429 / 5xx  the provider is overloaded, throttling or broken.
 *   - anything else    4xx we do not recognise: treat as the request's fault.
 */
export function isRetryableStatus(status: number): boolean {
  if (status === 400 || status === 422) return false;
  if (status === 401 || status === 403 || status === 404) return true;
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  return false;
}

/**
 * Joins the API root and a resource path with exactly one slash.
 *
 * Exported because it is the one piece of URL handling that can be wrong in a
 * way that is invisible until production: `https://api.openai.com/v1` + `v1/...`
 * is a 404 that looks like a bad key.
 */
export function joinApiPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

const MAX_DETAIL = 500;

/**
 * Truncates a provider's error body, and redacts the key if the provider echoed
 * it back. Some gateways quote the offending request in their errors, and an API
 * key in a log line is an API key that has leaked.
 */
function summariseBody(body: string, apiKey: string): string {
  let out = body.slice(0, MAX_DETAIL);
  if (apiKey && out.includes(apiKey)) out = out.split(apiKey).join("[redacted]");
  return out || "(empty response body)";
}

/**
 * Runs one fetch with a deadline.
 *
 * `AbortSignal.timeout` would be shorter, but this makes the cleared timer
 * explicit: an un-cleared timer keeps the Node process alive, which in a
 * serverless function means the invocation is billed until it fires.
 */
async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  provider: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new AiProviderError({
      provider,
      message: aborted
        ? `${provider} did not respond within ${timeoutMs}ms`
        : `${provider} could not be reached: ${err instanceof Error ? err.message : String(err)}`,
      // A network failure or a hung connection is the primary reason a fallback
      // provider exists. Not retryable here would make fallback useless.
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Turns a non-2xx response into a classified error. */
async function failureFrom(
  provider: string,
  resp: Response,
  apiKey: string,
): Promise<AiProviderError> {
  const body = await resp.text().catch(() => "");
  return new AiProviderError({
    provider,
    message: `${provider} returned HTTP ${resp.status}`,
    status: resp.status,
    retryable: isRetryableStatus(resp.status),
    detail: summariseBody(body, apiKey),
  });
}

function readKey(envName: string, provider: string): string {
  const key = process.env[envName];
  if (!key) {
    // Config names the variable; the value is the operator's to supply. Say
    // which variable, because the person reading this owns that screen.
    throw new AiProviderError({
      provider,
      message:
        `${provider} is enabled but ${envName} is not set in the environment. ` +
        `Add the key, or disable the provider.`,
      status: null,
      // Another provider may well be configured correctly.
      retryable: true,
    });
  }
  return key;
}

function usageFrom(json: unknown): AiUsage | undefined {
  const u = (json as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u) return undefined;

  const input = typeof u.prompt_tokens === "number" ? u.prompt_tokens : undefined;
  const output = typeof u.completion_tokens === "number" ? u.completion_tokens : undefined;
  if (input === undefined && output === undefined) return undefined;

  return { inputUnits: input, outputUnits: output };
}

/**
 * Extracts the assistant's text.
 *
 * Tolerates `content` arriving as an array of parts, which is what some
 * compatible gateways do for multimodal replies. An empty completion is an
 * error rather than an empty string: a caller that receives "" cannot tell it
 * apart from a provider that silently did nothing, and would store it.
 */
function extractContent(json: unknown, provider: string): string {
  const choice = (json as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices?.[0];
  const raw = choice?.message?.content;

  if (typeof raw === "string" && raw.trim() !== "") return raw;

  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
    if (joined.trim() !== "") return joined;
  }

  throw new AiProviderError({
    provider,
    message: `${provider} returned an empty completion`,
    status: null,
    retryable: true,
  });
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** `POST /chat/completions`. Serves text AND vision — an image is just a part. */
export async function openAiCompatibleChat(args: {
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  messages: AiMessage[];
  options?: AiCallOptions;
  fetchImpl?: FetchLike;
}): Promise<{ text: string; model: string; usage?: AiUsage }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiKey = readKey(args.apiKeyEnv, args.provider);

  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
  };
  if (args.options?.maxOutputTokens !== undefined) body.max_tokens = args.options.maxOutputTokens;
  if (args.options?.temperature !== undefined) body.temperature = args.options.temperature;
  if (args.options?.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetchWithTimeout(
    fetchImpl,
    joinApiPath(args.baseUrl, "chat/completions"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    args.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    args.provider,
  );

  if (!resp.ok) throw await failureFrom(args.provider, resp, apiKey);

  const json = await resp.json().catch(() => null);
  const text = extractContent(json, args.provider);
  const model = (json as { model?: string } | null)?.model ?? args.model;

  return { text, model, usage: usageFrom(json) };
}

export type AudioInput = {
  data: Uint8Array;
  filename: string;
  mimeType: string;
};

/** `POST /audio/transcriptions` — speech to text, as multipart form data. */
export async function openAiCompatibleTranscribe(args: {
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  audio: AudioInput;
  language?: string;
  options?: AiCallOptions;
  fetchImpl?: FetchLike;
}): Promise<{ text: string; model: string; usage?: AiUsage }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiKey = readKey(args.apiKeyEnv, args.provider);

  const form = new FormData();
  // Sliced to the VIEW's own bytes, not the underlying buffer.
  //
  // A `Uint8Array` handed over by a caller may be a window into a larger buffer
  // (which is exactly what a read buffer is). Blobbing `data.buffer` would upload
  // the whole buffer — the audio plus whatever else happened to be in it — and the
  // provider would transcribe the wrong bytes or reject the file, with no clue
  // pointing at the cause. The cast is for TypeScript's ArrayBuffer/SharedArrayBuffer
  // distinction; at runtime the slice is a plain ArrayBuffer copy.
  const bytes = args.audio.data.buffer.slice(
    args.audio.data.byteOffset,
    args.audio.data.byteOffset + args.audio.data.byteLength,
  ) as ArrayBuffer;

  form.append("file", new Blob([bytes], { type: args.audio.mimeType }), args.audio.filename);
  form.append("model", args.model);
  if (args.language) form.append("language", args.language);

  // No Content-Type header: the runtime must set it, because it also has to put
  // the multipart boundary in it. Setting it by hand produces a body the
  // provider cannot parse, and the error it returns blames the audio.
  const resp = await fetchWithTimeout(
    fetchImpl,
    joinApiPath(args.baseUrl, "audio/transcriptions"),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
    args.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    args.provider,
  );

  if (!resp.ok) throw await failureFrom(args.provider, resp, apiKey);

  const json = await resp.json().catch(() => null);
  const text = (json as { text?: unknown } | null)?.text;

  if (typeof text !== "string" || text.trim() === "") {
    throw new AiProviderError({
      provider: args.provider,
      message: `${args.provider} returned an empty transcription`,
      status: null,
      retryable: true,
    });
  }

  return { text, model: args.model, usage: undefined };
}

const SPEECH_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  wav: "audio/wav",
};

/** `POST /audio/speech` — text to speech, returns audio bytes. */
export async function openAiCompatibleSpeak(args: {
  provider: string;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  input: string;
  voice?: string;
  format?: "mp3" | "opus" | "wav";
  options?: AiCallOptions;
  fetchImpl?: FetchLike;
}): Promise<{ audio: Uint8Array; mimeType: string; model: string }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const apiKey = readKey(args.apiKeyEnv, args.provider);
  const format = args.format ?? "mp3";

  const resp = await fetchWithTimeout(
    fetchImpl,
    joinApiPath(args.baseUrl, "audio/speech"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        input: args.input,
        voice: args.voice ?? "alloy",
        response_format: format,
      }),
    },
    args.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    args.provider,
  );

  if (!resp.ok) throw await failureFrom(args.provider, resp, apiKey);

  const audio = new Uint8Array(await resp.arrayBuffer());

  if (audio.byteLength === 0) {
    throw new AiProviderError({
      provider: args.provider,
      message: `${args.provider} returned empty audio`,
      status: null,
      retryable: true,
    });
  }

  return {
    audio,
    mimeType: resp.headers.get("content-type") ?? SPEECH_MIME[format] ?? "audio/mpeg",
    model: args.model,
  };
}
