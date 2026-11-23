/* eslint-disable @next/next/no-page-custom-font */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { InquiryForm } from "@/components/landing/InquiryForm";

// Public marketing page. A conversion-first rewrite of the Stitch landing page:
// same design tokens (namespaced "lp-" in globals.css), different story.
//
// THE STORY, IN ONE LINE: most school software is sold as a login and abandoned,
// so this page sells the PARTNERSHIP — assessment, setup, migration, training and
// a supported first term — and prices it openly.
//
// Every section answers a question a school owner actually asks, in the order
// they ask it: "is this about me?" (challenge) → "who are you?" → "what happens
// if I say yes?" (process) → "what do I get?" (modules) → "what does it cost?"
// → "can we afford it?" (the digital-services fee) → "am I a fit?" → "why trust
// you?" → "let's start" (application).
//
// PLACEHOLDERS: the copy supplied had bracketed values that only the school can
// confirm (years in operation, fee amounts, data-protection wording, team photo,
// counts, video). The fee figures supplied are used as given; the "[Add …]"
// items are deliberately NOT invented — a marketing page must not claim a fact
// nobody verified. They are listed for the owner to supply.

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-lp",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "SchoolAid — your school, digitised with you" },
  description:
    "Student records, results, CBT exams, attendance, fees and your own school website in one connected system. SchoolAid partners with your school from assessment to go-live, and stays after.",
  // The root layout marks the whole app noindex; the public landing page should be found.
  robots: { index: true, follow: true },
};

/* The two calls to action, used identically everywhere so the promise never
   changes between sections. Both point at the same place: the application. */
const APPLY_HREF = "#apply";
const CALL_HREF = "#apply";

function PrimaryCta({ children = "Apply for school partnership" }: { children?: ReactNode }) {
  return (
    <a
      className="inline-flex items-center justify-center min-h-[52px] px-7 text-lp-label-lg bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim rounded-lp-lg shadow-lp-md transition-all font-bold"
      href={APPLY_HREF}
    >
      {children}
    </a>
  );
}

function SecondaryCta({ children = "Book a discovery call" }: { children?: ReactNode }) {
  return (
    <a
      className="inline-flex items-center justify-center min-h-[52px] px-7 text-lp-label-lg bg-lp-surface-container-highest text-lp-primary hover:bg-lp-surface-dim rounded-lp-lg transition-all font-semibold"
      href={CALL_HREF}
    >
      {children}
    </a>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-lp-label-sm uppercase tracking-[0.14em] text-lp-secondary">{children}</p>
  );
}

function SectionIntro({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "max-w-3xl mx-auto text-center" : "max-w-3xl"}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-lp-headline-lg text-lp-primary tracking-tight">{title}</h2>
      {lead ? <p className="mt-4 text-lp-body-lg text-lp-on-surface-variant">{lead}</p> : null}
    </div>
  );
}

const PAINS = [
  "Student information scattered across files and registers",
  "Teachers calculating scores and preparing results by hand",
  "Hours lost every term compiling report cards",
  "Exam questions, assessments and results managed separately",
  "Fees, payments and receipts that never quite reconcile",
  "A record from three years ago that nobody can find",
];

const STEPS = [
  {
    title: "Apply",
    body: "Tell us about your school. Ten to fifteen minutes, and it is a real assessment rather than a contact form.",
  },
  {
    title: "Assessment & review",
    body: "We study your profile, your challenges and what you want fixed first.",
  },
  {
    title: "Discovery call",
    body: "A conversation to understand how your school actually operates, in detail.",
  },
  {
    title: "Partnership proposal",
    body: "A tailored plan — scope, timeline and cost — before anything is signed.",
  },
  {
    title: "Setup & migration",
    body: "We configure the system, organise your records and launch your school website.",
  },
  {
    title: "Training & go-live",
    body: "We train your teachers and administrators, and support you through your first term.",
  },
  {
    title: "Continuous improvement",
    body: "As your school grows, the system grows with it. We stay.",
  },
];

const MODULES = [
  {
    title: "Student administration & records",
    body: "Replace scattered files with one organised student database: registration, profiles, class allocation, history, promotion and academic records.",
  },
  {
    title: "Academic management & results",
    body: "Sessions and terms, classes and subjects, continuous assessment, teacher score entry, automated computation, grading and report cards. Teachers see their assigned classes, enter scores, and the system does the rest.",
  },
  {
    title: "Computer-based testing",
    body: "Create exams, assign them to classes, let students sit them digitally — objective questions are marked automatically.",
  },
  {
    title: "Teacher & staff management",
    body: "Staff records, teacher accounts, and class and subject assignments, so every teacher works inside their own responsibilities.",
  },
  {
    title: "Attendance",
    body: "Daily marking, attendance records, weekly views and the insights a head teacher actually uses.",
  },
  {
    title: "Fees, payments & receipts",
    body: "Fee structures, payment recording, balances, receipts and payment history — financial records you can trust.",
  },
  {
    title: "Your school website",
    body: "Your launch includes a professional one-page site: your profile, programmes, admissions information and contact details, so parents can find you online.",
  },
];

const FIT = [
  "Relies heavily on paper-based administration",
  "Uses Excel for important records",
  "Prepares student results manually",
  "Wants to introduce computer-based exams",
  "Wants teachers to manage academic work more easily",
  "Needs an organised student database",
  "Wants a professional school website",
  "Is ready to invest time in going digital",
];

const TRUST = [
  "Five years building and running school systems.",
  "Reviewed partnerships, not mass signups — we choose schools carefully so each one gets real attention.",
  "A school-centred approach: we understand how you operate before changing anything.",
  "Hands-on support through setup, migration, training and your first term, with real people.",
  "Transparent pricing: you see the structure before you apply.",
  "Your records stay yours.",
];

const FAQS = [
  {
    q: "What is SchoolAid?",
    a: "A digital transformation partner for private schools. We digitise academics and administration through connected systems, and support you through the change rather than leaving you with a login.",
  },
  {
    q: "Which schools can apply?",
    a: "Private nursery, primary and secondary schools. Nigeria is our main market now, and we are accepting pilot schools in Benin and Francophone Africa.",
  },
  {
    q: "Is SchoolAid just software?",
    a: "No. We set up your system, migrate your records, train your people and support your first term.",
  },
  {
    q: "What does the one-time fee cover?",
    a: "Assessment, setup, migration of your current records, your one-page school website, training, and first-term support.",
  },
  {
    q: "What is included in the website?",
    a: "A professional one-page school website with your profile, programmes, admissions information and contact details. Larger or custom sites are quoted separately.",
  },
  {
    q: "Do we have to charge parents?",
    a: "No. It is optional. We give a suggested fee for the digital services parents receive; your school decides the final amount.",
  },
  {
    q: "How does the monthly fee work?",
    a: "It is priced per student per month and billed to the school per term, in advance.",
  },
  {
    q: "Does my school need to be tech-savvy?",
    a: "No. Schools at every stage of digital readiness can apply — we start from where you are.",
  },
  {
    q: "Can teachers manage their own work?",
    a: "Yes. Teachers get their own accounts, their class and subject assignments, and score entry scoped to what they actually teach.",
  },
  {
    q: "Can we run exams digitally?",
    a: "Yes. The CBT module covers creating exams, assigning them to classes, students sitting them, and reviewing the results.",
  },
  {
    q: "Will teachers struggle with the change?",
    a: "We train your staff and support your first term. We recommend starting with results and adding other modules as your team gets comfortable.",
  },
  {
    q: "Are we automatically accepted?",
    a: "No. Every application is reviewed, and qualified schools are invited to a discovery call.",
  },
];

export default function Home() {
  return (
    <div className={`${jakarta.variable} lp-root bg-lp-surface text-lp-on-surface antialiased`}>
      {/* Icon font for the landing page only (React hoists this into <head>) */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        precedence="default"
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 w-full z-50 bg-lp-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-20 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between gap-6">
          <a className="flex items-center gap-3" href="#hero">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lp-xl bg-lp-primary-container text-white">
              <span className="material-symbols-outlined text-[20px]">school</span>
            </span>
            <span className="text-lp-headline-sm text-lp-primary tracking-tight">SchoolAid</span>
          </a>

          <nav className="hidden lg:flex items-center gap-6">
            {[
              ["Home", "#hero"],
              ["How it works", "#how-it-works"],
              ["What we digitise", "#digitise"],
              ["Pricing", "#pricing"],
              ["Our vision", "#vision"],
              ["Contact", "#contact"],
            ].map(([label, href]) => (
              <a
                key={href}
                className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors"
                href={href}
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              className="hidden sm:inline-flex items-center justify-center min-h-[48px] px-5 text-lp-label-md text-lp-primary hover:bg-lp-surface-container-high transition-all rounded-lp-lg"
              href="/login"
            >
              Log in
            </a>
            <a
              className="inline-flex items-center justify-center min-h-[48px] px-6 text-lp-label-md bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim font-bold shadow-lp-sm transition-all rounded-lp-lg"
              href={APPLY_HREF}
            >
              Apply
            </a>
          </div>
        </div>
      </header>

      <main className="pt-20">
        {/* ── 1. Hero ──────────────────────────────────────────────────────── */}
        <section
          id="hero"
          className="relative w-full overflow-hidden bg-gradient-to-b from-lp-surface via-lp-surface-container-low to-lp-surface py-16 lg:py-24"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
              <div className="lg:col-span-7 flex flex-col items-start space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lp-surface-container-high shadow-lp-sm">
                  <span className="text-base leading-none">🇳🇬 🇬🇭</span>
                  <span className="text-lp-label-sm text-lp-primary uppercase tracking-wide">
                    Digital transformation partner for private schools
                  </span>
                </div>

                <h1 className="text-lp-headline-xl text-lp-primary tracking-tight">
                  Your school has outgrown paper.{" "}
                  <span className="text-lp-secondary">We&apos;ll take it digital, with you.</span>
                </h1>

                <p className="text-lp-body-lg text-lp-on-surface-variant max-w-2xl">
                  Student records, results, exams, attendance, fees and your own school website — all
                  in one connected system. SchoolAid partners with your school from assessment to
                  go-live, and stays with you after.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
                  <PrimaryCta />
                  <SecondaryCta />
                </div>

                <p className="text-lp-body-md text-lp-on-surface-variant max-w-xl">
                  Built and refined over five years of working with schools. Every application is
                  personally reviewed.
                </p>
              </div>

              {/* What the partnership includes — the promise, at a glance. */}
              <div className="lg:col-span-5">
                <div className="rounded-lp-xl bg-lp-surface-container-lowest border border-lp-outline-variant shadow-lp-lg p-6 lg:p-8">
                  <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-secondary">
                    What going live includes
                  </p>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Assessment of how your school runs today",
                      "Full system setup and academic configuration",
                      "Migration of your current student records",
                      "Your one-page school website",
                      "Teacher and administrator training",
                      "First-term go-live support",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span
                          className="material-symbols-outlined text-[20px] text-lp-primary-container shrink-0"
                          aria-hidden="true"
                        >
                          check_circle
                        </span>
                        <span className="text-lp-body-md text-lp-on-surface">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 text-lp-label-md text-lp-on-surface-variant">
                    One-time setup, then a per-student rate. No hidden modules.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 2. The challenge ─────────────────────────────────────────────── */}
        <section id="challenge" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <SectionIntro
              eyebrow="The challenge"
              title="Your school has grown. Have your systems grown with it?"
              lead="Hundreds of students. Many teachers. Several classes. And behind it all: notebooks, paper files and spreadsheets."
            />

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
              {PAINS.map((pain, index) => (
                <div
                  key={pain}
                  className="flex items-start gap-4 rounded-lp-lg bg-lp-surface-container-low border border-lp-outline-variant p-5"
                >
                  <span className="text-lp-headline-sm text-lp-secondary tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-lp-body-md text-lp-on-surface">{pain}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 max-w-3xl space-y-4">
              <p className="text-lp-body-lg text-lp-on-surface-variant">
                These are not small inconveniences. They slow your school down and put your
                institution&apos;s memory at risk.
              </p>
              <p className="text-lp-body-lg text-lp-primary font-semibold">
                Your school deserves systems that support its growth, not processes that hold it
                back.
              </p>
            </div>
          </div>
        </section>

        {/* ── 3. Who we are ────────────────────────────────────────────────── */}
        <section id="about" className="py-16 lg:py-24 bg-lp-surface-container-low">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <SectionIntro eyebrow="Who we are" title="We don't hand you software and disappear." />
            </div>
            <div className="lg:col-span-7 space-y-5">
              <p className="text-lp-body-lg text-lp-on-surface-variant">
                Most providers give you a login and leave. Schools quietly go back to paper.
              </p>
              <p className="text-lp-body-lg text-lp-on-surface">
                SchoolAid does the opposite. We begin by understanding how your school actually
                operates. Then we set up your systems, move your records, train your people and
                support you through your first term — so the switch actually sticks.
              </p>
              <p className="text-lp-headline-sm text-lp-primary">
                Going digital is hard. We do the hard part with you.
              </p>
            </div>
          </div>
        </section>

        {/* ── 4. How the partnership works ─────────────────────────────────── */}
        <section id="how-it-works" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <SectionIntro
              eyebrow="How the partnership works"
              title="A clear process, built around your school."
            />

            <ol className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-lp-xl bg-lp-surface-container-lowest border border-lp-outline-variant p-6 shadow-lp-sm"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-lp-primary-container text-white text-lp-label-md font-bold">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lp-headline-sm text-lp-primary">{step.title}</h3>
                  <p className="mt-2 text-lp-body-md text-lp-on-surface-variant">{step.body}</p>
                </li>
              ))}
              <li className="rounded-lp-xl bg-lp-primary-container p-6 text-lp-on-primary">
                <h3 className="text-lp-headline-sm">Both sides commit</h3>
                <p className="mt-2 text-lp-body-md text-lp-on-primary-container">
                  It is a partnership, not a purchase. You bring a point person, your records, time
                  for training and the will to start. We bring everything else.
                </p>
              </li>
            </ol>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lp-lg bg-lp-surface-container-low border border-lp-outline-variant p-6">
                <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-secondary">
                  What we do
                </p>
                <p className="mt-3 text-lp-body-md text-lp-on-surface">
                  Assessment · System setup · Records migration · School website · Teacher and admin
                  training · First-term support · Ongoing support
                </p>
              </div>
              <div className="rounded-lp-lg bg-lp-surface-container-low border border-lp-outline-variant p-6">
                <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-secondary">
                  What your school brings
                </p>
                <p className="mt-3 text-lp-body-md text-lp-on-surface">
                  A point person to lead the transition · Your student and academic records · Time
                  for staff training · A willingness to start
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. What we digitise ──────────────────────────────────────────── */}
        <section id="digitise" className="py-16 lg:py-24 bg-lp-surface-container-low">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <SectionIntro
              eyebrow="What we digitise"
              title="One connected digital foundation for your entire school."
            />

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODULES.map((module) => (
                <div
                  key={module.title}
                  className="rounded-lp-xl bg-lp-surface-container-lowest border border-lp-outline-variant p-6 shadow-lp-sm"
                >
                  <h3 className="text-lp-headline-sm text-lp-primary">{module.title}</h3>
                  <p className="mt-2 text-lp-body-md text-lp-on-surface-variant">{module.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. A new revenue stream ──────────────────────────────────────── */}
        <section id="revenue" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5">
              <SectionIntro
                eyebrow="A new revenue stream"
                title="Go digital, and let it pay for itself."
                lead="Most school software is a cost. SchoolAid can be an opportunity."
              />
            </div>

            <div className="lg:col-span-7 space-y-6">
              <p className="text-lp-body-lg text-lp-on-surface-variant">
                When your school goes digital, parents get online access to results, school
                information and communication. That is a real service, and many schools charge a
                small digital services fee for it.
              </p>
              <p className="text-lp-body-lg text-lp-on-surface">
                We give you a suggested fee to charge parents. You decide the final amount, and
                anything you collect above our rate is your school&apos;s additional income.
              </p>

              <div className="rounded-lp-xl border border-lp-outline-variant bg-lp-surface-container-lowest overflow-hidden">
                <div className="px-6 py-4 bg-lp-surface-container-high">
                  <p className="text-lp-label-sm uppercase tracking-[0.1em] text-lp-primary">
                    Illustration — a school of 50 students, per term
                  </p>
                </div>
                <table className="w-full text-left">
                  <tbody className="divide-y divide-lp-outline-variant">
                    <tr>
                      <td className="px-6 py-4 text-lp-body-md text-lp-on-surface-variant">
                        Suggested parent fee (₦1,000 per student per month)
                      </td>
                      <td className="px-6 py-4 text-lp-body-md text-lp-on-surface text-right tabular-nums">
                        ₦150,000
                      </td>
                    </tr>
                    <tr>
                      <td className="px-6 py-4 text-lp-body-md text-lp-on-surface-variant">
                        SchoolAid platform fee (₦400 per student per month)
                      </td>
                      <td className="px-6 py-4 text-lp-body-md text-lp-on-surface text-right tabular-nums">
                        ₦60,000
                      </td>
                    </tr>
                    <tr className="bg-lp-surface-container-low">
                      <td className="px-6 py-4 text-lp-body-md font-bold text-lp-primary">
                        Additional income for your school
                      </td>
                      <td className="px-6 py-4 text-lp-body-md font-bold text-lp-primary text-right tabular-nums">
                        ₦90,000
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-lp-label-sm text-lp-on-surface-variant">
                Figures are illustrative. Your school sets its own fees.
              </p>
            </div>
          </div>
        </section>

        {/* ── 7. Pricing ───────────────────────────────────────────────────── */}
        <section id="pricing" className="py-16 lg:py-24 bg-lp-surface-container-low">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <SectionIntro
              eyebrow="Pricing"
              title="Simple, transparent, built for partnership."
              lead="You see the structure before you apply. Final pricing is confirmed after your application is reviewed and may vary with your school's size and needs."
            />

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lp-xl bg-lp-surface-container-lowest border border-lp-outline-variant p-8 shadow-lp-sm">
                <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-secondary">
                  One-time setup & launch
                </p>
                <p className="mt-3 text-lp-headline-xl text-lp-primary">₦100,000</p>
                <p className="mt-2 text-lp-body-md text-lp-on-surface-variant">
                  Everything needed to get your school live:
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    "School assessment and consultation",
                    "System setup and academic configuration",
                    "Migration of your current student records",
                    "Your one-page school website",
                    "Training for teachers and administrators",
                    "First-term go-live support",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span
                        className="material-symbols-outlined text-[18px] text-lp-primary-container shrink-0"
                        aria-hidden="true"
                      >
                        check
                      </span>
                      <span className="text-lp-body-md text-lp-on-surface">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lp-xl bg-lp-primary-container text-lp-on-primary p-8 shadow-lp-md">
                <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-on-primary-container">
                  Then, per student
                </p>
                <p className="mt-3 text-lp-headline-xl">
                  ₦400 <span className="text-lp-headline-sm font-normal">per student / month</span>
                </p>
                <p className="mt-2 text-lp-body-md text-lp-on-primary-container">
                  Billed per term, in advance, to match how your school collects fees. Minimum
                  platform fee of ₦40,000 per term.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    "Full platform access: records, results, CBT, attendance, fees",
                    "Ongoing support",
                    "Updates and improvements",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[18px] shrink-0" aria-hidden="true">
                        check
                      </span>
                      <span className="text-lp-body-md">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  <a
                    className="inline-flex w-full items-center justify-center min-h-[52px] px-6 text-lp-label-lg bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim rounded-lp-lg font-bold transition-all"
                    href={APPLY_HREF}
                  >
                    Apply for school partnership
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lp-lg bg-lp-surface-container-lowest border border-lp-outline-variant p-6">
                <p className="text-lp-label-sm uppercase tracking-[0.1em] text-lp-primary">
                  Optional extras, quoted separately
                </p>
                <p className="mt-2 text-lp-body-md text-lp-on-surface-variant">
                  Migration of historical records · Larger or custom websites · Additional training
                </p>
                <p className="mt-3 text-lp-body-md text-lp-on-surface-variant">
                  Domain and hosting renew yearly at the school&apos;s own cost, paid directly to the
                  provider.
                </p>
              </div>
              <div className="rounded-lp-lg bg-lp-surface-container-lowest border border-lp-outline-variant p-6">
                <p className="text-lp-label-sm uppercase tracking-[0.1em] text-lp-primary">Payment</p>
                <p className="mt-2 text-lp-body-md text-lp-on-surface-variant">
                  Setup fee split: 50% on acceptance, 50% at go-live. Platform fees are billed per
                  term, in advance.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 8. Who should partner ────────────────────────────────────────── */}
        <section id="who" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <SectionIntro
                eyebrow="Who should partner with us"
                title="We're looking for schools ready to move forward."
                lead="Our partnership is for private nursery, primary and secondary schools that want to improve how they operate."
              />
            </div>
            <div className="lg:col-span-7">
              <p className="text-lp-label-sm uppercase tracking-[0.12em] text-lp-secondary">
                A strong fit if your school…
              </p>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FIT.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-lp-lg bg-lp-surface-container-low border border-lp-outline-variant p-4"
                  >
                    <span
                      className="material-symbols-outlined text-[18px] text-lp-primary-container shrink-0"
                      aria-hidden="true"
                    >
                      check_circle
                    </span>
                    <span className="text-lp-body-md text-lp-on-surface">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-lp-body-lg text-lp-primary font-semibold">
                You don&apos;t need everything figured out. You only need to be willing to start.
              </p>
            </div>
          </div>
        </section>

        {/* ── 9. Why schools trust SchoolAid ───────────────────────────────── */}
        <section id="trust" className="py-16 lg:py-24 bg-lp-surface-container-low">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <SectionIntro eyebrow="Why schools trust SchoolAid" title="Reviewed, hands-on, and honest about what it takes." />
            <ul className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4">
              {TRUST.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lp-lg bg-lp-surface-container-lowest border border-lp-outline-variant p-5"
                >
                  <span
                    className="material-symbols-outlined text-[20px] text-lp-primary-container shrink-0"
                    aria-hidden="true"
                  >
                    verified
                  </span>
                  <span className="text-lp-body-md text-lp-on-surface">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 10. Vision ───────────────────────────────────────────────────── */}
        <section id="vision" className="py-16 lg:py-24 bg-lp-primary-container text-lp-on-primary">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <p className="text-lp-label-sm uppercase tracking-[0.14em] text-lp-on-primary-container">
              Our long-term vision
            </p>
            <h2 className="mt-3 max-w-3xl text-lp-headline-lg tracking-tight">
              Every student deserves a lifelong academic record.
            </h2>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-7 space-y-4 text-lp-body-lg text-lp-on-primary-container">
                <p>
                  What happens to a student&apos;s report cards after graduation? Too often, they sit
                  in a storeroom or disappear.
                </p>
                <p className="text-lp-on-primary">
                  We&apos;re building towards a future where every student&apos;s academic history is
                  securely preserved in a lifelong digital record.
                </p>
              </div>
              <div className="lg:col-span-5">
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    "School transfers",
                    "University admissions",
                    "Scholarship applications",
                    "Career guidance",
                    "Employment verification",
                    "Lifelong learning",
                  ].map((item) => (
                    <li
                      key={item}
                      className="rounded-lp-lg bg-white/10 border border-white/20 px-4 py-2.5 text-lp-label-md"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-8 text-lp-headline-sm">
              Education is a lifelong journey. Their records should last too.
            </p>
          </div>
        </section>

        {/* ── 11. The application ──────────────────────────────────────────── */}
        <section id="apply" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-4">
              <SectionIntro
                eyebrow="The partnership application"
                title="Let's understand your school before we transform it."
                lead="This isn't a basic form. It's a structured digital transformation assessment covering your school's identity and location, ownership and academic structure, student and staff population, how you operate today, your current digital tools, where you most need improvement, and your readiness to begin."
              />
              <p className="inline-flex items-center gap-2 rounded-full bg-lp-surface-container-high px-4 py-2 text-lp-label-md text-lp-primary">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  schedule
                </span>
                Takes 10 to 15 minutes
              </p>
              <p className="text-lp-body-md text-lp-on-surface-variant">
                Every application is reviewed. Submitting an application does not automatically
                establish an active partnership.
              </p>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-lp-xl bg-lp-surface-container-lowest border border-lp-outline-variant p-6 lg:p-8 shadow-lp-md">
                <InquiryForm />
              </div>
            </div>
          </div>
        </section>

        {/* ── 12. Pilot schools ────────────────────────────────────────────── */}
        <section id="pilot" className="py-16 lg:py-20 bg-lp-surface-container-low">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="rounded-lp-xl border border-lp-secondary-fixed-dim bg-lp-surface-container-lowest p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-8">
                <Eyebrow>Francophone Africa</Eyebrow>
                <h2 className="mt-3 text-lp-headline-md text-lp-primary">
                  Now accepting pilot schools in Benin and Francophone Africa.
                </h2>
                <p className="mt-3 text-lp-body-lg text-lp-on-surface-variant">
                  We&apos;re expanding to Francophone schools and adapting SchoolAid to local report
                  cards and grading systems. We&apos;re inviting a small number of pilot schools to go
                  digital with us and help shape how the system serves them, with special pilot
                  terms.
                </p>
              </div>
              <div className="lg:col-span-4 lg:text-right">
                <a
                  className="inline-flex items-center justify-center min-h-[52px] px-7 text-lp-label-lg bg-lp-primary-container text-white hover:bg-lp-primary rounded-lp-lg font-bold transition-all"
                  href={APPLY_HREF}
                >
                  Apply as a pilot school
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── 13. FAQ ──────────────────────────────────────────────────────── */}
        <section id="faq" className="py-16 lg:py-24 bg-lp-surface">
          <div className="max-w-4xl mx-auto px-6 lg:px-12">
            <SectionIntro eyebrow="FAQ" title="Questions schools ask before applying." align="center" />

            <div className="mt-10 space-y-3">
              {FAQS.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-lp-lg bg-lp-surface-container-lowest border border-lp-outline-variant p-5"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-lp-label-lg text-lp-on-surface marker:content-none">
                    {item.q}
                    <span
                      className="material-symbols-outlined text-lp-primary transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      add
                    </span>
                  </summary>
                  <p className="mt-3 text-lp-body-md text-lp-on-surface-variant">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── 14. Final call to action ─────────────────────────────────────── */}
        <section id="contact" className="py-16 lg:py-24 bg-lp-surface-container-low">
          <div className="max-w-4xl mx-auto px-6 lg:px-12 text-center">
            <h2 className="text-lp-headline-lg text-lp-primary tracking-tight">
              The future of your school begins with a better foundation.
            </h2>
            <p className="mt-4 text-lp-body-lg text-lp-on-surface-variant">
              You&apos;ve spent years educating students, developing teachers and building a
              community. Now build the digital systems that protect and support all of it.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-4">
              <PrimaryCta />
              <SecondaryCta />
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-lp-inverse-surface text-lp-inverse-on-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lp-xl bg-lp-primary-container text-white">
                  <span className="material-symbols-outlined text-[20px]">school</span>
                </span>
                <span className="text-lp-headline-sm">SchoolAid</span>
              </div>
              <p className="mt-4 text-lp-body-md opacity-80">
                Empowering schools to go digital — with a partner, not just a login.
              </p>
              <p className="mt-4 text-lp-label-md opacity-70">
                Nigeria · Benin Republic · Francophone Africa · English | French (coming soon)
              </p>
            </div>

            <div className="md:col-span-4">
              <p className="text-lp-label-sm uppercase tracking-[0.12em] opacity-70">Explore</p>
              <ul className="mt-3 space-y-2">
                {[
                  ["How it works", "#how-it-works"],
                  ["What we digitise", "#digitise"],
                  ["Pricing", "#pricing"],
                  ["Our vision", "#vision"],
                  ["Apply", "#apply"],
                  ["FAQ", "#faq"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <a className="text-lp-body-md opacity-80 hover:opacity-100" href={href}>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-3">
              <p className="text-lp-label-sm uppercase tracking-[0.12em] opacity-70">Get in touch</p>
              <p className="mt-3 text-lp-body-md opacity-80">
                Apply through the assessment and we will reply personally.
              </p>
              <a
                className="mt-4 inline-flex items-center justify-center min-h-[48px] px-6 text-lp-label-md bg-lp-secondary-container text-lp-on-secondary-container rounded-lp-lg font-bold"
                href={APPLY_HREF}
              >
                Apply for school partnership
              </a>
            </div>
          </div>

          <div className="mt-10 border-t border-white/15 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-lp-label-sm opacity-70">© SchoolAid. All rights reserved.</p>
            <div className="flex items-center gap-4 text-lp-label-sm opacity-70">
              <a className="hover:opacity-100" href="/login">
                Log in
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
