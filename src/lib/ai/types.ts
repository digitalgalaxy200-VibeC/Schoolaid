/**
 * AI gateway types (Phase 21).
 *
 * WHY THESE TYPES EXIST SEPARATELY FROM THE ADAPTER
 * -------------------------------------------------
 * The router, the registry and the gateway must be testable without a network
 * and without a provider. Everything they touch is described here as plain data,
 * so a test can hand the router a fake route list and a fake transport and still
 * exercise the real ordering, the real fallback and the real failure
 * classification. Only the adapter knows what HTTP looks like.
 *
 * A NOTE ON `base_url`
 * --------------------
 * `base_url` is the API ROOT — the same string you would pass as `baseURL` to an
 * OpenAI SDK client. The adapter appends the resource path to it. For DeepSeek
 * that is `https://api.deepseek.com` (its `chat/completions` is served at the
 * root, and the `/v1` form is accepted only for OpenAI-SDK compatibility); for
 * OpenAI it is `https://api.openai.com/v1`. The adapter must not append a
 * version segment of its own, or OpenAI would be called at `/v1/v1/...`.
 */

export type AiCapability = "text" | "vision" | "speech_to_text" | "text_to_speech";

export const AI_CAPABILITIES: readonly AiCapability[] = [
  "text",
  "vision",
  "speech_to_text",
  "text_to_speech",
];

/** A row of `ai_providers`. Platform configuration, never tenant data. */
export type AiProviderRow = {
  id: string;
  name: string;
  label: string;
  kind: "openai_compatible";
  base_url: string;
  /** NAME of the environment variable holding the key. Never the key itself. */
  api_key_env: string;
  is_enabled: boolean;
  priority: number;
};

/** A row of `ai_provider_models`. */
export type AiModelRow = {
  id: string;
  provider_id: string;
  capability: AiCapability;
  model: string;
  is_enabled: boolean;
  priority: number;
  max_output_tokens: number | null;
};

/**
 * One usable provider + model pair. The unit the router tries.
 *
 * A route is only ever built from rows that are BOTH enabled — the provider and
 * the model — so "is this usable" is answered once, here, rather than at every
 * call site.
 */
export type AiRoute = {
  provider: AiProviderRow;
  model: AiModelRow;
};

// ---------------------------------------------------------------------------
// Request/response shapes
// ---------------------------------------------------------------------------

export type AiTextPart = { type: "text"; text: string };
export type AiImagePart = { type: "image_url"; image_url: { url: string } };
export type AiContentPart = AiTextPart | AiImagePart;

/**
 * A chat message. `content` is a string for ordinary text, or a list of parts
 * when an image is attached — which is how vision works on every
 * OpenAI-compatible provider. There is no separate vision call.
 */
export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string | AiContentPart[];
};

export type AiCallOptions = {
  maxOutputTokens?: number;
  temperature?: number;
  /** Per attempt. Without it a hung provider consumes the whole request. */
  timeoutMs?: number;
  responseFormat?: "json_object";
};

export type AiUsage = {
  /** Prompt tokens for text/vision; seconds or characters for audio. */
  inputUnits?: number;
  /** Completion tokens for text/vision; seconds or characters for audio. */
  outputUnits?: number;
};

export type AiChatResult = {
  kind: "chat";
  text: string;
  model: string;
  provider: string;
  usage?: AiUsage;
};

export type AiTranscriptionResult = {
  kind: "transcription";
  text: string;
  model: string;
  provider: string;
  usage?: AiUsage;
};

export type AiSpeechResult = {
  kind: "speech";
  audio: Uint8Array;
  mimeType: string;
  model: string;
  provider: string;
  usage?: AiUsage;
};

export type AiResult = AiChatResult | AiTranscriptionResult | AiSpeechResult;

/** What one provider attempt did, whether it worked or not. */
export type AiAttempt = {
  provider: string;
  model: string;
  ok: boolean;
  status?: number;
  error?: string;
  retryable?: boolean;
  latencyMs: number;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Configuration is absent or unusable — no secret in the environment, no
 * enabled route for the capability.
 *
 * Note what this does NOT do: it never falls back to "call it anyway". A
 * platform whose AI is not configured must refuse, not guess.
 */
export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

/** A provider refused or failed. Carries what the router needs to decide. */
export class AiProviderError extends Error {
  readonly provider: string;
  readonly status: number | null;
  readonly retryable: boolean;
  /** Truncated provider response body, for diagnosis. Never contains the key. */
  readonly detail: string | null;

  constructor(args: {
    provider: string;
    message: string;
    status?: number | null;
    retryable: boolean;
    detail?: string | null;
  }) {
    super(args.message);
    this.name = "AiProviderError";
    this.provider = args.provider;
    this.status = args.status ?? null;
    this.retryable = args.retryable;
    this.detail = args.detail ?? null;
  }
}

/** The school's credit balance will not cover the call. */
export class AiCreditsExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCreditsExhaustedError";
  }
}
