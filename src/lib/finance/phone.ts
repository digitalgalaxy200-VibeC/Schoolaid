// ============================================================================
// Finance — parent delivery: WhatsApp phone normalization (pure, client-safe)
// A student's stored parent_phone is free text ("0803…", "+234 803 …",
// "01 234 5678", "00229 …"). WhatsApp needs bare international digits.
// Default country: 234 (Nigeria) — local "0…" trunk numbers are prefixed with
// it. This helper NEVER sends anything; it only builds the wa.me destination.
// ============================================================================

/**
 * Normalize a stored phone number into bare international digits suitable for
 * https://wa.me/<digits>. Returns null when the number is unusable.
 *  - "+234 803 123 4567" → "2348031234567"
 *  - "08031234567"       → "2348031234567"  (local trunk → default country)
 *  - "002348031234567"   → "2348031234567"  (00 international prefix)
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined, defaultCountry = "234"): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) return digits.slice(2).length >= 7 && digits.slice(2).length <= 15 ? digits.slice(2) : null;
  if (digits.startsWith("0") && digits.length <= 11) {
    const international = defaultCountry + digits.slice(1);
    return international.length >= 7 && international.length <= 15 ? international : null;
  }
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/**
 * Build a wa.me link with an optional pre-filled message.
 * Returns null when the phone cannot be normalized (the caller hides the
 * button) — a WhatsApp hiccup can never affect an already-recorded payment.
 */
export function whatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const digits = normalizeWhatsAppNumber(phone);
  if (!digits) return null;
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
