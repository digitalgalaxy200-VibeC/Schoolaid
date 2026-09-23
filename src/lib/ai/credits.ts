/**
 * AI credits (Phase 22) — the ONLY place a school's credit balance may move.
 *
 * WHY THIS IS A WRAPPER AND NOT AN IMPLEMENTATION
 * ----------------------------------------------
 * Spending credits is a read-then-write: find the lots with credit, then
 * decrement them. Implemented here, two AI calls for the same school arriving
 * together would both read the same balance and both succeed — the school gets
 * two answers and pays for one. A balance is money; it cannot be settled with a
 * check the application performs a moment before the write.
 *
 * So the arithmetic lives in Postgres (migration 051), where each operation is a
 * single statement and the row locks it takes hold for its whole duration. These
 * functions call those functions. They must NOT re-derive a balance, "optimise"
 * a charge, or trust a cached number — every one of those is the bug the
 * database functions exist to make impossible.
 *
 * WHICH CLIENT
 * ------------
 * The four RPCs are SECURITY DEFINER with EXECUTE revoked from public, anon and
 * authenticated, and granted only to `service_role`. A tenant token calling them
 * gets a permission error. Pass the service client.
 *
 * The one exception is `getAiCreditPosition`, which reads the
 * `ai_credit_balances` view. That view is `security_invoker`, so it runs as the
 * caller and the staff SELECT policy on `ai_credit_lots` applies — a teacher or
 * school admin token can read their OWN school's position without a privileged
 * client. That is the intended read path for a dashboard.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AiCreditsExhaustedError, type AiUsage } from "./types";

/**
 * Postgres `numeric` may arrive as a number or, when configured to preserve
 * precision, as a string. Coercing in one place means no caller has to care, and
 * no balance is ever compared as the string "0".
 */
function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`Expected a numeric value from the database, received: ${String(value)}`);
}

// ---------------------------------------------------------------------------
// Pricing — PENDING (O7)
// ---------------------------------------------------------------------------

/**
 * How many credits one unit of work costs.
 *
 * THIS IS A PLACEHOLDER AND IT IS DELIBERATELY THE ONLY ONE. The real pricing —
 * per call, per 1k tokens, different per capability, different for a promotional
 * trial — is an open product decision (O7) that has not been made. Inventing a
 * plausible-looking schedule and burying it in the gateway would put a made-up
 * number in the path of real money.
 *
 * So: one credit per call until the schedule is decided. When it is, this shape
 * is what changes and nothing else does — every charge goes through
 * `creditsForUsage`.
 */
export type AiPricing = {
  perCall: number;
  perInputUnit?: number;
  perOutputUnit?: number;
};

export const PLACEHOLDER_PRICING: AiPricing = { perCall: 1 };

const CREDIT_SCALE = 10_000; // numeric(14,4)

function roundToCreditScale(value: number): number {
  return Math.round(value * CREDIT_SCALE) / CREDIT_SCALE;
}

export function creditsForUsage(
  usage: AiUsage | undefined,
  pricing: AiPricing = PLACEHOLDER_PRICING,
): number {
  const perUnit =
    (usage?.inputUnits ?? 0) * (pricing.perInputUnit ?? 0) +
    (usage?.outputUnits ?? 0) * (pricing.perOutputUnit ?? 0);
  return roundToCreditScale(pricing.perCall + perUnit);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The spendable balance, with lapsed credit already swept. */
export async function aiCreditBalance(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("ai_credit_balance", { p_school_id: schoolId });
  if (error) throw new Error(`Could not read AI credit balance: ${error.message}`);
  return toNumber(data);
}

export type AiCreditPosition = {
  balance: number;
  /** Of the balance, the part that will expire. */
  promotionalBalance: number;
  /** When the next lot lapses, so a school can be warned. Null when none expires. */
  nextExpiry: string | null;
  /**
   * Credit already past its date that nothing has looked at yet. Reporting only:
   * it is not spendable, and reading the balance sweeps it.
   */
  lapsedUnswept: number;
};

/**
 * The balance plus its breakdown, for a dashboard.
 *
 * Reads the view rather than calling the RPC because the breakdown has nowhere
 * else to come from. Note the ordering consequence: `ai_credit_balance` sweeps
 * first, this does not — so a caller showing both would do well to read the
 * balance first. Sweeping is what `sweepExpiredAiCredits` is for.
 */
export async function getAiCreditPosition(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<AiCreditPosition> {
  const { data, error } = await supabase
    .from("ai_credit_balances")
    .select("balance, promotional_balance, next_expiry, lapsed_unswept")
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) throw new Error(`Could not read AI credit position: ${error.message}`);

  // No row means no lot has ever been granted: a zero balance, not an error.
  if (!data) {
    return { balance: 0, promotionalBalance: 0, nextExpiry: null, lapsedUnswept: 0 };
  }

  const row = data as {
    balance: unknown;
    promotional_balance: unknown;
    next_expiry: string | null;
    lapsed_unswept: unknown;
  };

  return {
    balance: toNumber(row.balance),
    promotionalBalance: toNumber(row.promotional_balance),
    nextExpiry: row.next_expiry,
    lapsedUnswept: toNumber(row.lapsed_unswept),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Grants credits and returns the lot id.
 *
 * A grant and its ledger entry are created in one statement by the database
 * function; there is no window in which credits exist without a record of where
 * they came from.
 */
export async function grantAiCredits(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    amount: number;
    source?: "grant" | "purchase" | "adjustment" | "refund";
    expiresAt?: string | null;
    reference?: string | null;
    note?: string | null;
    actorId?: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("grant_ai_credits", {
    p_school_id: args.schoolId,
    p_amount: args.amount,
    p_source: args.source ?? "grant",
    p_expires_at: args.expiresAt ?? null,
    p_reference: args.reference ?? null,
    p_note: args.note ?? null,
    p_actor_id: args.actorId ?? null,
  });

  if (error) throw new Error(`Could not grant AI credits: ${error.message}`);
  return String(data);
}

/**
 * Charges the school, drawing from the lot that expires soonest.
 *
 * The database refuses a charge the balance cannot cover, so this cannot
 * half-charge. Callers should still check the balance first — this is the
 * backstop, not the user-facing decision.
 */
export async function chargeAiCredits(
  supabase: SupabaseClient,
  schoolId: string,
  amount: number,
): Promise<number> {
  if (amount < 0) throw new Error("A charge must not be negative");

  const { data, error } = await supabase.rpc("charge_ai_credits", {
    p_school_id: schoolId,
    p_amount: amount,
  });

  if (error) {
    if (isInsufficientCreditsError(error)) {
      throw new AiCreditsExhaustedError(error.message);
    }
    throw new Error(`Could not charge AI credits: ${error.message}`);
  }

  return toNumber(data);
}

/** Turns lapsed lots into expiry entries. Returns the total that lapsed. */
export async function sweepExpiredAiCredits(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("sweep_expired_ai_credits", {
    p_school_id: schoolId,
  });
  if (error) throw new Error(`Could not sweep AI credits: ${error.message}`);
  return toNumber(data);
}

/**
 * Recognises the database's "not enough credit" refusal.
 *
 * This matches on the message, which is not ideal, because a plpgsql
 * `raise exception` carries no code of its own that distinguishes it from any
 * other error. It is a convenience for callers that want to explain *why* a call
 * failed; the real control is the balance check before spending, so nothing
 * correct depends on this recognising the case.
 */
export function isInsufficientCreditsError(error: {
  message?: string;
  code?: string;
}): boolean {
  return typeof error.message === "string" && error.message.includes("Insufficient AI credits");
}
