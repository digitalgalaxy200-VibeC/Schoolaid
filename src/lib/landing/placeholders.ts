/**
 * Landing page — everything only the school can supply.
 *
 * WHY A SINGLE FILE
 * -----------------
 * A marketing page must never invent a fact. Anything the owner has not given us
 * is declared here as an empty string, and the page HIDES elements whose value is
 * empty rather than rendering a broken link or a fake figure. To turn a feature
 * on, fill the value below — no other file changes.
 *
 * Each entry says what to supply. Anything left empty is listed in the delivery
 * notes as outstanding.
 */
export const PLACEHOLDERS = {
  /** Digits only, international format, e.g. "2348012345678". Empty = hide all WhatsApp UI. */
  WHATSAPP_NUMBER: "",

  /** e.g. "hello@schoolaid.online". Empty = hide the email row. */
  EMAIL: "",

  /** e.g. "Lagos, Nigeria". Empty = hide the location row. */
  CITY_COUNTRY: "",

  /** A real booking page (Cal.com, Calendly…). Empty = "Book a call" opens WhatsApp instead. */
  BOOKING_URL: "",

  /** One or two sentences in your own voice, shown beside the founder photo. */
  FOUNDER_NOTE: "",

  /** Your privacy and data-protection commitment, in full. */
  PRIVACY_TEXT: "",

  /** A real number, e.g. "12". Empty = "schools served" figure hidden. */
  SCHOOLS_SERVED: "",

  /** Public URLs for real assets. Empty = the whole proof tile is hidden. */
  SCREENSHOT_URL: "",
  DEMO_VIDEO_URL: "",
  SCHOOL_LOGO_URL: "",
  SCHOOL_QUOTE: "",
  SCHOOL_QUOTE_ATTRIBUTION: "",
} as const;

/** `wa.me` deep link for the configured number, or null when none is set. */
export function whatsappLink(message?: string): string | null {
  const digits = PLACEHOLDERS.WHATSAPP_NUMBER.replace(/[^0-9]/g, "");
  if (digits.length < 7) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

/**
 * "Book a discovery call" — a real booking page when one exists, WhatsApp when a
 * number exists, and the application form as the last resort. It must never be a
 * link that quietly does nothing, which is why the fallbacks are explicit here.
 */
export function bookingLink(): string {
  if (PLACEHOLDERS.BOOKING_URL.trim()) return PLACEHOLDERS.BOOKING_URL.trim();
  const wa = whatsappLink("Hello SchoolAid, I would like to book a discovery call about my school.");
  if (wa) return wa;
  return "#apply";
}

export function hasWhatsApp(): boolean {
  return whatsappLink() !== null;
}
