// WhatsApp phone normalization tests (FIN-002 Part L) — pure, no DB.
// Run: npm test
import { describe, it, expect } from "vitest";
import { normalizeWhatsAppNumber, whatsAppLink } from "../phone";

describe("normalizeWhatsAppNumber", () => {
  it("keeps bare international digits", () => {
    expect(normalizeWhatsAppNumber("2348031234567")).toBe("2348031234567");
  });
  it("strips spaces, dashes, parens and the leading +", () => {
    expect(normalizeWhatsAppNumber("+234 803-123-4567")).toBe("2348031234567");
  });
  it("converts a local 0-trunk number using the default country (Nigeria)", () => {
    expect(normalizeWhatsAppNumber("08031234567")).toBe("2348031234567");
  });
  it("strips the 00 international prefix", () => {
    expect(normalizeWhatsAppNumber("002348031234567")).toBe("2348031234567");
  });
  it("returns null for empty/garbage numbers", () => {
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber("not a phone")).toBeNull();
    expect(normalizeWhatsAppNumber("123")).toBeNull(); // too short
  });
});

describe("whatsAppLink", () => {
  it("builds a wa.me URL with an encoded message", () => {
    const link = whatsAppLink("08031234567", "Dear Parent, payment received. Thank you.");
    expect(link).toBe("https://wa.me/2348031234567?text=Dear%20Parent%2C%20payment%20received.%20Thank%20you.");
  });
  it("builds a bare link without a message", () => {
    expect(whatsAppLink("+2348031234567")).toBe("https://wa.me/2348031234567");
  });
  it("returns null when the phone cannot be normalized", () => {
    expect(whatsAppLink("n/a")).toBeNull();
    expect(whatsAppLink(null, "msg")).toBeNull();
  });
});
