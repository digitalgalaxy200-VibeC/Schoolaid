import { describe, it, expect } from "vitest";
import { fakeSupabase, fakeError, fakeOk } from "@/lib/ai/__tests__/fake-supabase";
import { CBT_FEATURE_KEY, readCbtEntitlement } from "../entitlement";

/**
 * The entitlement check is the switch that keeps CBT dark for a school that has
 * not been given it, so the tests are written against the POSTURE rather than
 * the happy path:
 *
 *   - no row means NO      (that is what makes shipping CBT safe)
 *   - only `true` means yes
 *   - an unreadable flag is a NO, and says so, rather than passing silently
 *   - it asks the right table, for the right school, under the right key
 *
 * The last one matters because `school_features` is shared with the AI gateway
 * and the Website Engine: a typo'd key would not fail loudly, it would quietly
 * answer "no" forever, and the feature would look broken rather than switched
 * off.
 */

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";

const answering = (row: unknown) =>
  fakeSupabase({ select: () => fakeOk(row === null ? [] : [row]) });

describe("readCbtEntitlement", () => {
  it("denies when the school has no row at all — default is NO", async () => {
    const { client } = answering(null);
    await expect(readCbtEntitlement(client, SCHOOL_ID)).resolves.toEqual({
      enabled: false,
      error: null,
    });
  });

  it("denies when the row exists but is switched off", async () => {
    const { client } = answering({ is_enabled: false });
    expect((await readCbtEntitlement(client, SCHOOL_ID)).enabled).toBe(false);
  });

  it("allows only on an explicit true", async () => {
    const { client } = answering({ is_enabled: true });
    expect(await readCbtEntitlement(client, SCHOOL_ID)).toEqual({ enabled: true, error: null });
  });

  it("does not treat a truthy value as permission", async () => {
    // A null column (row inserted without the value) must not read as "on".
    const { client } = answering({ is_enabled: null });
    expect((await readCbtEntitlement(client, SCHOOL_ID)).enabled).toBe(false);
  });

  it("fails CLOSED when the read errors, and reports why", async () => {
    const { client } = fakeSupabase({ select: () => fakeError("connection reset") });

    const result = await readCbtEntitlement(client, SCHOOL_ID);

    expect(result.enabled).toBe(false);
    expect(result.error).toContain("connection reset");
  });

  it("asks school_features for this school's cbt flag and nothing else", async () => {
    const { client, selects } = answering({ is_enabled: true });

    await readCbtEntitlement(client, SCHOOL_ID);

    expect(selects).toHaveLength(1);
    expect(selects[0].table).toBe("school_features");
    expect(selects[0].columns).toBe("is_enabled");
    expect(selects[0].filters).toEqual([
      ["school_id", SCHOOL_ID],
      ["feature_key", CBT_FEATURE_KEY],
    ]);
  });

  it("keys on 'cbt' — a different key would make the feature look broken forever", () => {
    expect(CBT_FEATURE_KEY).toBe("cbt");
  });
});
