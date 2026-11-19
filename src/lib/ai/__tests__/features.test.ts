import { describe, it, expect } from "vitest";
import { resolveAiEntitlement } from "../features";

/**
 * The rule that decides whether a school's AI features light up.
 *
 * These cases exist because the two flags drifted: the CBT import read only
 * `ai`, while the switch an administrator actually flips on the schools screen
 * writes `ai_import`. A school that had been granted AI import then saw the
 * upload option greyed out. The precedence below is what keeps that from
 * coming back, and from being over-corrected into "the kill switch does not
 * work".
 */
describe("resolveAiEntitlement", () => {
  it("is on when the master `ai` row is on", () => {
    expect(resolveAiEntitlement([{ feature_key: "ai", is_enabled: true }])).toBe(true);
  });

  it("is off when there are no ai rows at all", () => {
    expect(resolveAiEntitlement([])).toBe(false);
    expect(resolveAiEntitlement([{ feature_key: "cbt", is_enabled: true }])).toBe(false);
  });

  it("honours the legacy `ai_import` grant when no master row exists", () => {
    // The reported bug: this school had ai_import = true and no `ai` row, and
    // its CBT AI import stayed disabled.
    expect(resolveAiEntitlement([{ feature_key: "ai_import", is_enabled: true }])).toBe(true);
  });

  it("lets the master row's OFF win over a legacy grant", () => {
    // The AI page's per-school switch must be a real kill switch: an old
    // ai_import row must not quietly keep AI on for a school just switched off.
    expect(
      resolveAiEntitlement([
        { feature_key: "ai", is_enabled: false },
        { feature_key: "ai_import", is_enabled: true },
      ]),
    ).toBe(false);
  });

  it("treats a null flag as off", () => {
    expect(resolveAiEntitlement([{ feature_key: "ai", is_enabled: null }])).toBe(false);
    expect(resolveAiEntitlement([{ feature_key: "ai_import", is_enabled: null }])).toBe(false);
  });

  it("does not accept a legacy row that has since been switched off", () => {
    expect(resolveAiEntitlement([{ feature_key: "ai_import", is_enabled: false }])).toBe(false);
  });
});
