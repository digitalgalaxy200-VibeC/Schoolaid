import { describe, it, expect } from "vitest";
import {
  PLACEHOLDER_PRICING,
  aiCreditBalance,
  chargeAiCredits,
  creditsForUsage,
  getAiCreditPosition,
  grantAiCredits,
  isInsufficientCreditsError,
  sweepExpiredAiCredits,
} from "../credits";
import { AiCreditsExhaustedError } from "../types";
import { fakeSupabase, fakeError, fakeOk } from "./fake-supabase";

const SCHOOL = "11111111-1111-1111-1111-111111111111";

describe("aiCreditBalance", () => {
  it("calls the balance function for the given school", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk(25) });

    const balance = await aiCreditBalance(fake.client, SCHOOL);

    expect(balance).toBe(25);
    expect(fake.rpcs).toEqual([{ name: "ai_credit_balance", args: { p_school_id: SCHOOL } }]);
  });

  it("coerces a numeric that arrives as a string", async () => {
    // PostgREST serialises `numeric` as a string when configured to preserve
    // precision. Without coercion "12.5000" would be compared as a string.
    const fake = fakeSupabase({ rpc: () => fakeOk("12.5000") });

    const balance = await aiCreditBalance(fake.client, SCHOOL);
    expect(balance).toBe(12.5);
    expect(typeof balance).toBe("number");
  });

  it("raises rather than reporting a balance it could not read", async () => {
    const fake = fakeSupabase({ rpc: () => fakeError("permission denied for function") });

    const err = await aiCreditBalance(fake.client, SCHOOL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("permission denied for function");
  });

  it("raises on an unexpected value instead of returning NaN", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk(null) });
    const err = await aiCreditBalance(fake.client, SCHOOL).catch((e: unknown) => e);
    expect((err as Error).message).toContain("Expected a numeric value");
  });
});

describe("chargeAiCredits", () => {
  it("charges the school and returns the amount charged", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk(3) });

    const charged = await chargeAiCredits(fake.client, SCHOOL, 3);

    expect(charged).toBe(3);
    expect(fake.rpcs).toEqual([
      { name: "charge_ai_credits", args: { p_school_id: SCHOOL, p_amount: 3 } },
    ]);
  });

  it("surfaces the database's refusal as a credits-exhausted error", async () => {
    const fake = fakeSupabase({
      rpc: () => fakeError("Insufficient AI credits: 0.5000 available, 1 required"),
    });

    const err = await chargeAiCredits(fake.client, SCHOOL, 1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiCreditsExhaustedError);
  });

  it("does not disguise an unrelated database failure as exhausted credits", async () => {
    const fake = fakeSupabase({ rpc: () => fakeError("connection terminated unexpectedly") });

    const err = await chargeAiCredits(fake.client, SCHOOL, 1).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(AiCreditsExhaustedError);
    expect((err as Error).message).toContain("connection terminated unexpectedly");
  });

  it("refuses a negative charge without reaching the database", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk(0) });

    await expect(chargeAiCredits(fake.client, SCHOOL, -1)).rejects.toThrow(/not be negative/);
    // Precondition for the assertion above being meaningful: nothing was sent.
    expect(fake.rpcs).toHaveLength(0);
  });
});

describe("grantAiCredits", () => {
  it("sends every field, defaulting the optional ones to null", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk("lot-1") });

    const lotId = await grantAiCredits(fake.client, { schoolId: SCHOOL, amount: 100 });

    expect(lotId).toBe("lot-1");
    expect(fake.rpcs[0].name).toBe("grant_ai_credits");
    expect(fake.rpcs[0].args).toEqual({
      p_school_id: SCHOOL,
      p_amount: 100,
      p_source: "grant",
      p_expires_at: null,
      p_reference: null,
      p_note: null,
      p_actor_id: null,
    });
  });

  it("passes a promotional grant through unchanged", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk("lot-2") });

    await grantAiCredits(fake.client, {
      schoolId: SCHOOL,
      amount: 50,
      source: "grant",
      expiresAt: "2026-03-01T00:00:00.000Z",
      reference: "WELCOME50",
      note: "Launch promotion",
      actorId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });

    expect(fake.rpcs[0].args.p_expires_at).toBe("2026-03-01T00:00:00.000Z");
    expect(fake.rpcs[0].args.p_reference).toBe("WELCOME50");
    expect(fake.rpcs[0].args.p_actor_id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("raises when the grant fails", async () => {
    const fake = fakeSupabase({ rpc: () => fakeError("A credit grant must be a positive amount") });
    const err = await grantAiCredits(fake.client, { schoolId: SCHOOL, amount: 0 }).catch(
      (e: unknown) => e,
    );
    expect((err as Error).message).toContain("positive amount");
  });
});

describe("sweepExpiredAiCredits", () => {
  it("returns the total that lapsed", async () => {
    const fake = fakeSupabase({ rpc: () => fakeOk("7.2500") });

    const lapsed = await sweepExpiredAiCredits(fake.client, SCHOOL);
    expect(lapsed).toBe(7.25);
    expect(fake.rpcs[0].name).toBe("sweep_expired_ai_credits");
  });
});

describe("getAiCreditPosition", () => {
  it("reads the view for one school and coerces the numbers", async () => {
    const fake = fakeSupabase({
      select: () =>
        fakeOk({
          balance: "40.0000",
          promotional_balance: "10.0000",
          next_expiry: "2026-03-01T00:00:00.000Z",
          lapsed_unswept: "5.0000",
        }),
    });

    const position = await getAiCreditPosition(fake.client, SCHOOL);

    expect(position).toEqual({
      balance: 40,
      promotionalBalance: 10,
      nextExpiry: "2026-03-01T00:00:00.000Z",
      lapsedUnswept: 5,
    });
    expect(fake.selects[0].table).toBe("ai_credit_balances");
    expect(fake.selects[0].filters).toContainEqual(["school_id", SCHOOL]);
    expect(fake.selects[0].single).toBe(true);
  });

  it("reports zero for a school that has never been granted credit", async () => {
    // The view returns no row, not a row of zeros: absence is not a failure.
    const fake = fakeSupabase({ select: () => fakeOk([]) });

    const position = await getAiCreditPosition(fake.client, SCHOOL);
    expect(position).toEqual({
      balance: 0,
      promotionalBalance: 0,
      nextExpiry: null,
      lapsedUnswept: 0,
    });
  });

  it("raises when the read fails", async () => {
    const fake = fakeSupabase({ select: () => fakeError("relation does not exist") });
    const err = await getAiCreditPosition(fake.client, SCHOOL).catch((e: unknown) => e);
    expect((err as Error).message).toContain("relation does not exist");
  });
});

describe("creditsForUsage", () => {
  it("charges the placeholder rate of one credit per call", () => {
    expect(PLACEHOLDER_PRICING).toEqual({ perCall: 1 });
    expect(creditsForUsage(undefined)).toBe(1);
    expect(creditsForUsage({ inputUnits: 5000, outputUnits: 9000 })).toBe(1);
  });

  it("adds per-unit pricing when a schedule is supplied", () => {
    const pricing = { perCall: 0.5, perInputUnit: 0.001, perOutputUnit: 0.002 };

    // 0.5 + 1000*0.001 + 500*0.002 = 0.5 + 1 + 1 = 2.5
    expect(creditsForUsage({ inputUnits: 1000, outputUnits: 500 }, pricing)).toBe(2.5);
  });

  it("rounds to the column's scale, so float noise cannot reach numeric(14,4)", () => {
    const pricing = { perCall: 0, perInputUnit: 0.00001 };
    expect(creditsForUsage({ inputUnits: 3 }, pricing)).toBe(0);
    expect(creditsForUsage({ inputUnits: 150000 }, pricing)).toBe(1.5);
  });

  it("treats missing units as zero rather than NaN", () => {
    const pricing = { perCall: 2, perInputUnit: 1, perOutputUnit: 1 };
    expect(creditsForUsage({ inputUnits: 3 }, pricing)).toBe(5);
    expect(creditsForUsage(undefined, pricing)).toBe(2);
  });
});

describe("isInsufficientCreditsError", () => {
  it("recognises the database's refusal", () => {
    expect(
      isInsufficientCreditsError({ message: "Insufficient AI credits: 0 available, 1 required" }),
    ).toBe(true);
  });

  it("does not recognise anything else", () => {
    expect(isInsufficientCreditsError({ message: "permission denied" })).toBe(false);
    expect(isInsufficientCreditsError({})).toBe(false);
  });
});
