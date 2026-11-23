import type { Metadata } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { StickyBar } from "@/components/landing/StickyBar";
import { InquiryForm } from "@/components/landing/InquiryForm";
import { RevenueCalculator } from "@/components/landing/RevenueCalculator";
import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CardIcon,
  CheckCircleIcon,
  CheckIcon,
  ClipboardIcon,
  DocumentIcon,
  GlobeIcon,
  MailIcon,
  PinIcon,
  RocketIcon,
  ShieldIcon,
  UsersIcon,
  WhatsAppIcon,
} from "@/components/landing/icons";
import { PLACEHOLDERS, bookingLink, whatsappLink } from "@/lib/landing/placeholders";

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "SchoolAid — your school, digitised with you" },
  description:
    "Student records, results, CBT exams, attendance, fees and your own school website in one connected system. SchoolAid partners with your school from assessment to go-live, and stays after.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "en_NG",
    siteName: "SchoolAid",
    title: "SchoolAid — your school, digitised with you",
    description:
      "Records, results, CBT exams, attendance, fees and your school website in one connected system — with a partner who sets it up, trains your staff and supports your first term.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SchoolAid — your school, digitised with you",
    description:
      "A digital transformation partner for private schools in Nigeria, with pilot schools in Benin and Francophone Africa.",
  },
};

const APPLY = "#apply";
const BOOK = bookingLink();
const WHATSAPP = whatsappLink("Hello SchoolAid, I would like to talk about my school.");

/* ── Copy ────────────────────────────────────────────────────────────────── */

const BEFORE = [
  "Scores spread across three notebooks and a spreadsheet nobody owns",
  "Report cards compiled by hand, late into the night",
  "Parents calling the office because results are not ready",
  "Last term's records missing when a transfer is requested",
];

const AFTER = [
  "Teachers enter scores once, for the classes they teach",
  "Totals, averages, positions and comments computed as you type",
  "Report cards printed the same week, with a parent copy",
  "Every term on file and searchable for as long as the child is with you",
];

const STEPS = [
  { title: "Apply", body: "A short assessment of your school — takes under ten minutes." },
  { title: "Review", body: "We study your setup and priorities before we respond." },
  { title: "Discovery call", body: "How your school really runs, in detail, on a call." },
  { title: "Proposal", body: "Scope, timeline and cost — in writing, before you sign anything." },
  { title: "Setup & migration", body: "Configured, records moved, and your school website launched." },
  { title: "Training & go-live", body: "Staff trained on-site, supported through your first full term." },
  { title: "Continuous improvement", body: "We stay as your school grows. This is a partnership, not a transaction." },
];

const MODULES = [
  {
    key: "results",
    title: "Academic management & results",
    benefit: "Scores in once; report cards out the same week.",
    body: "Sessions and terms, classes and subjects, continuous assessment and report cards. Teachers enter scores for the classes they actually teach; the system computes totals, positions and grades.",
    Icon: DocumentIcon,
    large: true,
  },
  {
    key: "records",
    title: "Student records",
    benefit: "One student, one record, never lost.",
    body: "Registration, profiles, class allocation, history and promotion.",
    Icon: ClipboardIcon,
  },
  {
    key: "cbt",
    title: "Computer-based testing",
    benefit: "Exams sat digitally, marked automatically.",
    body: "Create exams, assign them to classes, review the results.",
    Icon: RocketIcon,
  },
  {
    key: "fees",
    title: "Fees & receipts",
    benefit: "Payments that reconcile.",
    body: "Fee structures, payments, balances and receipts.",
    Icon: CardIcon,
  },
  {
    key: "staff",
    title: "Teachers & staff",
    benefit: "Everyone works inside their own lane.",
    body: "Staff records, accounts, and class and subject assignments.",
    Icon: UsersIcon,
  },
  {
    key: "attendance",
    title: "Attendance",
    benefit: "Daily marking that adds up to insight.",
    body: "Daily records, weekly views and trends per class.",
    Icon: CalendarCheckIcon,
  },
  {
    key: "website",
    title: "Your school website",
    benefit: "A professional front door for parents.",
    body: "One page: profile, programmes, admissions and contact details.",
    Icon: GlobeIcon,
  },
];

const FAQS = [
  {
    q: "What is SchoolAid?",
    a: "A digital transformation partner for private schools. We digitise academics and administration, then stay through training and your first term.",
  },
  {
    q: "Is SchoolAid just software?",
    a: "No. We set up the system, migrate your records, train your people and support your first term.",
  },
  {
    q: "What does the one-time fee cover?",
    a: "Assessment, setup, migration of current records, your one-page website, training, and first-term support.",
  },
  {
    q: "Do we have to charge parents?",
    a: "No. It is optional. We suggest a digital services fee; your school decides the final amount.",
  },
  {
    q: "How does the monthly fee work?",
    a: "Priced per student per month, billed to the school per term in advance.",
  },
  {
    q: "Are we automatically accepted?",
    a: "No. Every application is reviewed, and qualified schools are invited to a discovery call.",
  },
];

const STAT_PILLS = [
  { value: "7", label: "modules" },
  { value: "5+", label: "years building" },
  { value: "2", label: "countries" },
  { value: "1", label: "point of contact" },
];

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function PhoneMockup() {
  const rows = [
    ["Mathematics", "84", "A"],
    ["English Language", "76", "B"],
    ["Basic Science", "81", "A"],
    ["Social Studies", "72", "B"],
    ["C.R.S", "88", "A"],
  ];

  return (
    <figure
      role="img"
      aria-label="Illustration of a sample report card showing five subjects with scores and grades, and an average of 80.2 percent."
      className="mx-auto w-full max-w-[300px]"
    >
      <div aria-hidden="true" className="rounded-[36px] bg-[#0f1f3d] p-[10px] shadow-[0_32px_80px_-20px_rgba(15,31,61,0.5)] ring-1 ring-white/5">
        <div className="rounded-[28px] bg-white px-4 pb-5 pt-3">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[#e6dfd3]" />
          <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#2a4b8d]">
            Report card
          </p>
          <p className="sa-serif mt-1 text-center text-[16px] font-semibold text-[#0f1f3d]">
            First Term · 2026/2027
          </p>
          <p className="text-center text-[11px] text-[#4a586e]">Sample student · Year 4</p>

          <div className="mt-3 overflow-hidden rounded-[10px] border border-[#e6dfd3]">
            <div className="flex items-center justify-between bg-[#f4eee4] px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[#4a586e]">
              <span>Subject</span>
              <span className="flex gap-3">
                <span>Score</span>
                <span>Grade</span>
              </span>
            </div>
            {rows.map(([subject, score, grade]) => (
              <div
                key={subject}
                className="flex items-center justify-between border-t border-[#eef0f3] px-2 py-1.5 text-[10px] text-[#0f1f3d]"
              >
                <span className="truncate">{subject}</span>
                <span className="flex gap-4 tabular-nums">
                  <span className="w-6 text-right">{score}</span>
                  <span className="w-3 text-right font-bold text-[#2a4b8d]">{grade}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[#2a4b8d] px-3 py-2.5 text-white">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Term Average</span>
            <span className="text-[14px] font-black tabular-nums">80.2%</span>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            <div className="flex-1 rounded-[8px] bg-[#eaf4ef] px-2 py-1.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#155f45]">Position</p>
              <p className="text-[14px] font-black text-[#0f1f3d]">3<span className="text-[10px] font-normal">rd</span></p>
            </div>
            <div className="flex-1 rounded-[8px] bg-[#f4eee4] px-2 py-1.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#7a5a2e]">In class</p>
              <p className="text-[14px] font-black text-[#0f1f3d]">32</p>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-[#6b7686]">
        Illustrative sample — not a real student record.
      </p>
    </figure>
  );
}

function SplitCard({
  tone,
  label,
  items,
}: {
  tone: "before" | "after";
  label: string;
  items: string[];
}) {
  const isAfter = tone === "after";
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: isAfter
          ? "linear-gradient(135deg, #eaf4ef 0%, #f0f9f4 100%)"
          : "linear-gradient(135deg, #fdf8f2 0%, #f4eee4 100%)",
        border: `1px solid ${isAfter ? "#bfdccc" : "#e0d6c6"}`,
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black"
          style={{
            background: isAfter ? "#1f7a5a" : "#b9ac97",
            color: "white",
          }}
        >
          {isAfter ? "✓" : "×"}
        </span>
        <p
          className="text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ color: isAfter ? "#155f45" : "#7a5a2e" }}
        >
          {label}
        </p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-[#243349]">
            {isAfter ? (
              <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#1f7a5a]" />
            ) : (
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9b89a]" aria-hidden="true" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────────────────── */
function SectionDivider() {
  return (
    <div className="sa-container">
      <div className="h-px bg-gradient-to-r from-transparent via-[#e6dfd3] to-transparent" />
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  const schoolsServed: string = PLACEHOLDERS.SCHOOLS_SERVED;
  const screenshotUrl: string = PLACEHOLDERS.SCREENSHOT_URL;
  const demoVideoUrl: string = PLACEHOLDERS.DEMO_VIDEO_URL;
  const schoolQuote: string = PLACEHOLDERS.SCHOOL_QUOTE;
  const schoolQuoteWho: string = PLACEHOLDERS.SCHOOL_QUOTE_ATTRIBUTION;
  const schoolLogo: string = PLACEHOLDERS.SCHOOL_LOGO_URL;

  const proofPresent = Boolean(schoolsServed || screenshotUrl || demoVideoUrl || schoolQuote);

  return (
    <div className={`${jakarta.variable} sa-site sa-mobile-clearance`}>
      <SiteHeader applyHref={APPLY} whatsappHref={WHATSAPP} />

      <main id="main">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section id="top" className="relative overflow-hidden bg-[#fbf8f2] pt-12 pb-0 sm:pt-20">
          {/* Background grid pattern */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f1f3d' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          {/* Gradient orb */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #2a4b8d 0%, transparent 70%)" }}
          />

          <div className="sa-container relative">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              {/* Left column — copy */}
              <div className="pb-10 sm:pb-16 lg:pb-24">
                {/* Eyebrow pill */}
                <div className="inline-flex items-center gap-2 rounded-full border border-[#d5c9b5] bg-white px-3.5 py-1.5 shadow-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#2a4b8d]" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#2a4b8d]">
                    Digital transformation partner for private schools
                  </span>
                </div>

                <h1 className="sa-h1 mt-5 max-w-[16ch] text-[#0f1f3d] leading-[1.1]">
                  Your school has{" "}
                  <span className="relative whitespace-nowrap">
                    outgrown paper.
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 200 12"
                      className="absolute -bottom-1 left-0 w-full"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M2 8 Q50 2 100 8 Q150 14 198 6"
                        stroke="#f5a524"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </h1>

                <p className="sa-h2 mt-4 max-w-[22ch] text-[#2a4b8d] font-semibold">
                  We&apos;ll take it digital — with you, not just at you.
                </p>

                <p className="sa-body mt-5 max-w-[46ch] text-[#4a586e] leading-relaxed">
                  Records, results, exams, attendance, fees and your school website — one connected
                  system, set up and supported by real people.
                </p>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href={APPLY} className="sa-btn sa-btn-primary">
                    Apply for school partnership
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                  {WHATSAPP ? (
                    <a
                      href={WHATSAPP}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sa-btn sa-btn-ghost"
                    >
                      <WhatsAppIcon className="h-5 w-5 text-[#1f7a5a]" />
                      Chat on WhatsApp
                    </a>
                  ) : null}
                </div>

                {/* Trust micro-row */}
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {[
                    "No lock-in contracts",
                    "Published pricing",
                    "Hands-on setup included",
                  ].map((trust) => (
                    <span key={trust} className="flex items-center gap-1.5 text-[13px] text-[#5b6676]">
                      <CheckIcon className="h-3.5 w-3.5 text-[#1f7a5a]" />
                      {trust}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-[12px] text-[#8a9aad]">
                  Nigeria · Benin Republic · Francophone Africa
                </p>
              </div>

              {/* Right column — mockup */}
              <div className="relative hidden lg:flex lg:items-end lg:justify-center lg:pb-0">
                <div className="relative">
                  {/* Floating accent bubble behind the phone */}
                  <div
                    aria-hidden="true"
                    className="absolute -top-8 -left-8 h-64 w-64 rounded-full opacity-15 blur-2xl"
                    style={{ background: "#2a4b8d" }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute -bottom-8 -right-8 h-48 w-48 rounded-full opacity-10 blur-2xl"
                    style={{ background: "#f5a524" }}
                  />
                  <div className="relative">
                    <PhoneMockup />
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile mockup — below copy on small screens */}
            <div className="mt-8 lg:hidden">
              <PhoneMockup />
            </div>
          </div>

          {/* Stats strip — pinned to bottom of hero */}
          <div className="mt-10 border-t border-[#e6dfd3] bg-white/80 backdrop-blur-sm">
            <div className="sa-container">
              <div className="grid grid-cols-2 divide-x divide-[#e6dfd3] sm:grid-cols-4">
                {STAT_PILLS.map((stat) => (
                  <div key={stat.label} className="py-4 text-center px-2">
                    <p className="text-[22px] font-black text-[#0f1f3d] sm:text-[26px]">{stat.value}</p>
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7686]">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Problem: before / after ───────────────────────────────────────── */}
        <section id="challenge" className="sa-section bg-white">
          <div className="sa-container">
            <div className="max-w-2xl">
              <p className="sa-eyebrow">The challenge</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                The last week of term decides whether results come out.
              </h2>
              <p className="sa-body mt-4 text-[#4a586e] leading-relaxed">
                Most schools manage. But managing is not the same as running well. Here is what
                the difference looks like on the ground.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <SplitCard tone="before" label="Before SchoolAid" items={BEFORE} />
              <SplitCard tone="after" label="With SchoolAid" items={AFTER} />
            </div>

            <div className="mt-8 rounded-2xl border border-[#e0d6c6] bg-[#f9f6f1] p-5 sm:p-6">
              <p className="sa-body text-[#243349] leading-relaxed max-w-[56ch]">
                <span className="font-bold text-[#0f1f3d]">Most providers hand you a login and leave.</span>{" "}
                We begin with how your school actually operates — then set up, migrate your records,
                train your staff and stay through your first full term.
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">How the partnership works</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">Seven steps, then we stay.</h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                Every school gets a structured journey — from understanding your setup to running
                your first digital results, and beyond.
              </p>
            </div>

            <div className="mt-10 grid gap-0 md:grid-cols-2 md:gap-x-12">
              {STEPS.map((step, index) => (
                <div
                  key={step.title}
                  className={`relative flex gap-4 pb-6 ${index === STEPS.length - 1 ? "pb-0" : ""}`}
                >
                  {/* Connector line — left column only connects down, last item no line */}
                  {index < STEPS.length - 1 ? (
                    <span
                      className="absolute left-[13px] top-8 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-[#2a4b8d]/30 to-transparent"
                      aria-hidden="true"
                    />
                  ) : null}
                  {/* Step badge */}
                  <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2a4b8d] text-[12px] font-black text-white shadow-md shadow-[#2a4b8d]/30">
                    {index + 1}
                  </span>
                  <div className="pb-1">
                    <p className="text-[16px] font-bold text-[#0f1f3d]">{step.title}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-[#4a586e]">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Milestone callout */}
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#e0c9a3] bg-gradient-to-r from-[#fdf3e3] to-[#fdf8ef] px-5 py-4 shadow-sm">
              <CalendarCheckIcon className="h-5 w-5 shrink-0 text-[#7a5a2e]" />
              <p className="text-[14px] font-semibold text-[#5c3f00]">
                Milestone goal: first term — results run entirely digitally.
              </p>
            </div>

            {/* We do / You bring */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2a4b8d] mb-2">
                  SchoolAid provides
                </p>
                <ul className="space-y-2">
                  {["Assessment & consultation", "System setup & configuration", "Records migration", "School website", "Staff training", "First-term support"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[14px] text-[#243349]">
                      <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#2a4b8d]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e] mb-2">
                  Your school brings
                </p>
                <ul className="space-y-2">
                  {["A dedicated point person", "Your existing records", "Time for staff training", "The willingness to start"].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[14px] text-[#243349]">
                      <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#1f7a5a]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Bento: what we digitise ──────────────────────────────────────── */}
        <section id="digitise" className="sa-section bg-white">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">What we digitise</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                One foundation. One place to look.
              </h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                Every module connects to the same student, the same term, the same record — no
                copy-pasting between systems.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
              {MODULES.map(({ key, title, benefit, body, Icon, large }) =>
                large ? (
                  <div
                    key={key}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a3570] via-[#2a4b8d] to-[#1e3a7a] p-6 text-white shadow-xl md:col-span-2 md:row-span-2"
                  >
                    {/* Decorative orb */}
                    <div
                      aria-hidden="true"
                      className="absolute -top-10 -right-10 h-48 w-48 rounded-full opacity-10 blur-3xl"
                      style={{ background: "#f5a524" }}
                    />
                    <div className="relative">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                        <Icon className="h-6 w-6 text-[#f5a524]" />
                      </div>
                      <h3 className="sa-h2 mt-5 max-w-[16ch] leading-tight text-white">
                        {title}
                      </h3>
                      <p className="mt-2 text-[15px] font-semibold text-[#ffd08a]">{benefit}</p>
                      <p className="mt-3 max-w-[42ch] text-[14px] leading-relaxed text-[#c5d3ef]">
                        {body}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    key={key}
                    className="group rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm transition-all hover:border-[#2a4b8d]/30 hover:shadow-md"
                  >
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef2fa] ring-1 ring-[#2a4b8d]/10">
                      <Icon className="h-5 w-5 text-[#2a4b8d]" />
                    </div>
                    <h3 className="mt-3 text-[15px] font-bold text-[#0f1f3d] group-hover:text-[#2a4b8d] transition-colors">
                      {title}
                    </h3>
                    <p className="mt-1 text-[13px] font-semibold text-[#2a4b8d]">{benefit}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#4a586e]">{body}</p>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Revenue calculator ───────────────────────────────────────────── */}
        <section id="revenue" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">A new revenue stream</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                Let the digital service pay for itself.
              </h2>
              <p className="sa-body mt-4 text-[#4a586e] leading-relaxed">
                Parents already pay for school services. Many schools add a small digital services
                fee — you set the amount, and keep everything above SchoolAid&apos;s rate.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm sm:p-7">
              <RevenueCalculator />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section id="pricing" className="sa-section bg-white">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">Pricing</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">Published before you apply.</h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                No surprise quotes, no hidden minimums. What you see here is what you pay —
                confirmed in writing after your application is reviewed.
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {/* Setup card */}
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-6 shadow-sm sm:p-7">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e]">
                  One-time · Setup & launch
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="sa-h1 text-[#0f1f3d]">₦100,000</p>
                </div>
                <p className="mt-1 text-[13px] text-[#6b7686]">Paid in two parts: 50% on acceptance, 50% at go-live.</p>
                <div className="my-5 h-px bg-[#e6dfd3]" />
                <ul className="space-y-3">
                  {[
                    "Assessment and consultation",
                    "Setup and academic configuration",
                    "Migration of current records",
                    "One-page school website",
                    "Staff training (on-site)",
                    "First-term support",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[#243349]">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#2a4b8d]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Per-student card — featured */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a3570] to-[#2a4b8d] p-6 text-white shadow-xl sm:p-7">
                {/* Recommended badge */}
                <div className="absolute top-5 right-5 rounded-full bg-[#f5a524] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#0f1f3d]">
                  Ongoing
                </div>
                <div
                  aria-hidden="true"
                  className="absolute -bottom-12 -right-12 h-48 w-48 rounded-full opacity-10 blur-3xl"
                  style={{ background: "#f5a524" }}
                />
                <div className="relative">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f5a524]">
                    Per student · Monthly
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <p className="sa-h1 text-white">₦400</p>
                    <span className="text-[14px] text-[#c5d3ef]">/ student / month</span>
                  </div>
                  <p className="mt-1 text-[13px] text-[#c5d3ef]">Billed per term in advance. ₦40,000 per-term minimum.</p>
                  <div className="my-5 h-px bg-white/15" />
                  <ul className="space-y-3">
                    {["Full platform access — all modules", "Ongoing technical support", "Updates and improvements", "No per-user admin fees"].map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[#e7ecf5]">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#f5a524]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={APPLY} className="sa-btn sa-btn-light mt-7 w-full">
                    Apply for school partnership
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Footer notes */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <p className="rounded-xl bg-[#f9f6f1] p-4 text-[13px] leading-relaxed text-[#4a586e]">
                <span className="font-bold text-[#0f1f3d]">Extras, quoted separately: </span>
                historical records, larger or custom websites, additional training. Domain and
                hosting renew yearly at the school&apos;s cost.
              </p>
              <p className="rounded-xl bg-[#f9f6f1] p-4 text-[13px] leading-relaxed text-[#4a586e]">
                <span className="font-bold text-[#0f1f3d]">Final pricing confirmed after review. </span>
                Submitting an application does not commit you to anything, and no money is taken
                before acceptance.
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Trust ────────────────────────────────────────────────────────── */}
        <section id="trust" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">Why schools trust SchoolAid</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                Reviewed, hands-on, and honest about what it takes.
              </h2>
            </div>

            {/* Founder card */}
            <div className="mt-8 rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm sm:flex sm:gap-6 sm:p-7">
              <div className="mb-4 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[#d5c9b5] text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-[#6b6357] sm:mb-0">
                Founder<br />photo
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#0f1f3d]">A note from the founder</p>
                <p className="mt-2 text-[15px] leading-relaxed text-[#4a586e]">
                  {PLACEHOLDERS.FOUNDER_NOTE || "[FOUNDER NOTE — one or two sentences, in your own words]"}
                </p>
              </div>
            </div>

            {/* Proof slots */}
            {proofPresent ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {schoolsServed ? (
                  <div className="flex flex-col items-start rounded-2xl border border-[#e6dfd3] bg-white p-6 shadow-sm">
                    <p className="sa-h1 text-[#0f1f3d]">{schoolsServed}</p>
                    <p className="text-[14px] text-[#4a586e] mt-1">Schools served</p>
                  </div>
                ) : null}
                {screenshotUrl ? (
                  <figure className="overflow-hidden rounded-2xl border border-[#e6dfd3] shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt="SchoolAid product screenshot"
                      loading="lazy"
                      className="h-auto w-full"
                    />
                  </figure>
                ) : null}
                {demoVideoUrl ? (
                  <figure className="overflow-hidden rounded-2xl border border-[#e6dfd3] shadow-sm">
                    <video src={demoVideoUrl} controls preload="none" className="h-auto w-full" />
                  </figure>
                ) : null}
                {schoolQuote ? (
                  <blockquote className="rounded-2xl border border-[#e6dfd3] bg-white p-6 shadow-sm">
                    {schoolLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={schoolLogo} alt="" loading="lazy" className="mb-3 h-10 w-auto" />
                    ) : null}
                    <p className="text-[15px] leading-relaxed text-[#243349]">
                      &ldquo;{schoolQuote}&rdquo;
                    </p>
                    {schoolQuoteWho ? (
                      <footer className="mt-3 text-[13px] text-[#6b6357]">{schoolQuoteWho}</footer>
                    ) : null}
                  </blockquote>
                ) : null}
              </div>
            ) : null}

            {/* Privacy */}
            <div className="mt-4 flex gap-4 rounded-2xl border border-[#e0d6c6] bg-white p-5 shadow-sm">
              <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#2a4b8d]" />
              <div>
                <p className="text-[15px] font-bold text-[#0f1f3d]">Privacy & data protection</p>
                <p className="mt-1 text-[14px] leading-relaxed text-[#4a586e]">
                  {PLACEHOLDERS.PRIVACY_TEXT ||
                    "[PRIVACY STATEMENT — how records are stored, who can access them, and what happens if a school leaves.]"}
                </p>
              </div>
            </div>

            {/* Francophone pilot */}
            <div className="mt-4 rounded-2xl border border-[#e0c9a3] bg-gradient-to-r from-[#fdf3e3] to-[#fdf8ef] p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e] mb-2">
                🌍 Francophone Africa — Pilot Programme
              </p>
              <p className="text-[14px] leading-relaxed text-[#5a5247]">
                We are adapting SchoolAid to local report cards and grading systems, and inviting a
                small number of pilot schools in Benin and Francophone Africa — with special pilot
                terms.
              </p>
            </div>
          </div>
        </section>

        {/* ── Vision ───────────────────────────────────────────────────────── */}
        <section id="vision" className="relative overflow-hidden bg-[#0f1f3d] py-16 sm:py-24 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 blur-3xl"
            style={{ background: "#f5a524" }}
          />
          <div className="sa-container relative">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f5a524]">
              Our long-term vision
            </p>
            <h2 className="sa-h2 mt-3 max-w-[22ch] leading-snug text-white">
              Every student deserves a lifelong academic record.
            </h2>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#c5d3ef]">
              Where do report cards go after graduation? Too often, a storeroom or a bin. We are
              building towards records that follow a student — for transfers, university admissions,
              scholarships and employment verification.
            </p>
            <a href={APPLY} className="sa-btn sa-btn-light mt-8 inline-flex">
              Be part of this from the start
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* ── Application ──────────────────────────────────────────────────── */}
        <section id="apply" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">The partnership application</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                Let&apos;s understand your school first.
              </h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                Two short steps about your school and how to reach you. Every application is reviewed
                personally — submitting one does not establish a partnership or commit you to any cost.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm sm:p-7">
              <InquiryForm />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section id="faq" className="sa-section bg-white">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">FAQ</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">Questions before applying.</h2>
            </div>

            <div className="mt-8 divide-y divide-[#e6dfd3] overflow-hidden rounded-2xl border border-[#e6dfd3] bg-white shadow-sm">
              {FAQS.map((item) => (
                <details key={item.q} className="group px-5 sm:px-6">
                  <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-[#0f1f3d] [&::-webkit-details-marker]:hidden">
                    <span>{item.q}</span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e6dfd3] bg-[#f9f6f1] text-[#2a4b8d] transition-all group-open:rotate-45 group-open:border-[#2a4b8d] group-open:bg-[#eef2fa]"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-[15px] leading-relaxed text-[#4a586e]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section id="contact" className="relative overflow-hidden bg-gradient-to-br from-[#f4eee4] to-[#f9f6f1] py-16 sm:py-24 border-t border-[#e6dfd3]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full opacity-20 blur-3xl"
            style={{ background: "#2a4b8d" }}
          />
          <div className="sa-container relative">
            <div className="max-w-2xl">
              <p className="sa-eyebrow">Ready to start?</p>
              <h2 className="sa-h2 mt-3 max-w-[22ch] text-[#0f1f3d] leading-snug">
                The future of your school begins with a better foundation.
              </h2>
              <p className="sa-body mt-4 max-w-[50ch] text-[#4a586e] leading-relaxed">
                Tell us where your school is today, and we will tell you honestly whether we can
                help — and what it will take.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={APPLY} className="sa-btn sa-btn-primary">
                  Apply for school partnership
                  <ArrowRightIcon className="h-4 w-4" />
                </a>
                {BOOK !== APPLY ? (
                  <a
                    href={BOOK}
                    {...(BOOK.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="sa-btn sa-btn-ghost"
                  >
                    Book a discovery call
                  </a>
                ) : null}
              </div>

              <ul className="mt-8 space-y-1">
                {WHATSAPP ? (
                  <li>
                    <a
                      href={WHATSAPP}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[48px] items-center gap-3 text-[16px] font-semibold text-[#0f1f3d] hover:text-[#2a4b8d] transition-colors"
                    >
                      <WhatsAppIcon className="h-5 w-5 text-[#1f7a5a]" />
                      WhatsApp
                    </a>
                  </li>
                ) : (
                  <li className="flex min-h-[48px] items-center gap-3 text-[16px] text-[#9aa3ad]">
                    <WhatsAppIcon className="h-5 w-5" />
                    WhatsApp — [WHATSAPP NUMBER]
                  </li>
                )}
                {PLACEHOLDERS.EMAIL ? (
                  <li>
                    <a
                      href={`mailto:${PLACEHOLDERS.EMAIL}`}
                      className="flex min-h-[48px] items-center gap-3 break-all text-[16px] font-semibold text-[#0f1f3d] hover:text-[#2a4b8d] transition-colors"
                    >
                      <MailIcon className="h-5 w-5 shrink-0 text-[#2a4b8d]" />
                      {PLACEHOLDERS.EMAIL}
                    </a>
                  </li>
                ) : (
                  <li className="flex min-h-[48px] items-center gap-3 text-[16px] text-[#9aa3ad]">
                    <MailIcon className="h-5 w-5" />
                    Email — [EMAIL]
                  </li>
                )}
                {PLACEHOLDERS.CITY_COUNTRY ? (
                  <li className="flex min-h-[48px] items-center gap-3 text-[16px] text-[#243349]">
                    <PinIcon className="h-5 w-5 text-[#2a4b8d]" />
                    {PLACEHOLDERS.CITY_COUNTRY}
                  </li>
                ) : (
                  <li className="flex min-h-[48px] items-center gap-3 text-[16px] text-[#9aa3ad]">
                    <PinIcon className="h-5 w-5" />
                    Location — [CITY/COUNTRY]
                  </li>
                )}
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="bg-[#0a1628] text-[#e7ecf5]">
        <div className="sa-container py-12 sm:py-16">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#f5a524]">
                  <CheckCircleIcon className="h-5 w-5 text-[#0f1f3d]" />
                </span>
                <span className="sa-serif text-[20px] font-bold text-white">SchoolAid</span>
              </div>
              <p className="mt-4 max-w-[34ch] text-[14px] leading-relaxed text-[#8fa3c5]">
                Empowering African schools to go digital — with a partner who sets it up, not just
                a login link.
              </p>
              <p className="mt-3 text-[12px] text-[#5d7799]">
                Nigeria · Benin Republic · Francophone Africa<br />
                English · Français (coming soon)
              </p>
            </div>

            {/* Nav */}
            <nav aria-label="Explore">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5d7799] mb-3">
                Explore
              </p>
              <ul className="space-y-0.5">
                {[
                  ["How it works", "#how-it-works"],
                  ["What we digitise", "#digitise"],
                  ["Pricing", "#pricing"],
                  ["Vision", "#vision"],
                  ["Apply", "#apply"],
                  ["FAQ", "#faq"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="flex min-h-[40px] items-center text-[14px] text-[#b4c5de] hover:text-white transition-colors"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Contact */}
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5d7799] mb-3">
                Get in touch
              </p>
              <ul className="space-y-0.5">
                {WHATSAPP ? (
                  <li>
                    <a
                      href={WHATSAPP}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-[40px] items-center gap-2 text-[14px] text-[#b4c5de] hover:text-white transition-colors"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </li>
                ) : (
                  <li className="flex min-h-[40px] items-center gap-2 text-[14px] text-[#4a607c]">
                    <WhatsAppIcon className="h-4 w-4" />
                    [WHATSAPP NUMBER]
                  </li>
                )}
                {PLACEHOLDERS.EMAIL ? (
                  <li>
                    <a
                      href={`mailto:${PLACEHOLDERS.EMAIL}`}
                      className="flex min-h-[40px] items-center gap-2 break-all text-[14px] text-[#b4c5de] hover:text-white transition-colors"
                    >
                      <MailIcon className="h-4 w-4 shrink-0" />
                      {PLACEHOLDERS.EMAIL}
                    </a>
                  </li>
                ) : (
                  <li className="flex min-h-[40px] items-center gap-2 text-[14px] text-[#4a607c]">
                    <MailIcon className="h-4 w-4" />
                    [EMAIL]
                  </li>
                )}
                <li>
                  <a
                    href="/login"
                    className="flex min-h-[40px] items-center text-[14px] text-[#b4c5de] hover:text-white transition-colors"
                  >
                    School log in →
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-1 border-t border-white/[0.07] pt-6 text-[12px] text-[#4a607c] sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} SchoolAid. All rights reserved.</p>
            <p>Applications reviewed personally. No partnership is automatic.</p>
          </div>
        </div>
      </footer>

      <StickyBar whatsappHref={WHATSAPP} />
    </div>
  );
}
