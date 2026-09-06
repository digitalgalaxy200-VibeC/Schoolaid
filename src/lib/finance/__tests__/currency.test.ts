// Currency formatting tests (FIN-002 Part K) — pure, no DB.
// Run: npm test
import { describe, it, expect } from "vitest";
import { formatMoney, formatMoneyShort, currencyDef, CURRENCY_OPTIONS } from "../currency";

describe("currency registry", () => {
  it("exposes the supported codes (NGN + XOF for Nigeria/Benin coverage)", () => {
    const codes = CURRENCY_OPTIONS.map((c) => c.code);
    expect(codes).toContain("NGN");
    expect(codes).toContain("XOF");
    expect(codes).toContain("USD");
  });
  it("falls back to NGN for unknown or missing codes", () => {
    expect(currencyDef("XXX").code).toBe("NGN");
    expect(currencyDef(null).code).toBe("NGN");
    expect(currencyDef(undefined).code).toBe("NGN");
  });
});

describe("formatMoney", () => {
  it("renders NGN with a leading symbol", () => {
    expect(formatMoney(75000, "NGN")).toBe("₦75,000");
  });
  it("renders XOF with a trailing symbol (75,000 FCFA)", () => {
    expect(formatMoney(75000, "XOF")).toBe("75,000 FCFA");
  });
  it("renders USD and GHS prefixes", () => {
    expect(formatMoney(2500, "USD")).toBe("$2,500");
    expect(formatMoney(2500, "GHS")).toBe("GH₵2,500");
  });
  it("handles zero and missing amounts", () => {
    expect(formatMoney(0, "NGN")).toBe("₦0");
    expect(formatMoney(null, "XOF")).toBe("0 FCFA");
  });
  it("defaults to NGN when no code is given", () => {
    expect(formatMoney(1000)).toBe("₦1,000");
  });
});

describe("formatMoneyShort", () => {
  it("abbreviates millions and thousands with the right symbol position", () => {
    expect(formatMoneyShort(2_500_000, "NGN")).toBe("₦2.5m");
    expect(formatMoneyShort(2_500_000, "XOF")).toBe("2.5m FCFA");
    expect(formatMoneyShort(13_000, "NGN")).toBe("₦13k");
    expect(formatMoneyShort(12_500, "XOF")).toBe("13k FCFA");
  });
  it("renders small amounts unshortened", () => {
    expect(formatMoneyShort(900, "NGN")).toBe("₦900");
  });
});
