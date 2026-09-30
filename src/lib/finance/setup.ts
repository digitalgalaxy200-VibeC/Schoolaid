// ============================================================================
// Finance — guided Setup Guide step definitions (single source of truth)
// Pure data + tiny helpers; imported by BOTH the API (which computes each
// step's real status from the school's finance data) and the wizard UI.
//
// Step kinds:
//   auto   → done is detected automatically from real records (no checkbox)
//   manual → done when the admin confirms (cannot be detected)
//   hybrid → auto-detected when possible; admin may confirm when the school
//            genuinely does not use the thing (e.g. no optional fees)
// ============================================================================

export type SetupStepDef = {
  key: string;
  title: string;
  summary: string; // one-line "what this is"
  why: string; // why it matters, in plain words
  actionLabel: string; // label of the button that jumps into the real screen
  href: string; // the real screen the admin performs the step in
  kind: "auto" | "manual" | "hybrid";
};

export const SETUP_STEPS: SetupStepDef[] = [
  {
    key: "intro",
    title: "Understand the three numbers",
    summary: "Expected, Collected and Outstanding — the whole of Finance in one picture.",
    why: "Every screen in Finance is just a different view of these three numbers. Expected = what students owe. Collected = what has arrived. Outstanding = the gap. Everything you do in this guide moves one of them.",
    actionLabel: "Open the Finance overview",
    href: "/school-admin/finance",
    kind: "manual",
  },
  {
    key: "fee_heads",
    title: "Add your fee heads",
    summary: "The list of what you charge: Tuition, Examination, Books, Bus…",
    why: "Bills are built from these. If a fee head does not exist here, it can never appear on any student's bill.",
    actionLabel: "Go to Fee Setup",
    href: "/school-admin/finance/fees",
    kind: "auto",
  },
  {
    key: "amounts",
    title: "Set amounts per class (use Bulk!)",
    summary: "Tell the system how much each class pays per fee — one class or many at once.",
    why: "This decides the money each parent owes. Use Bulk on a fee row to set ONE amount for several classes at the same time — most schools charge the same Tuition across a whole section.",
    actionLabel: "Set amounts in Fee Setup",
    href: "/school-admin/finance/fees",
    kind: "auto",
  },
  {
    key: "optional_fees",
    title: "Add optional fees",
    summary: "Fees available on request only — School Uniform, School Bus, Meal Bag…",
    why: "Optional fees never appear on a bill by themselves. A parent asks for one at the counter, and the officer adds it to THAT student only. Other students are never affected.",
    actionLabel: "Manage fees in Fee Setup",
    href: "/school-admin/finance/fees",
    kind: "hybrid",
  },
  {
    key: "currency",
    title: "Choose your currency",
    summary: "Naira (₦) by default — switch to FCFA or another currency if you operate outside Nigeria.",
    why: "The school's currency code controls the symbol shown on fees, bills, payments, receipts and reports. Nothing is hardcoded.",
    actionLabel: "Open School Profile",
    href: "/school-admin/profile",
    kind: "hybrid",
  },
  {
    key: "accounts",
    title: "Add your bank accounts",
    summary: "The accounts parents pay into — they appear on every receipt.",
    why: "Receipts tell parents where to pay. Add each account once here (bank, account name, number) and every receipt automatically shows them.",
    actionLabel: "Add accounts",
    href: "/school-admin/finance/accounts",
    kind: "hybrid",
  },
  {
    key: "bills",
    title: "Generate bills",
    summary: "Create every student's bill for this term from your fee setup.",
    why: "This is the moment 'Expected' is born. The system shows a preview first — how many students, per-fee totals — and only creates bills when you confirm. Students without a bill cannot appear in Payments.",
    actionLabel: "Go to Billing",
    href: "/school-admin/finance/billing",
    kind: "hybrid",
  },
  {
    key: "review_bill",
    title: "Review one student's bill",
    summary: "Open any student and check the items make sense.",
    why: "This is where you learn the everyday tools: adding an optional fee to just one student, granting a waiver/discount, and seeing exactly what the parent owes.",
    actionLabel: "Review a bill",
    href: "/school-admin/finance/billing",
    kind: "hybrid",
  },
  {
    key: "test_payment",
    title: "Record a test payment",
    summary: "Take ₦1,000 (or any amount) and record it against a student.",
    why: "This proves the machine works end-to-end: amount → method → bank (for transfers) → receipt generated instantly. The student's row in Payments updates immediately.",
    actionLabel: "Go to Payments",
    href: "/school-admin/finance/payments",
    kind: "hybrid",
  },
  {
    key: "dashboard",
    title: "Check the dashboard",
    summary: "Confirm the three numbers moved after your test payment.",
    why: "The dashboard is your daily health check: today's collection, Expected/Collected/Outstanding, collection rate and how many students are Paid/Partial/Unpaid — all automatic, nothing typed by hand.",
    actionLabel: "Open the Finance overview",
    href: "/school-admin/finance",
    kind: "manual",
  },
  {
    key: "daily_routine",
    title: "Your day-to-day routine",
    summary: "From tomorrow: open Payments → filter if you like → tap a student → record the money.",
    why: "That one screen is now your cashier desk. Payments land in history, receipts are one tap away (view, download or send to parent on WhatsApp), and the dashboard updates itself. You're done — welcome to Finance.",
    actionLabel: "Go to Payments",
    href: "/school-admin/finance/payments",
    kind: "manual",
  },
];

export const TOTAL_SETUP_STEPS = SETUP_STEPS.length;

/** Steps the admin may complete manually (auto-only steps are detected). */
export const canMarkManual = (def: SetupStepDef): boolean => def.kind === "manual" || def.kind === "hybrid";
