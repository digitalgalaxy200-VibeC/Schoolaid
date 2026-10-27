// ============================================================
// DeepSeek Provider — OpenAI-compatible chat completions API
// ============================================================

import type { ChatMessage, AIResponse, ChatOptions } from "../types";
import { AIProviderError, type AIProvider } from "./interface";
import { DEEPSEEK_MODEL } from "@/lib/ai/deepseek-model";

const DEEPSEEK_BASE = "https://api.deepseek.com/v1";

/**
 * Completion ceiling when the caller does not pass one. 4000 cut long replies
 * off mid-sentence; 8192 is DeepSeek's documented completion ceiling.
 */
const DEFAULT_MAX_TOKENS = 8192;

/** Appended when the provider reports it stopped at the token limit. */
const TRUNCATION_NOTICE =
  "\n\n_[The reply hit the output limit and was cut off. Ask me to continue.]_";

/**
 * How long to wait for response HEADERS. Not a budget for the whole reply.
 *
 * A total timeout would cut a long, valid, still-arriving answer mid-sentence —
 * which looks to the operator like the assistant gave up. What we actually care
 * about is silence, so the streaming path uses `IDLE_TIMEOUT_MS` between chunks
 * and this value only for the connection itself.
 */
const CONNECT_TIMEOUT_MS = 20_000;

/** Maximum gap between two streamed chunks. */
const IDLE_TIMEOUT_MS = 30_000;

/**
 * One retry. Enough to ride out a dropped connection, a 429 or a 5xx; not enough
 * to double the bill or to hammer a provider that is genuinely down.
 */
const MAX_ATTEMPTS = 2;

/** Statuses worth trying once more. 400/401/403/404 are not. */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * One controller that also listens to the caller's signal.
 *
 * The operator's Stop button is the caller's signal. Forwarding it means Stop
 * really stops the provider request — and, just as important, it is why an abort
 * must never be treated as retryable: retrying a stop would ignore the one
 * instruction the human gave.
 */
function linkAbort(external?: AbortSignal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    dispose: () => external?.removeEventListener("abort", onAbort),
  };
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Retry only connection failures and retryable HTTP statuses. */
function isRetryableError(err: unknown): boolean {
  if (err instanceof AIProviderError) return retryableStatus(err.statusCode);
  // `fetch` rejects with TypeError for DNS failures, resets and refused sockets.
  return err instanceof TypeError;
}

/**
 * `reader.read()` bounded by silence, not by total duration.
 *
 * On expiry the seek is aborted and the caller sees a 504 so the panel can say
 * "no data for 30s" instead of spinning forever.
 */
function readWithIdle(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  link: { abort: () => void },
  idleMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      link.abort();
      reject(
        new AIProviderError(
          `DeepSeek stalled — no data for ${Math.round(idleMs / 1000)}s.`,
          504,
        ),
      );
    }, idleMs);

    reader.read().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export type DeepSeekTimeouts = {
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxAttempts?: number;
};

export class DeepSeekProvider implements AIProvider {
  private apiKey: string;
  private readonly connectTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(apiKey?: string, timeouts: DeepSeekTimeouts = {}) {
    this.apiKey = apiKey || process.env.DEEPSEEK_API_KEY || "";
    this.connectTimeoutMs = timeouts.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
    this.idleTimeoutMs = timeouts.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
    this.maxAttempts = timeouts.maxAttempts ?? MAX_ATTEMPTS;
    if (!this.apiKey) {
      throw new AIProviderError(
        "DEEPSEEK_API_KEY is not configured. Please add it to your environment variables.",
        500,
      );
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.3,
      messages,
    };

    if (options?.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const link = linkAbort(options?.signal);
      // A non-streaming call has no partial output, so a total budget is safe.
      const timer = setTimeout(() => link.abort(), this.connectTimeoutMs);

      try {
        const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: link.signal,
        });

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          const error = new AIProviderError(
            `DeepSeek API error ${resp.status}: ${errBody.slice(0, 500)}`,
            resp.status,
          );

          if (attempt < this.maxAttempts && retryableStatus(resp.status) && !options?.signal?.aborted) {
            console.warn(`[deepseek] chat retrying after HTTP ${resp.status} (attempt ${attempt})`);
            continue;
          }
          throw error;
        }

        const json = await resp.json();
        const raw = json?.choices?.[0]?.message?.content;
        if (!raw) {
          throw new AIProviderError("DeepSeek returned an empty response", 502);
        }

        // `finish_reason: "length"` means the model was still going when the cap
        // was reached. Say so rather than presenting a cut-off reply as whole.
        const finishReason = json?.choices?.[0]?.finish_reason;
        const content = finishReason === "length" ? raw + TRUNCATION_NOTICE : raw;

        return {
          content,
          usage: json.usage
            ? {
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
              }
            : undefined,
          model: json.model || DEEPSEEK_MODEL,
        };
      } catch (err) {
        // A provider error we built (including the empty response) is final.
        if (err instanceof AIProviderError) throw err;
        if (options?.signal?.aborted || isAbort(err)) throw err;

        if (attempt < this.maxAttempts && isRetryableError(err)) {
          console.warn(
            `[deepseek] chat retrying after ${err instanceof Error ? err.message : "network error"} (attempt ${attempt})`,
          );
          continue;
        }

        throw err instanceof Error
          ? new AIProviderError(`DeepSeek request failed: ${err.message}`, 502)
          : new AIProviderError("DeepSeek request failed", 502);
      } finally {
        clearTimeout(timer);
        link.dispose();
      }
    }

    throw new AIProviderError("DeepSeek request failed after retrying", 502);
  }

  async *streamChat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string, void, undefined> {
    const signal = options?.signal;

    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options?.temperature ?? 0.3,
      messages,
      stream: true,
    };

    if (options?.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const link = linkAbort(signal);
      const connectTimer = setTimeout(() => link.abort(), this.connectTimeoutMs);
      // Retrying is only safe while nothing has been shown to the operator:
      // a second attempt after the first token would paste the answer twice.
      let yielded = false;

      try {
        const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: link.signal,
        });
        clearTimeout(connectTimer);

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          if (attempt < this.maxAttempts && retryableStatus(resp.status) && !signal?.aborted) {
            console.warn(
              `[deepseek] stream retrying after HTTP ${resp.status} (attempt ${attempt})`,
            );
            link.dispose();
            continue;
          }
          throw new AIProviderError(
            `DeepSeek API error ${resp.status}: ${errBody.slice(0, 500)}`,
            resp.status,
          );
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new AIProviderError("No response body for streaming", 502);

        const decoder = new TextDecoder();
        let buffer = "";
        let finishReason: string | null = null;

        let streamDone = false;
        while (!streamDone) {
          // A stopped request is not a failure: it is the caller's decision, and
          // the polite thing is to stop reading rather than to keep draining a
          // response nobody will see.
          if (signal?.aborted) return;

          const { done, value } = await readWithIdle(reader, link, this.idleTimeoutMs);
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const choice = parsed?.choices?.[0];
              const content = choice?.delta?.content;
              if (content) {
                yielded = true;
                yield content;
              }
              if (choice?.finish_reason) finishReason = choice.finish_reason;
            } catch {
              // skip unparseable chunks
            }
          }
        }

        // A reply cut off by the token limit is reported as cut off, never as a
        // finished one.
        if (finishReason === "length") {
          yield TRUNCATION_NOTICE;
        }

        return;
      } catch (err) {
        // Aborting is a stop, never a retry.
        if (signal?.aborted || isAbort(err)) return;

        if (!yielded && attempt < this.maxAttempts && isRetryableError(err)) {
          console.warn(
            `[deepseek] stream retrying after ${err instanceof Error ? err.message : "network error"} (attempt ${attempt})`,
          );
          link.dispose();
          continue;
        }

        if (err instanceof AIProviderError) throw err;
        throw err instanceof Error
          ? new AIProviderError(`DeepSeek stream failed: ${err.message}`, 502)
          : new AIProviderError("DeepSeek stream failed", 502);
      } finally {
        clearTimeout(connectTimer);
        link.dispose();
      }
    }
  }
}
