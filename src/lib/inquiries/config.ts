import { ValidationErrors, oneOf, text } from "@/lib/validate";

/**
 * Public inquiries — the landing-page "Waitlist".
 *
 * RENAMING THE FEATURE
 * --------------------
 * "Waitlist" is a working name. Everything a person READS about it comes from
 * `INQUIRY_LABELS` below, so changing it to "School Inquiry" or "Get Started" is
 * an edit to this one object. The table (`inquiries`), the routes
 * (`/api/public/inquiries`, `/super-admin/inquiries`) and the code are named for
 * what the row is, not for the label, and `INQUIRY_KIND` is the stored value that
 * says which form produced a row — it is data, not wording, and does not change
 * when the label does.
 */

export const INQUIRY_KIND = "waitlist";

export const INQUIRY_LABELS = {
  /** Super admin sidebar item and page title. */
  nav: "Partnership applications",
  pageTitle: "Partnership applications",
  pageSubtitle:
    "Schools that applied for a SchoolAid partnership. Follow up, then mark where each one stands.",
  /** Singular noun, e.g. "1 new partnership application". */
  item: "partnership application",
  dashboardCard: "New partnership applications",

  /** Landing page section. */
  eyebrow: "The partnership application",
  heading: "Let's understand your school before we transform it.",
  intro:
    "Tell us how your school runs today and where you most need improvement. Every application is reviewed, and qualified schools are invited to a discovery call.",
  messageLabel: "Anything else we should know?",
  messagePlaceholder:
    "How your school runs today, what you want digitised first, when you would like to start.",
  submit: "Submit application",
  successTitle: "Application received",
  successBody:
    "Thank you. Your application has been recorded and will be reviewed personally. We will be in touch about next steps and a discovery call.",
} as const;

export const INQUIRY_STATUSES = ["new", "contacted", "qualified", "closed"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  closed: "Closed",
};

export const INQUIRY_ROLES = [
  "owner",
  "principal",
  "administrator",
  "bursar",
  "teacher",
  "other",
] as const;

export const INQUIRY_ROLE_LABELS: Record<(typeof INQUIRY_ROLES)[number], string> = {
  owner: "School owner / proprietor",
  principal: "Principal / head teacher",
  administrator: "School administrator",
  bursar: "Bursar / accountant",
  teacher: "Teacher",
  other: "Other",
};

export const INQUIRY_SIZES = ["under_100", "100_300", "300_700", "over_700"] as const;

export const INQUIRY_SIZE_LABELS: Record<(typeof INQUIRY_SIZES)[number], string> = {
  under_100: "Under 100 students",
  "100_300": "100 – 300 students",
  "300_700": "300 – 700 students",
  over_700: "Over 700 students",
};

export const INQUIRY_LIMITS = {
  name: 100,
  email: 254,
  phone: 20,
  school: 150,
  message: 1000,
} as const;

/** Hidden form field that real people never fill in; bots usually do. */
export const HONEYPOT_FIELD = "company_website";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-.\s]{7,20}$/;

export type InquiryInput = {
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  role: (typeof INQUIRY_ROLES)[number] | null;
  school_size: (typeof INQUIRY_SIZES)[number] | null;
  message: string | null;
};

/**
 * Validates a public submission and returns ONLY the declared fields, so an
 * extra key in the payload (status, admin_notes, id...) can never reach the
 * database. Errors accumulate so the form can mark every bad field at once.
 */
export function parseInquiry(body: unknown): { value: InquiryInput | null; errors: ValidationErrors } {
  const errors = new ValidationErrors();

  const full_name = text(body, "full_name", errors, { required: true, min: 2, max: INQUIRY_LIMITS.name });
  const emailRaw = text(body, "email", errors, { required: true, max: INQUIRY_LIMITS.email });
  const phone = text(body, "phone", errors, { max: INQUIRY_LIMITS.phone });
  const school_name = text(body, "school_name", errors, { max: INQUIRY_LIMITS.school });
  const role = oneOf(body, "role", INQUIRY_ROLES, errors);
  const school_size = oneOf(body, "school_size", INQUIRY_SIZES, errors);
  const message = text(body, "message", errors, { max: INQUIRY_LIMITS.message });

  const email = emailRaw ? emailRaw.toLowerCase() : null;
  if (email && !EMAIL_RE.test(email)) errors.add("email", "must be a valid email address");
  if (phone && !PHONE_RE.test(phone)) errors.add("phone", "must be a valid phone number");

  if (!errors.ok || !full_name || !email) return { value: null, errors };

  return {
    value: { full_name, email, phone, school_name, role, school_size, message },
    errors,
  };
}
