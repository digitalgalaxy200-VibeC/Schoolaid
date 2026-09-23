/**
 * AI gateway (Phase 21) — one entry point for every AI call in SchoolAid.
 *
 * THE PIPELINE, in the order the roadmap fixed it:
 *
 *     Authentication        ← already done by the route, before this is called
 *     Authorization         ← already done by the route, before this is called
 *     Tenant resolution     ← the caller passes schoolId, derived from a session
 *     Credit validation     ← here
 *     Provider selection    ← here
 *     Provider call         ← here
 *     Output validation     ← Phase 23, deliberately NOT here
 *     Application           ← by the caller
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 * It is NOT a security boundary. It takes `schoolId` from its caller and trusts
 * it. Resolving the tenant from a verified session is the route's job, and the
 * gateway's job starts only once that has happened. A feature that calls this
 * with an unverified school id has a hole that this file cannot see.
 *
 * It does not validate output either. Output validation depends on what the
 * feature asked for — a JSON question, a transcript, a suggestion — so it
 * belongs to the feature, in Phase 23. Putting a generic validator here would
 * give every caller the same useless check.
 *
 * WHY THE SERVICE CLIENT IS REQUIRED
 * ----------------------------------
 * Three of the four things it does need one: reading platform configuration
 * (deny-all RLS by design), writing the usage record, and moving credits (EXECUTE
 * granted to service_role only). It reads and writes NO tenant academic data.
 * The caller passes the client explicitly so this stays visible at the call site.
 *
 * WHAT IT DOES WITH EVERY CALL, INCLUDING THE ONES THAT DO NOTHING
 * ---------------------------------------------------------------
 * Every outcome writes an `ai_usage_events` row — success, failure, refused. A
 * school that complains "we turned AI on and nothing happens" is answered by
 * `refused_disabled` rows; a provider that is silently burning through credit
 * shows up as `failed` rows with their attempt chains. An AI system whose
 * failures are invisible is one nobody can operate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  openAiCompatibleChat,
  openAiCompatibleSpeak,
  openAiCompatibleTranscribe,
  type AudioInput,
} from "./adapters/openai-compatible";
import { loadRoutes } from "./registry";
import { describeAttempts, tryRoutes } from "./router";
import {
  PLACEHOLDER_PRICING,
  aiCreditBalance,
  chargeAiCredits,
  creditsForUsage,
  type AiPricing,
} from "./credits";
import {
  AiConfigurationError,
  type AiAttempt,
  type AiCallOptions,
  type AiMessage,
  type AiProviderRow,
  type AiResult,
  type AiRoute,
} from "./types";

export type AiCallOutcome =
  | {
      status: "success";
      result: AiResult;
      provider: string;
      model: string;
      creditsCharged: number;
      attempts: AiAttempt[];
    }
  /** No provider is configured for this capability. The normal state of AI off. */
  | { status: "refused_disabled"; reason: string }
  /** The school cannot afford the call. Nothing was spent. */
  | { status: "refused_no_credits"; balance: number }
  /** Every configured provider was tried and none succeeded. */
  | { status: "failed"; error: string; attempts: AiAttempt[] };

type CommonArgs = {
  /** The service client. See the header — never a tenant-scoped client. */
  supabase: SupabaseClient;
  /** Already derived from a verified session by the caller. */
  schoolId: string;
  /** What asked: 'question_generation', 'marking_suggestion', ... */
  feature?: string;
  actorProfileId?: string | null;
  pricing?: AiPricing;
  options?: AiCallOptions;
};

export type AiGatewayRequest = CommonArgs &
  (
    | { capability: "text" | "vision"; messages: AiMessage[] }
    | { capability: "speech_to_text"; audio: AudioInput; language?: string }
    | {
        capability: "text_to_speech";
        input: string;
        voice?: string;
        format?: "mp3" | "opus" | "wav";
      }
  );

/**
 * Writes the usage record.
 *
 * Deliberately does not throw. The AI result is the thing the user asked for,
 * and losing an audit row is less bad than losing the answer. It is logged
 * loudly instead of silently swallowed: a diagnostics gap that nobody notices is
 * how a provider ends up failing for a week without anyone knowing.
 *
 * Note that this is NOT the money record. The ledger is written inside the
 * database functions, transactionally with the balance change. A missing usage
 * row costs an operator some context; it cannot make the books wrong.
 */
async function recordUsage(
  supabase: SupabaseClient,
  row: {
    schoolId: string;
    feature?: string;
    capability: string;
    providerName?: string | null;
    model?: string | null;
    status: "success" | "failed" | "refused_no_credits" | "refused_disabled";
    inputUnits?: number | null;
    outputUnits?: number | null;
    creditsCharged?: number;
    latencyMs?: number | null;
    error?: string | null;
    actorProfileId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("ai_usage_events").insert({
    school_id: row.schoolId,
    feature: row.feature ?? null,
    capability: row.capability,
    provider_name: row.providerName ?? null,
    model: row.model ?? null,
    status: row.status,
    input_units: row.inputUnits ?? null,
    output_units: row.outputUnits ?? null,
    credits_charged: row.creditsCharged ?? 0,
    latency_ms: row.latencyMs ?? null,
    error: row.error ?? null,
    actor_profile_id: row.actorProfileId ?? null,
  });

  if (error) {
    console.error(
      `[ai/gateway] could not record AI usage (${row.status}, school ${row.schoolId}): ${error.message}`,
    );
  }
}

/** Dispatches one route to the adapter. The only place capability meets transport. */
function callRoute(
  route: AiRoute,
  request: AiGatewayRequest,
): Promise<AiResult> {
  const { provider, model } = route;

  const connection: {
    provider: string;
    baseUrl: string;
    apiKeyEnv: string;
    model: string;
    options?: AiCallOptions;
  } = {
    provider: provider.name,
    baseUrl: provider.base_url,
    apiKeyEnv: provider.api_key_env,
    model: model.model,
    // A per-model ceiling in configuration is the floor the caller cannot raise:
    // the column exists so an operator can cap cost without a deployment.
    options: {
      ...request.options,
      maxOutputTokens:
        model.max_output_tokens ?? request.options?.maxOutputTokens,
    },
  };

  switch (request.capability) {
    case "text":
    case "vision":
      return openAiCompatibleChat({ ...connection, messages: request.messages }).then(
        (r): AiResult => ({
          kind: "chat",
          text: r.text,
          model: r.model,
          provider: provider.name,
          usage: r.usage,
        }),
      );

    case "speech_to_text":
      return openAiCompatibleTranscribe({
        ...connection,
        audio: request.audio,
        language: request.language,
      }).then(
        (r): AiResult => ({
          kind: "transcription",
          text: r.text,
          model: r.model,
          provider: provider.name,
          usage: r.usage,
        }),
      );

    case "text_to_speech":
      return openAiCompatibleSpeak({
        ...connection,
        input: request.input,
        voice: request.voice,
        format: request.format,
      }).then(
        (r): AiResult => ({
          kind: "speech",
          audio: r.audio,
          mimeType: r.mimeType,
          model: r.model,
          provider: provider.name,
        }),
      );
  }
}

/**
 * Runs one AI call.
 *
 * Refusal is a normal outcome, not an exception: "AI is off" and "you have no
 * credits" are states the product is expected to handle, and a caller that has
 * to catch an exception to render an ordinary message will eventually forget to.
 */
export async function runAiCall(request: AiGatewayRequest): Promise<AiCallOutcome> {
  const startedAt = Date.now();

  // 1. Which providers may serve this capability?
  let routes: AiRoute[];
  try {
    routes = await loadRoutes(request.supabase, request.capability);
  } catch (err) {
    const message =
      err instanceof AiConfigurationError
        ? err.message
        : `Could not load AI provider configuration: ${err instanceof Error ? err.message : String(err)}`;

    await recordUsage(request.supabase, {
      schoolId: request.schoolId,
      feature: request.feature,
      capability: request.capability,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: message,
      actorProfileId: request.actorProfileId,
    });

    return { status: "failed", error: message, attempts: [] };
  }

  if (routes.length === 0) {
    await recordUsage(request.supabase, {
      schoolId: request.schoolId,
      feature: request.feature,
      capability: request.capability,
      status: "refused_disabled",
      latencyMs: Date.now() - startedAt,
      actorProfileId: request.actorProfileId,
    });

    return {
      status: "refused_disabled",
      reason: `No AI provider is enabled for ${request.capability}`,
    };
  }

  // 2. Can the school afford it? The fixed part of the price is known in
  //    advance, so a school that cannot cover even that is refused before a
  //    provider is called. The variable part (tokens) is settled after, because
  //    it is only known then.
  const pricing = request.pricing ?? PLACEHOLDER_PRICING;
  const requiredUpFront = pricing.perCall;
  let charged = 0;

  try {
    const balance = await aiCreditBalance(request.supabase, request.schoolId);

    if (balance < requiredUpFront) {
      await recordUsage(request.supabase, {
        schoolId: request.schoolId,
        feature: request.feature,
        capability: request.capability,
        status: "refused_no_credits",
        latencyMs: Date.now() - startedAt,
        actorProfileId: request.actorProfileId,
      });
      return { status: "refused_no_credits", balance };
    }
  } catch (err) {
    const message = `Could not read the AI credit balance: ${err instanceof Error ? err.message : String(err)}`;

    await recordUsage(request.supabase, {
      schoolId: request.schoolId,
      feature: request.feature,
      capability: request.capability,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: message,
      actorProfileId: request.actorProfileId,
    });

    return { status: "failed", error: message, attempts: [] };
  }

  // 3. Try providers in order, falling back.
  const outcome = await tryRoutes({
    routes,
    attempt: (route) => callRoute(route, request),
  });

  if (!outcome.ok) {
    const summary = describeAttempts(outcome.attempts);
    const last = outcome.attempts[outcome.attempts.length - 1];

    await recordUsage(request.supabase, {
      schoolId: request.schoolId,
      feature: request.feature,
      capability: request.capability,
      providerName: last?.provider ?? null,
      model: last?.model ?? null,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      error: `${outcome.error.message} — attempts: ${summary}`,
      actorProfileId: request.actorProfileId,
    });

    return { status: "failed", error: outcome.error.message, attempts: outcome.attempts };
  }

  const result = outcome.value;
  const usage = result.kind === "speech" ? undefined : result.usage;

  // 4. Settle the charge. The balance was checked a moment ago, so a failure
  //    here means a concurrent call took the credit first. The answer has
  //    already been produced and is not thrown away: giving away one call is
  //    bounded and visible, while a reservation that fails to release is a
  //    school locked out of a feature it paid for. The usage row records that
  //    nothing was charged.
  let chargeError: string | null = null;
  try {
    charged = await chargeAiCredits(
      request.supabase,
      request.schoolId,
      creditsForUsage(usage, pricing),
    );
  } catch (err) {
    chargeError = err instanceof Error ? err.message : String(err);
    console.error(
      `[ai/gateway] call succeeded but could not be charged (school ${request.schoolId}, ` +
        `${outcome.route.provider.name}/${outcome.route.model.model}): ${chargeError}`,
    );
  }

  await recordUsage(request.supabase, {
    schoolId: request.schoolId,
    feature: request.feature,
    capability: request.capability,
    providerName: outcome.route.provider.name,
    model: outcome.route.model.model,
    status: "success",
    inputUnits: usage?.inputUnits ?? null,
    outputUnits: usage?.outputUnits ?? null,
    creditsCharged: charged,
    latencyMs: Date.now() - startedAt,
    error: chargeError ? `Not charged: ${chargeError}` : null,
    actorProfileId: request.actorProfileId,
  });

  return {
    status: "success",
    result,
    provider: outcome.route.provider.name,
    model: outcome.route.model.model,
    creditsCharged: charged,
    attempts: outcome.attempts,
  };
}

/** Convenience for a route deciding what to tell a user. */
export function outcomeNotice(outcome: AiCallOutcome): string | null {
  switch (outcome.status) {
    case "success":
      return null;
    case "refused_disabled":
      return "AI features are not enabled for this school yet.";
    case "refused_no_credits":
      return "This school has run out of AI credits.";
    case "failed":
      return "The AI service could not complete this request. Please try again.";
  }
}

/** Re-exported so features do not import types from two places. */
export type { AiProviderRow, AiResult, AiAttempt, AiCallOptions, AiMessage };
