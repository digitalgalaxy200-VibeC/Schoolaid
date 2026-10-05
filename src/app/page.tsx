/* eslint-disable @next/next/no-img-element, @next/next/no-page-custom-font */
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

// Public marketing page. Ported from the Stitch design in design/landing-page/.
// Its colour/type tokens are namespaced "lp-" in globals.css so they never touch
// the app's own design system.

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-lp",
  display: "swap",
});

export const metadata: Metadata = {
  title: { absolute: "SchoolAid — Your entire school, in one simple tool" },
  description:
    "Report cards, CBT exams, fee management and a school website — one platform for West African schools.",
  // The root layout marks the whole app noindex; the public landing page should be found.
  robots: { index: true, follow: true },
};

// TODO: point at the real demo / sales contact (form, WhatsApp or mailto) before launch.
const DEMO_HREF = "#";

export default function Home() {
  return (
    <div className={`${jakarta.variable} lp-root bg-lp-surface text-lp-on-surface antialiased`}>
      {/* Icon font for the landing page only (React hoists this into <head>) */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        precedence="default"
      />
<header className="fixed top-0 left-0 w-full z-50 bg-lp-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="h-20 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between gap-6"><div className="flex items-center gap-8"><a className="flex items-center gap-3" href="#hero"><span className="inline-flex h-9 w-9 items-center justify-center rounded-lp-xl bg-lp-primary-container text-white"><span className="material-symbols-outlined text-[20px]">school</span></span><span className="text-lp-headline-sm text-lp-primary tracking-tight">SchoolAid</span></a><nav className="hidden lg:flex items-center gap-6"><a className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors" href="#features">Features</a><a className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors" href="#roles">Roles</a><a className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors" href="#school-website">School Website</a><a className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors" href="#pricing">Pricing</a><a className="text-lp-label-md text-lp-on-surface-variant hover:text-lp-on-surface transition-colors" href="#faq">FAQ</a></nav></div><div className="flex items-center gap-4"><a className="hidden sm:inline-flex items-center justify-center min-h-[48px] px-5 text-lp-label-md text-lp-primary hover:bg-lp-surface-container-high hover:text-lp-on-surface transition-all rounded-lp-lg" href="/login">Log in</a><a className="inline-flex items-center justify-center min-h-[48px] px-6 text-lp-label-md bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim font-bold shadow-lp-sm transition-all rounded-lp-lg" href={DEMO_HREF}>Request a demo</a><div className="w-8 h-8 rounded-full bg-lp-primary flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-lp-on-primary text-[18px]">person</span></div></div></div></header><main className="w-full pt-20 bg-lp-surface"><div className="flex flex-col w-full">

<section id="hero" className="relative w-full overflow-hidden bg-gradient-to-b from-lp-surface via-lp-surface-container-low to-lp-surface py-16 lg:py-24">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

<div className="lg:col-span-6 flex flex-col items-start space-y-6">
<div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-lp-surface-container-high shadow-lp-sm">
<span className="text-base leading-none">🇳🇬 🇬🇭</span>
<span className="text-lp-label-sm text-lp-primary uppercase tracking-wide">Built for Nigerian &amp; Ghanaian Schools</span>
</div>
<h1 className="text-lp-headline-xl! text-lp-primary! tracking-tight!">
            Your entire school, in <span className="text-lp-secondary">one simple tool.</span>
</h1>
<p className="text-lp-body-lg text-lp-on-surface-variant max-w-xl">
            Automate termly report cards, manage WAEC/BECE aligned CBT exams, reconcile bursary fee ledgers in minutes, and launch your school&apos;s official website—all unified under one authoritative platform.
          </p>
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto pt-2">
<a className="inline-flex items-center justify-center min-h-[52px] px-8 text-lp-label-lg bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim rounded-lp-lg shadow-lp-md transition-all font-bold group" href={DEMO_HREF}>
<span>Request a Demo</span>
<span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
</a>
<a className="inline-flex items-center justify-center min-h-[52px] px-7 text-lp-label-lg bg-lp-surface-container-lowest text-lp-primary hover:bg-lp-surface-container-high rounded-lp-lg shadow-lp-sm transition-all font-bold" href="/login">
<span className="material-symbols-outlined mr-2 text-[20px]">login</span>
<span>Log in to Portal</span>
</a>
</div>

<div className="pt-6 flex flex-wrap items-center gap-6">
<div className="flex items-center gap-2">
<div className="w-7 h-7 rounded-full bg-lp-surface-container-highest flex items-center justify-center text-lp-primary">
<span className="material-symbols-outlined text-[16px]">domain_verification</span>
</div>
<span className="text-lp-label-md text-lp-on-surface-variant">Multi-Tenant Isolation</span>
</div>
<div className="flex items-center gap-2">
<div className="w-7 h-7 rounded-full bg-lp-surface-container-highest flex items-center justify-center text-lp-secondary">
<span className="material-symbols-outlined text-[16px]">verified</span>
</div>
<span className="text-lp-label-md text-lp-on-surface-variant">NDPR &amp; Act 843 Compliant</span>
</div>
<div className="flex items-center gap-2">
<div className="w-7 h-7 rounded-full bg-lp-surface-container-highest flex items-center justify-center text-lp-primary">
<span className="material-symbols-outlined text-[16px]">offline_bolt</span>
</div>
<span className="text-lp-label-md text-lp-on-surface-variant">Optimized for 2G/3G Speeds</span>
</div>
</div>
</div>

<div className="lg:col-span-6 relative flex items-center justify-center lg:justify-end">

<div className="absolute -top-12 -right-12 w-96 h-96 bg-lp-primary-container/15 rounded-full blur-3xl pointer-events-none"></div>
<div className="absolute -bottom-8 -left-8 w-72 h-72 bg-lp-secondary-container/20 rounded-full blur-2xl pointer-events-none"></div>
<div className="relative w-full max-w-lg lg:max-w-none">

<div className="bg-lp-surface-container-lowest rounded-lp-xl shadow-xl p-6 relative z-10">

<div className="flex items-center justify-between pb-4 mb-4 bg-lp-surface-container-low px-4 py-2.5 -mx-6 -mt-6 rounded-t-lp-xl">
<div className="flex items-center gap-2">
<span className="w-2.5 h-2.5 rounded-full bg-lp-error"></span>
<span className="w-2.5 h-2.5 rounded-full bg-lp-secondary-container"></span>
<span className="w-2.5 h-2.5 rounded-full bg-lp-primary-container"></span>
<span className="text-lp-label-sm text-lp-on-surface-variant ml-2">SchoolAid Admin Console · St. Gregory&apos;s College</span>
</div>
<span className="inline-flex items-center gap-1 text-lp-label-sm bg-lp-surface-container-highest text-lp-primary px-2.5 py-0.5 rounded-full">
<span className="w-1.5 h-1.5 rounded-full bg-lp-primary animate-pulse"></span> Term 2 Live
                </span>
</div>

<div className="grid grid-cols-3 gap-3 mb-4">
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<p className="text-lp-label-sm text-lp-on-surface-variant">Total Roster</p>
<p className="text-lp-headline-md text-lp-primary mt-0.5">1,428</p>
<p className="text-lp-label-sm text-lp-secondary mt-0.5 flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">trending_up</span>+4.2% vs Term 1
                  </p>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<p className="text-lp-label-sm text-lp-on-surface-variant">Fees Reconciled</p>
<p className="text-lp-headline-md text-lp-on-surface mt-0.5">₦62.4M</p>
<span className="inline-block mt-0.5 text-lp-label-sm text-lp-primary">89.2% cleared</span>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<p className="text-lp-label-sm text-lp-on-surface-variant">Broadsheets</p>
<p className="text-lp-headline-md text-lp-secondary mt-0.5">38 / 42</p>
<span className="inline-block mt-0.5 text-lp-label-sm text-lp-on-surface-variant">90% signed</span>
</div>
</div>

<div className="bg-lp-surface-container-low p-4 rounded-lp-lg">
<div className="flex items-center justify-between mb-2">
<span className="text-lp-label-md text-lp-on-surface">Weekly Attendance &amp; CBT Activity</span>
<span className="text-lp-label-sm text-lp-primary">SS1 to SS3</span>
</div>
<svg className="w-full h-24 overflow-visible" fill="none" viewBox="0 0 360 80">
<defs>
<linearGradient gradientUnits="userSpaceOnUse" id="chartGrad" x1="0" x2="0" y1="0" y2="80">
<stop stopColor="#2A4B8D" stopOpacity="0.3"></stop>
<stop offset="1" stopColor="#2A4B8D" stopOpacity="0"></stop>
</linearGradient>
</defs>
<path d="M0 60 C40 55, 60 40, 100 42 C140 44, 160 20, 200 24 C240 28, 270 10, 310 12 C330 13, 350 5, 360 4 L360 80 L0 80 Z" fill="url(#chartGrad)"></path>
<path d="M0 60 C40 55, 60 40, 100 42 C140 44, 160 20, 200 24 C240 28, 270 10, 310 12 C330 13, 350 5, 360 4" stroke="#0A3375" strokeLinecap="round" strokeWidth="2.5"></path>
<circle cx="200" cy="24" fill="#FEB245" r="4"></circle>
<circle cx="310" cy="12" fill="#0A3375" r="4"></circle>
</svg>
</div>
</div>

<div className="absolute -top-8 -left-6 w-72 sm:w-80 bg-lp-surface-container-lowest rounded-lp-xl shadow-2xl p-4 z-20 hidden sm:block">
<div className="flex items-center justify-between pb-2 border-b border-lp-surface-container">
<div className="flex items-center gap-2">
<div className="w-6 h-6 rounded bg-lp-primary text-lp-on-primary font-bold flex items-center justify-center text-xs">SG</div>
<span className="text-lp-label-md text-lp-primary font-bold">Terminal Dossier</span>
</div>
<span className="px-2 py-0.5 rounded-full bg-lp-surface-container-high text-lp-primary text-lp-label-sm">Class 1st</span>
</div>
<div className="mt-2.5 space-y-1.5 text-lp-label-sm">
<div className="flex justify-between text-lp-on-surface">
<span className="text-lp-on-surface-variant">Further Maths (SS2)</span>
<span className="font-bold text-lp-primary">94% · A1</span>
</div>
<div className="w-full bg-lp-surface-container h-1.5 rounded-full overflow-hidden">
<div className="bg-lp-primary h-full w-[94%] rounded-full"></div>
</div>
<div className="flex justify-between text-lp-on-surface pt-1">
<span className="text-lp-on-surface-variant">English Language</span>
<span className="font-bold text-lp-secondary">88% · A1</span>
</div>
<div className="w-full bg-lp-surface-container h-1.5 rounded-full overflow-hidden">
<div className="bg-lp-secondary-container h-full w-[88%] rounded-full"></div>
</div>
</div>
<div className="mt-3 pt-2 border-t border-lp-surface-container flex items-center justify-between">
<span className="text-lp-label-sm text-lp-on-surface-variant">Principal Sign-off</span>
<span className="material-symbols-outlined text-lp-primary text-[18px]">verified</span>
</div>
</div>

<div className="absolute -bottom-6 -right-6 w-64 bg-lp-surface-container-lowest rounded-lp-xl shadow-2xl p-4 z-20">
<div className="flex items-center gap-2 mb-2">
<div className="w-8 h-8 rounded-full bg-lp-secondary-fixed flex items-center justify-center text-lp-on-secondary-fixed">
<span className="material-symbols-outlined text-[18px]">receipt_long</span>
</div>
<div>
<p className="text-lp-label-sm text-lp-on-surface font-bold">Verified Bursary Slip</p>
<p className="text-[11px] text-lp-on-surface-variant">Ref: SCH-2025-0814</p>
</div>
</div>
<div className="bg-lp-surface-container-low p-2.5 rounded-lp-lg mb-2 flex items-center justify-between">
<span className="text-lp-label-sm text-lp-on-surface-variant">Amount Paid:</span>
<span className="text-lp-label-md text-lp-primary font-bold">₦185,000.00</span>
</div>
<div className="flex items-center justify-between text-[11px] text-lp-on-surface-variant">
<span className="inline-flex items-center gap-1 text-lp-primary font-semibold">
<span className="material-symbols-outlined text-[14px]">check_circle</span> Instant Stamp
                </span>
<span>Term 2 Tuition</span>
</div>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="roles" className="w-full py-20 bg-lp-surface">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="text-center max-w-3xl mx-auto mb-14">
<span className="text-lp-label-md text-lp-secondary uppercase font-bold tracking-wider">Purpose-Built Environments</span>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight! mt-2!">
          Four dedicated workspaces. Zero role confusion.
        </h2>
<p className="text-lp-body-md text-lp-on-surface-variant mt-3">
          Each member of your educational community receives a specialized portal optimized for their daily workflows, whether auditing school finances or checking homework.
        </p>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-6 shadow-lp-sm hover:shadow-lp-md transition-shadow flex flex-col justify-between">
<div>
<div className="w-12 h-12 rounded-lp-xl bg-lp-surface-container-high text-lp-primary flex items-center justify-center mb-5">
<span className="material-symbols-outlined text-[26px]">corporate_fare</span>
</div>
<h3 className="text-lp-title-md! text-lp-on-surface! mb-2!">Super Admin &amp; Board</h3>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-4">
              Comprehensive institutional oversight across all campuses and franchise branches.
            </p>
<ul className="space-y-2 mb-6">
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Multi-branch consolidated billing</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Staff allocation &amp; license controls</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Audit trail &amp; activity ledger</span>
</li>
</ul>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<div className="flex items-center justify-between text-xs text-lp-on-surface-variant mb-1">
<span>Lekki Branch</span>
<span className="text-lp-primary font-bold">₦28.4M</span>
</div>
<div className="flex items-center justify-between text-xs text-lp-on-surface-variant">
<span>Ikeja Branch</span>
<span className="text-lp-primary font-bold">₦34.1M</span>
</div>
</div>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-6 shadow-lp-sm hover:shadow-lp-md transition-shadow flex flex-col justify-between">
<div>
<div className="w-12 h-12 rounded-lp-xl bg-lp-surface-container text-lp-primary flex items-center justify-center mb-5">
<span className="material-symbols-outlined text-[26px]">admin_panel_settings</span>
</div>
<h3 className="text-lp-title-md! text-lp-on-surface! mb-2!">School Principal &amp; Admin</h3>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-4">
              Daily operational engine for sessions, enrollment, records, and approvals.
            </p>
<ul className="space-y-2 mb-6">
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Session &amp; term cycle configuration</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Broadsheet generation &amp; signing</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Integrated school CMS website</span>
</li>
</ul>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<div className="flex items-center justify-between text-xs">
<span className="text-lp-on-surface font-semibold">Broadsheet SS2 Science</span>
<span className="px-2 py-0.5 bg-lp-secondary-fixed text-lp-on-secondary-fixed rounded text-[10px] font-bold">Pending Sign</span>
</div>
</div>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-6 shadow-lp-sm hover:shadow-lp-md transition-shadow flex flex-col justify-between">
<div>
<div className="w-12 h-12 rounded-lp-xl bg-lp-secondary-fixed text-lp-on-secondary-fixed flex items-center justify-center mb-5">
<span className="material-symbols-outlined text-[26px]">edit_calendar</span>
</div>
<h3 className="text-lp-title-md! text-lp-on-surface! mb-2!">Teachers &amp; Form Tutors</h3>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-4">
              Lightning-fast score submission and automated behavioral remarks from any phone.
            </p>
<ul className="space-y-2 mb-6">
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-secondary text-[16px] mt-0.5">check_circle</span>
<span>Quick CA1, CA2 &amp; exam score entry</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-secondary text-[16px] mt-0.5">check_circle</span>
<span>AI-assisted student progress remarks</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-secondary text-[16px] mt-0.5">check_circle</span>
<span>CBT question bank &amp; test publisher</span>
</li>
</ul>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<div className="flex items-center justify-between text-xs text-lp-on-surface-variant">
<span>JSS3 Chemistry Marked</span>
<span className="text-lp-primary font-bold">32/32 Done</span>
</div>
</div>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-6 shadow-lp-sm hover:shadow-lp-md transition-shadow flex flex-col justify-between">
<div>
<div className="w-12 h-12 rounded-lp-xl bg-lp-surface-container-high text-lp-primary flex items-center justify-center mb-5">
<span className="material-symbols-outlined text-[26px]">family_restroom</span>
</div>
<h3 className="text-lp-title-md! text-lp-on-surface! mb-2!">Parents &amp; Students</h3>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-4">
              Direct access to grades, online CBT exams, and instant fee payments via card or transfer.
            </p>
<ul className="space-y-2 mb-6">
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>One-tap PDF report card downloads</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Automated SMS &amp; WhatsApp notices</span>
</li>
<li className="flex items-start gap-2 text-lp-label-sm text-lp-on-surface">
<span className="material-symbols-outlined text-lp-primary text-[16px] mt-0.5">check_circle</span>
<span>Clear tuition breakdown &amp; receipts</span>
</li>
</ul>
</div>
<div className="bg-lp-surface-container-low p-3 rounded-lp-lg">
<div className="flex items-center justify-between text-xs">
<span className="text-lp-on-surface">Term 2 Result Ready</span>
<span className="text-lp-secondary font-bold flex items-center gap-0.5">
<span className="material-symbols-outlined text-[14px]">download</span> PDF
              </span>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="features" className="w-full py-20 bg-lp-surface-container-low">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

<div className="lg:col-span-6 space-y-6">
<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lp-surface-container-high text-lp-primary text-lp-label-sm">
<span className="material-symbols-outlined text-[16px]">grade</span> Continuous Assessment Engine
          </div>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight!">
            Flawless terminal report cards. Calculated in seconds.
          </h2>
<p className="text-lp-body-md text-lp-on-surface-variant">
            Say goodbye to endless spreadsheet formulas, manual rounding errors, and weeks of stressful collation. Configure custom CA weights (e.g. 20% CA1, 20% CA2, 60% Exam) aligned with WAEC, NECO, or BECE standards.
          </p>
<div className="space-y-4 pt-2">
<div className="flex items-start gap-4">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container-lowest flex items-center justify-center text-lp-primary shadow-lp-sm flex-shrink-0">
<span className="material-symbols-outlined">rule</span>
</div>
<div>
<h4 className="text-lp-title-md! text-lp-on-surface!">3-Tier Verification Workflow</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-0.5">Subject Teacher enters marks → Form Teacher reviews broadsheet → Principal executes digital signature.</p>
</div>
</div>
<div className="flex items-start gap-4">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container-lowest flex items-center justify-center text-lp-secondary shadow-lp-sm flex-shrink-0">
<span className="material-symbols-outlined">psychology</span>
</div>
<div>
<h4 className="text-lp-title-md! text-lp-on-surface!">Intelligent Behavioral Remarks</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-0.5">Generates nuanced, personalized remarks based on psychomotor domains, affective ratings, and academic trajectory.</p>
</div>
</div>
<div className="flex items-start gap-4">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container-lowest flex items-center justify-center text-lp-primary shadow-lp-sm flex-shrink-0">
<span className="material-symbols-outlined">print</span>
</div>
<div>
<h4 className="text-lp-title-md! text-lp-on-surface!">Print-Ready Official Security Watermarks</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-0.5">Features anti-tamper QR codes for tertiary verification and high-resolution official crest embeds.</p>
</div>
</div>
</div>
</div>

<div className="lg:col-span-6">
<div className="bg-lp-surface-container-lowest rounded-lp-xl shadow-xl p-6 sm:p-8">

<div className="flex items-center justify-between pb-6 border-b border-lp-surface-container">
<div className="flex items-center gap-3">
<div className="w-12 h-12 rounded-lp-lg bg-lp-primary text-lp-on-primary flex items-center justify-center font-bold text-lg">
                  SC
                </div>
<div>
<h4 className="text-lp-label-lg! text-lp-primary!">ST. CLAIRE&apos;S INTERNATIONAL COLLEGE</h4>
<p className="text-lp-label-sm text-lp-on-surface-variant">Lagos Campus · Term 2 Continuous Assessment Dossier</p>
</div>
</div>
<div className="text-right hidden sm:block">
<span className="px-3 py-1 rounded bg-lp-secondary-fixed text-lp-on-secondary-fixed text-lp-label-sm font-bold">SESSION 2024/2025</span>
</div>
</div>

<div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 text-xs bg-lp-surface-container-low px-4 rounded-lp-lg my-4">
<div>
<span className="text-lp-on-surface-variant block">Student Name:</span>
<span className="font-bold text-lp-on-surface">Adebayo, Chisom E.</span>
</div>
<div>
<span className="text-lp-on-surface-variant block">Admission No:</span>
<span className="font-bold text-lp-on-surface">SCI/2022/0491</span>
</div>
<div>
<span className="text-lp-on-surface-variant block">Class / Arm:</span>
<span className="font-bold text-lp-on-surface">SS 2 Diamond</span>
</div>
<div>
<span className="text-lp-on-surface-variant block">Term Position:</span>
<span className="font-bold text-lp-primary">2nd of 44</span>
</div>
</div>

<div className="overflow-x-auto">
<table className="w-full text-left text-lp-label-sm">
<thead>
<tr className="bg-lp-surface-container text-lp-on-surface">
<th className="py-2.5 px-3 rounded-l">Subject</th>
<th className="py-2.5 px-2 text-center">CA1 (20)</th>
<th className="py-2.5 px-2 text-center">CA2 (20)</th>
<th className="py-2.5 px-2 text-center">Exam (60)</th>
<th className="py-2.5 px-2 text-center">Total (100)</th>
<th className="py-2.5 px-3 text-center rounded-r">Grade</th>
</tr>
</thead>
<tbody className="divide-y divide-lp-surface-container">
<tr>
<td className="py-2.5 px-3 font-semibold text-lp-on-surface">Mathematics</td>
<td className="py-2.5 px-2 text-center">19</td>
<td className="py-2.5 px-2 text-center">18</td>
<td className="py-2.5 px-2 text-center">54</td>
<td className="py-2.5 px-2 text-center font-bold text-lp-primary">91%</td>
<td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-lp-secondary-fixed text-lp-on-secondary-fixed font-bold">A1</span></td>
</tr>
<tr>
<td className="py-2.5 px-3 font-semibold text-lp-on-surface">English Language</td>
<td className="py-2.5 px-2 text-center">17</td>
<td className="py-2.5 px-2 text-center">18</td>
<td className="py-2.5 px-2 text-center">50</td>
<td className="py-2.5 px-2 text-center font-bold text-lp-primary">85%</td>
<td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-lp-secondary-fixed text-lp-on-secondary-fixed font-bold">A1</span></td>
</tr>
<tr>
<td className="py-2.5 px-3 font-semibold text-lp-on-surface">Physics</td>
<td className="py-2.5 px-2 text-center">18</td>
<td className="py-2.5 px-2 text-center">16</td>
<td className="py-2.5 px-2 text-center">48</td>
<td className="py-2.5 px-2 text-center font-bold text-lp-primary">82%</td>
<td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-lp-surface-container-high text-lp-primary font-bold">B2</span></td>
</tr>
<tr>
<td className="py-2.5 px-3 font-semibold text-lp-on-surface">Chemistry</td>
<td className="py-2.5 px-2 text-center">19</td>
<td className="py-2.5 px-2 text-center">19</td>
<td className="py-2.5 px-2 text-center">51</td>
<td className="py-2.5 px-2 text-center font-bold text-lp-primary">89%</td>
<td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-lp-secondary-fixed text-lp-on-secondary-fixed font-bold">A1</span></td>
</tr>
</tbody>
</table>
</div>

<div className="mt-5 pt-4 border-t border-lp-surface-container flex flex-col sm:flex-row items-center justify-between gap-4">
<div className="flex items-center gap-3">
<div className="w-10 h-10 bg-lp-surface-container rounded-lp-lg flex items-center justify-center">
<span className="material-symbols-outlined text-lp-primary text-[20px]">qr_code_2</span>
</div>
<div>
<p className="text-lp-label-sm text-lp-on-surface font-semibold">Verification Seal: Active</p>
<p className="text-[11px] text-lp-on-surface-variant">Validated on West African Registry</p>
</div>
</div>
<button type="button" className="inline-flex items-center gap-2 px-4 py-2 bg-lp-primary text-lp-on-primary rounded-lp-lg text-lp-label-sm hover:bg-lp-primary-container transition-colors">
<span className="material-symbols-outlined text-[16px]">file_download</span>
<span>Download Signed PDF</span>
</button>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="cbt" className="w-full py-20 bg-lp-surface">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="text-center max-w-3xl mx-auto mb-14">
<span className="text-lp-label-md text-lp-secondary uppercase font-bold tracking-wider">Examination Infrastructure</span>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight! mt-2!">
          WAEC-standard CBT exams with zero exam hall friction.
        </h2>
<p className="text-lp-body-md text-lp-on-surface-variant mt-3">
          Deploy mid-term tests and mock certificate exams with automated time management, randomized question pools, and instant score aggregation.
        </p>
</div>

<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
<div className="p-4 rounded-lp-xl bg-lp-surface-container-low">
<span className="text-lp-label-sm text-lp-secondary font-bold">STEP 01</span>
<h4 className="text-lp-title-md! text-lp-on-surface! mt-1!">Question Bank &amp; AI</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Upload via Excel or pull from our verified 40,000+ WAEC &amp; JAMB question repository.</p>
</div>
<div className="p-4 rounded-lp-xl bg-lp-surface-container-low">
<span className="text-lp-label-sm text-lp-primary font-bold">STEP 02</span>
<h4 className="text-lp-title-md! text-lp-on-surface! mt-1!">Timer &amp; Security</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Enforce full-screen browser lockdown, randomized options, and strict time limits.</p>
</div>
<div className="p-4 rounded-lp-xl bg-lp-surface-container-low">
<span className="text-lp-label-sm text-lp-secondary font-bold">STEP 03</span>
<h4 className="text-lp-title-md! text-lp-on-surface! mt-1!">Student Attempt</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Optimized for lightweight tablets, Chromebooks, and low-spec computer laboratory PCs.</p>
</div>
<div className="p-4 rounded-lp-xl bg-lp-surface-container-low">
<span className="text-lp-label-sm text-lp-primary font-bold">STEP 04</span>
<h4 className="text-lp-title-md! text-lp-on-surface! mt-1!">Instant Broadsheet Sync</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Grades automatically map directly to terminal dossiers with no manual re-entry.</p>
</div>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl shadow-xl overflow-hidden max-w-5xl mx-auto">

<div className="bg-lp-primary text-lp-on-primary px-6 py-4 flex flex-wrap items-center justify-between gap-4">
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-lp-secondary-container">timer</span>
<div>
<p className="text-xs opacity-80 uppercase tracking-wider">Remaining Time</p>
<p className="text-lp-headline-sm text-lp-secondary-container font-mono">00:24:18</p>
</div>
</div>
<div className="text-center">
<p className="text-lp-label-md font-bold">SS3 National Mock: Biology Paper 1 (Objectives)</p>
<p className="text-xs opacity-75">Question 14 of 40</p>
</div>
<div className="flex items-center gap-3">
<span className="px-3 py-1 rounded bg-lp-primary-container text-lp-on-primary text-lp-label-sm">Candidate: #9942</span>
<button type="button" className="px-4 py-2 rounded-lp-lg bg-lp-secondary-container text-lp-on-secondary-container text-lp-label-sm font-bold hover:bg-lp-secondary-fixed-dim transition-colors">
              Submit Paper
            </button>
</div>
</div>
<div className="grid grid-cols-1 lg:grid-cols-12">

<div className="lg:col-span-8 p-6 lg:p-8 space-y-6">
<div className="flex items-center gap-2">
<span className="px-2.5 py-1 rounded bg-lp-surface-container-high text-lp-primary text-lp-label-sm font-bold">Q14 · [Cell Biology &amp; Osmosis]</span>
<span className="text-xs text-lp-on-surface-variant">2.0 Marks</span>
</div>
<p className="text-lp-title-md text-lp-on-surface font-normal">
              Which of the following cellular organelles is primarily responsible for packaging proteins into membrane-bound vesicles inside the cell before the vesicles are sent to their destination?
            </p>
<div className="space-y-3 pt-2">
<label className="flex items-center gap-3 p-3.5 rounded-lp-lg bg-lp-surface-container-low hover:bg-lp-surface-container transition-colors cursor-pointer">
<input className="w-5 h-5 text-lp-primary accent-lp-primary" name="cbt-q14" type="radio"/>
<span className="text-lp-body-md text-lp-on-surface">A) Ribosome</span>
</label>
<label className="flex items-center gap-3 p-3.5 rounded-lp-lg bg-lp-surface-container-high ring-2 ring-lp-primary transition-colors cursor-pointer">
<input defaultChecked className="w-5 h-5 text-lp-primary accent-lp-primary" name="cbt-q14" type="radio"/>
<span className="text-lp-body-md text-lp-on-surface font-semibold">B) Golgi Apparatus</span>
</label>
<label className="flex items-center gap-3 p-3.5 rounded-lp-lg bg-lp-surface-container-low hover:bg-lp-surface-container transition-colors cursor-pointer">
<input className="w-5 h-5 text-lp-primary accent-lp-primary" name="cbt-q14" type="radio"/>
<span className="text-lp-body-md text-lp-on-surface">C) Rough Endoplasmic Reticulum</span>
</label>
<label className="flex items-center gap-3 p-3.5 rounded-lp-lg bg-lp-surface-container-low hover:bg-lp-surface-container transition-colors cursor-pointer">
<input className="w-5 h-5 text-lp-primary accent-lp-primary" name="cbt-q14" type="radio"/>
<span className="text-lp-body-md text-lp-on-surface">D) Mitochondrion</span>
</label>
</div>
<div className="flex items-center justify-between pt-6">
<button type="button" className="px-4 py-2 rounded-lp-lg bg-lp-surface-container text-lp-on-surface text-lp-label-sm flex items-center gap-2 hover:bg-lp-surface-container-high transition-colors">
<span className="material-symbols-outlined text-[16px]">chevron_left</span> Previous
              </button>
<button type="button" className="px-5 py-2 rounded-lp-lg bg-lp-primary text-lp-on-primary text-lp-label-sm flex items-center gap-2 hover:bg-lp-primary-container transition-colors">
                Save &amp; Next <span className="material-symbols-outlined text-[16px]">chevron_right</span>
</button>
</div>
</div>

<div className="lg:col-span-4 bg-lp-surface-container-low p-6 border-t lg:border-t-0 lg:border-l border-lp-surface-container">
<h4 className="text-lp-label-md! text-lp-on-surface! mb-3! flex! items-center! justify-between!">
<span>Question Palette</span>
<span className="text-xs text-lp-primary font-bold">13 of 40 Answered</span>
</h4>
<div className="grid grid-cols-5 gap-2 mb-6">

<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">1</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">2</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">3</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">4</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">5</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">6</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">7</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">8</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">9</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">10</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">11</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">12</span>
<span className="h-8 rounded bg-lp-primary text-lp-on-primary flex items-center justify-center text-lp-label-sm font-bold">13</span>
<span className="h-8 rounded bg-lp-secondary-container text-lp-on-secondary-container ring-2 ring-lp-primary flex items-center justify-center text-lp-label-sm font-bold animate-pulse">14</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">15</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">16</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">17</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">18</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">19</span>
<span className="h-8 rounded bg-lp-surface-container-highest text-lp-on-surface-variant flex items-center justify-center text-lp-label-sm">20</span>
</div>
<div className="space-y-2 text-xs text-lp-on-surface-variant pt-2 border-t border-lp-surface-container">
<div className="flex items-center gap-2">
<span className="w-3 h-3 rounded bg-lp-primary"></span>
<span>Answered (13)</span>
</div>
<div className="flex items-center gap-2">
<span className="w-3 h-3 rounded bg-lp-secondary-container"></span>
<span>Current Question</span>
</div>
<div className="flex items-center gap-2">
<span className="w-3 h-3 rounded bg-lp-surface-container-highest"></span>
<span>Unattempted (26)</span>
</div>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="finance" className="w-full py-20 bg-lp-surface-container-low">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

<div className="lg:col-span-6 space-y-6">
<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lp-secondary-fixed text-lp-on-secondary-fixed text-lp-label-sm font-bold">
<span className="material-symbols-outlined text-[16px]">account_balance_wallet</span> Fiduciary Ledger Automation
          </div>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight!">
            Track every Kobo and Cedi with authoritative bursary clarity.
          </h2>
<p className="text-lp-body-md text-lp-on-surface-variant">
            Eliminate cash-handling discrepancies and long queues at the bursar&apos;s office. Provide parents flexible installment schedules, automated bank reconciliation, and instant tamper-proof receipts.
          </p>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
<div className="p-4 rounded-lp-lg bg-lp-surface-container-lowest shadow-lp-sm">
<span className="material-symbols-outlined text-lp-primary mb-2">payments</span>
<h4 className="text-lp-label-lg! text-lp-on-surface!">Integrated Gateways</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Direct support for Paystack, Flutterwave, Moniepoint, and virtual dedicated accounts.</p>
</div>
<div className="p-4 rounded-lp-lg bg-lp-surface-container-lowest shadow-lp-sm">
<span className="material-symbols-outlined text-lp-secondary mb-2">notifications_active</span>
<h4 className="text-lp-label-lg! text-lp-on-surface!">Debtor SMS Triggers</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mt-1">Automated WhatsApp &amp; SMS reminders before mid-term cutoff deadlines.</p>
</div>
</div>
<div className="bg-lp-surface-container-lowest p-4 rounded-lp-lg shadow-lp-sm flex items-center justify-between">
<div className="flex items-center gap-3">
<div className="w-10 h-10 rounded-full bg-lp-surface-container-high flex items-center justify-center text-lp-primary">
<span className="material-symbols-outlined">receipt</span>
</div>
<div>
<p className="text-lp-label-md text-lp-on-surface font-semibold">QR-Stamped Digital Receipts</p>
<p className="text-xs text-lp-on-surface-variant">Prevents fraudulent bank teller duplicates</p>
</div>
</div>
<span className="text-lp-label-sm text-lp-primary font-bold">100% Impartial</span>
</div>
</div>

<div className="lg:col-span-6">
<div className="bg-lp-surface-container-lowest rounded-lp-xl shadow-xl p-6 sm:p-8 space-y-6">
<div className="flex items-center justify-between pb-4 border-b border-lp-surface-container">
<div>
<h4 className="text-lp-title-md! text-lp-primary! font-bold!">Term 2 Collections Summary</h4>
<p className="text-xs text-lp-on-surface-variant">Live bank settlement feed · Updated 2 mins ago</p>
</div>
<span className="px-2.5 py-1 bg-lp-surface-container text-lp-primary text-lp-label-sm rounded-full font-bold">
                AUDITED
              </span>
</div>

<div className="grid grid-cols-2 gap-4">
<div className="bg-lp-surface-container-low p-4 rounded-lp-lg">
<span className="text-xs text-lp-on-surface-variant block">Total Inflow Collected</span>
<span className="text-lp-headline-md text-lp-primary mt-1 block">₦42,850,000</span>
<span className="text-xs text-lp-primary font-semibold flex items-center gap-1 mt-1">
<span className="material-symbols-outlined text-[14px]">check_circle</span> 92% of expected budget
                </span>
</div>
<div className="bg-lp-surface-container-low p-4 rounded-lp-lg">
<span className="text-xs text-lp-on-surface-variant block">Outstanding Balances</span>
<span className="text-lp-headline-md text-lp-error mt-1 block">₦3,410,000</span>
<span className="text-xs text-lp-error font-semibold flex items-center gap-1 mt-1">
<span className="material-symbols-outlined text-[14px]">warning</span> 18 families flagged
                </span>
</div>
</div>

<div className="space-y-3">
<p className="text-lp-label-sm text-lp-on-surface font-bold uppercase tracking-wider">Recent Verified Payments</p>
<div className="flex items-center justify-between p-3 rounded-lp-lg bg-lp-surface-container-low">
<div className="flex items-center gap-3">
<div className="w-8 h-8 rounded-full bg-lp-surface-container-high flex items-center justify-center text-lp-primary font-bold text-xs">
                    EA
                  </div>
<div>
<p className="text-lp-label-sm text-lp-on-surface font-semibold">Emeka Adeleke (JSS 1)</p>
<p className="text-[11px] text-lp-on-surface-variant">Moniepoint Direct Transfer · 10:42 AM</p>
</div>
</div>
<div className="text-right">
<span className="text-lp-label-md text-lp-primary font-bold">+₦145,000</span>
<span className="block text-[10px] text-lp-primary">Cleared</span>
</div>
</div>
<div className="flex items-center justify-between p-3 rounded-lp-lg bg-lp-surface-container-low">
<div className="flex items-center gap-3">
<div className="w-8 h-8 rounded-full bg-lp-secondary-fixed flex items-center justify-center text-lp-on-secondary-fixed font-bold text-xs">
                    KO
                  </div>
<div>
<p className="text-lp-label-sm text-lp-on-surface font-semibold">Kofi Owusu (SS 3)</p>
<p className="text-[11px] text-lp-on-surface-variant">Paystack Debit Card · 09:15 AM</p>
</div>
</div>
<div className="text-right">
<span className="text-lp-label-md text-lp-primary font-bold">+₦210,000</span>
<span className="block text-[10px] text-lp-primary">Cleared</span>
</div>
</div>
</div>

<div className="pt-2 flex items-center justify-between">
<span className="text-xs text-lp-on-surface-variant">Export ledger format: Excel, CSV, FBR</span>
<button type="button" className="inline-flex items-center gap-1.5 px-4 py-2 bg-lp-surface-container text-lp-primary rounded-lp-lg text-lp-label-sm font-bold hover:bg-lp-surface-container-high transition-colors">
<span className="material-symbols-outlined text-[16px]">download</span> Export Daily Batch
              </button>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="school-website" className="w-full py-20 bg-lp-surface">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

<div className="lg:col-span-5 space-y-6">
<div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lp-surface-container-high text-lp-primary text-lp-label-sm">
<span className="material-symbols-outlined text-[16px]">web</span> No Developer Needed
          </div>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight!">
            Your modern school website. Up and running in minutes.
          </h2>
<p className="text-lp-body-md text-lp-on-surface-variant">
            Every SchoolAid subscription includes an SEO-optimized public website. Plug in your custom school domain (e.g., <code className="bg-lp-surface-container px-1 py-0.5 rounded text-xs text-lp-primary font-mono font-bold">your-school.sch.ng</code> or <code className="bg-lp-surface-container px-1 py-0.5 rounded text-xs text-lp-primary font-mono font-bold">.edu.gh</code>) and accept online admission inquiries straight into your database.
          </p>
<div className="space-y-3 pt-2">
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-lp-secondary text-[20px]">check_circle</span>
<span className="text-lp-body-md text-lp-on-surface">Integrated Online Admission &amp; Application Forms</span>
</div>
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-lp-secondary text-[20px]">check_circle</span>
<span className="text-lp-body-md text-lp-on-surface">Termly Event Calendar &amp; Parent Announcements</span>
</div>
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-lp-secondary text-[20px]">check_circle</span>
<span className="text-lp-body-md text-lp-on-surface">High-Speed Cloud Hosting &amp; Automated SSL Certificate</span>
</div>
</div>
</div>

<div className="lg:col-span-7 space-y-4">

<div className="bg-lp-surface-container-lowest rounded-lp-xl shadow-xl overflow-hidden">
<div className="bg-lp-surface-container-low px-4 py-2.5 flex items-center justify-between border-b border-lp-surface-container">
<div className="flex items-center gap-2">
<span className="w-3 h-3 rounded-full bg-lp-error"></span>
<span className="w-3 h-3 rounded-full bg-lp-secondary-container"></span>
<span className="w-3 h-3 rounded-full bg-lp-primary-container"></span>
</div>
<div className="bg-lp-surface-container-lowest px-6 py-1 rounded text-xs text-lp-on-surface-variant font-mono">
                https://greenwoodacademy.sch.ng
              </div>
<span className="material-symbols-outlined text-lp-on-surface-variant text-[16px]">lock</span>
</div>

<div className="p-6 bg-lp-surface-container-lowest">
<div className="flex items-center justify-between pb-4 border-b border-lp-surface-container">
<div className="flex items-center gap-2">
<div className="w-8 h-8 rounded bg-lp-primary text-lp-on-primary font-bold flex items-center justify-center text-sm">GA</div>
<span className="text-lp-label-md text-lp-primary font-bold">Greenwood Academy</span>
</div>
<div className="flex items-center gap-4 text-xs font-semibold text-lp-on-surface-variant">
<span className="text-lp-primary">Home</span>
<span>Academics</span>
<span>Admissions</span>
<span className="px-3 py-1 bg-lp-secondary-container text-lp-on-secondary-container rounded font-bold">Apply Now</span>
</div>
</div>

<div className="mt-4 p-6 rounded-lp-lg bg-gradient-to-r from-lp-primary to-lp-primary-container text-lp-on-primary flex items-center justify-between">
<div className="max-w-xs space-y-2">
<span className="text-[10px] uppercase font-bold tracking-widest text-lp-secondary-container">Admissions Open 2025/2026</span>
<h5 className="text-lp-headline-sm! text-lp-on-primary!">Nurturing Leaders of Tomorrow</h5>
<p className="text-xs text-lp-on-primary/80">Creche, Nursery, Primary, and Secondary Education in Abuja.</p>
</div>
<div className="w-20 h-20 rounded-full bg-lp-surface-container-lowest/10 hidden sm:flex items-center justify-center">
<span className="material-symbols-outlined text-lp-secondary-container text-3xl">school</span>
</div>
</div>
</div>
</div>

<div>
<p className="text-lp-label-sm text-lp-on-surface-variant mb-2">Pre-built Drag &amp; Drop Modules Included:</p>
<div className="flex flex-wrap gap-2">
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Announcement Marquee</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Principal&apos;s Address</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Curriculum &amp; Subjects</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Campus Facilities</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Tuition &amp; Bursary Info</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Parent Testimonials</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Online Admission Form</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Photo &amp; Video Gallery</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Sports &amp; Clubs</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Staff Directory</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Academic Calendar</span>
<span className="px-3 py-1 bg-lp-surface-container-low rounded-full text-lp-label-sm text-lp-on-surface">Contact &amp; Map</span>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="security" className="w-full py-16 bg-lp-surface-container-highest">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
<div className="bg-lp-surface-container-lowest p-6 rounded-lp-xl shadow-lp-sm">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container-high text-lp-primary flex items-center justify-center mb-4">
<span className="material-symbols-outlined">shield</span>
</div>
<h4 className="text-lp-title-md! text-lp-on-surface! mb-1!">Data Isolation</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm">Multi-tenant database schema safeguards. Your school records remain completely segregated.</p>
</div>
<div className="bg-lp-surface-container-lowest p-6 rounded-lp-xl shadow-lp-sm">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container text-lp-primary flex items-center justify-center mb-4">
<span className="material-symbols-outlined">badge</span>
</div>
<h4 className="text-lp-title-md! text-lp-on-surface! mb-1!">Granular RBAC</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm">Role-based access controls ensure teachers only view assigned classes and exam scripts.</p>
</div>
<div className="bg-lp-surface-container-lowest p-6 rounded-lp-xl shadow-lp-sm">
<div className="w-10 h-10 rounded-lp-lg bg-lp-secondary-fixed text-lp-on-secondary-fixed flex items-center justify-center mb-4">
<span className="material-symbols-outlined">cloud_sync</span>
</div>
<h4 className="text-lp-title-md! text-lp-on-surface! mb-1!">Daily Automated Backups</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm">Point-in-time recovery archives ensure terminal exam records and receipts are never lost.</p>
</div>
<div className="bg-lp-surface-container-lowest p-6 rounded-lp-xl shadow-lp-sm">
<div className="w-10 h-10 rounded-lp-lg bg-lp-surface-container-high text-lp-primary flex items-center justify-center mb-4">
<span className="material-symbols-outlined">network_check</span>
</div>
<h4 className="text-lp-title-md! text-lp-on-surface! mb-1!">99.9% Uptime Guarantee</h4>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm">Zero lag during peak end-of-term result checking, even across congested regional networks.</p>
</div>
</div>
</div>
</section>

<section id="stats" className="w-full py-20 bg-lp-surface">
<div className="max-w-7xl mx-auto px-6 lg:px-12">

<div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pb-16 border-b border-lp-surface-container text-center">
<div>
<p className="text-lp-headline-xl text-lp-primary font-bold">350+</p>
<p className="text-lp-label-lg text-lp-on-surface font-semibold mt-1">Institutions Onboard</p>
<p className="text-xs text-lp-on-surface-variant">Nigeria &amp; Ghana</p>
</div>
<div>
<p className="text-lp-headline-xl text-lp-secondary font-bold">180,000+</p>
<p className="text-lp-label-lg text-lp-on-surface font-semibold mt-1">Active Students</p>
<p className="text-xs text-lp-on-surface-variant">Primary through High School</p>
</div>
<div>
<p className="text-lp-headline-xl text-lp-primary font-bold">99.4%</p>
<p className="text-lp-label-lg text-lp-on-surface font-semibold mt-1">On-Time Result Release</p>
<p className="text-xs text-lp-on-surface-variant">Down from 3-week delays</p>
</div>
<div>
<p className="text-lp-headline-xl text-lp-secondary font-bold">₦2.8B+</p>
<p className="text-lp-label-lg text-lp-on-surface font-semibold mt-1">School Fees Cleared</p>
<p className="text-xs text-lp-on-surface-variant">Automated reconciliations</p>
</div>
</div>

<div className="text-center max-w-2xl mx-auto my-12">
<h3 className="text-lp-headline-md! text-lp-primary!">Trusted by Principals &amp; Proprietors Across West Africa</h3>
<p className="text-lp-body-md text-lp-on-surface-variant mt-2">See how schools transformed their academic operations within one term.</p>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-8">

<div className="bg-lp-surface-container-low p-6 rounded-lp-xl flex flex-col justify-between">
<div className="space-y-4">
<div className="flex items-center text-lp-secondary">
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
</div>
<p className="text-lp-body-md text-lp-on-surface italic">
              “Before SchoolAid, compilation of broadsheets took our teachers two agonizing weeks after exams. Now, continuous assessments and exam scores sync immediately. Our reports are out within 48 hours of the final paper.”
            </p>
</div>
<div className="flex items-center gap-3 pt-6 mt-6 border-t border-lp-surface-container">
<img alt="Dr. Olumide Adeleke" className="w-11 h-11 rounded-full object-cover" src="/landing/avatar-1.jpg"/>
<div>
<p className="text-lp-label-md text-lp-on-surface font-bold">Dr. Olumide Adeleke</p>
<p className="text-xs text-lp-on-surface-variant">Director, Corona Memorial Schools, Lagos</p>
</div>
</div>
</div>

<div className="bg-lp-surface-container-low p-6 rounded-lp-xl flex flex-col justify-between">
<div className="space-y-4">
<div className="flex items-center text-lp-secondary">
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
</div>
<p className="text-lp-body-md text-lp-on-surface italic">
              “The fee recovery rate jumped from 68% to 94% in our very first term. Parents love receiving instant receipts on WhatsApp, and the automated debtor tracking removed uncomfortable confrontations at the gate.”
            </p>
</div>
<div className="flex items-center gap-3 pt-6 mt-6 border-t border-lp-surface-container">
<img alt="Hajiya Fatima Bello" className="w-11 h-11 rounded-full object-cover" src="/landing/avatar-2.jpg"/>
<div>
<p className="text-lp-label-md text-lp-on-surface font-bold">Hajiya Fatima Bello</p>
<p className="text-xs text-lp-on-surface-variant">Principal, Capital Heights Academy, Abuja</p>
</div>
</div>
</div>

<div className="bg-lp-surface-container-low p-6 rounded-lp-xl flex flex-col justify-between">
<div className="space-y-4">
<div className="flex items-center text-lp-secondary">
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
<span className="material-symbols-outlined text-[18px]">star</span>
</div>
<p className="text-lp-body-md text-lp-on-surface italic">
              “The CBT platform was a total gamechanger for our BECE candidates. They learned timed computer test discipline long before their official external exams, and our overall pass rates surged.”
            </p>
</div>
<div className="flex items-center gap-3 pt-6 mt-6 border-t border-lp-surface-container">
<img alt="Kwame Mensah" className="w-11 h-11 rounded-full object-cover" src="/landing/avatar-3.jpg"/>
<div>
<p className="text-lp-label-md text-lp-on-surface font-bold">Kwame Mensah, M.Ed.</p>
<p className="text-xs text-lp-on-surface-variant">Headmaster, Ridge International School, Accra</p>
</div>
</div>
</div>
</div>
</div>
</section>

<section id="pricing" className="w-full py-20 bg-lp-surface-container-low">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="text-center max-w-3xl mx-auto mb-14">
<span className="text-lp-label-md text-lp-secondary uppercase font-bold tracking-wider">Predictable Pricing</span>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight! mt-2!">
          Fair termly licensing that scales with your enrollment.
        </h2>
<p className="text-lp-body-md text-lp-on-surface-variant mt-3">
          No hidden onboarding fees. No surprise server maintenance charges. Everything billed per active student per term.
        </p>
</div>
<div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-8 shadow-lp-sm flex flex-col justify-between">
<div>
<div className="flex justify-between items-center mb-4">
<h3 className="text-lp-title-md! text-lp-on-surface!">Starter Basic</h3>
<span className="px-2.5 py-1 bg-lp-surface-container text-lp-primary text-lp-label-sm rounded-full">Single Campus</span>
</div>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-6">
              Ideal for growing primary or early childhood schools modernizing their record keeping.
            </p>
<div className="mb-6">
<span className="text-lp-headline-xl text-lp-primary font-bold">₦450</span>
<span className="text-lp-on-surface-variant text-sm">/ student / term</span>
<p className="text-xs text-lp-on-surface-variant mt-1">(or GH₵ 8.50 / term)</p>
</div>
<ul className="space-y-3 pt-4 border-t border-lp-surface-container mb-8 text-lp-label-sm text-lp-on-surface">
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Termly Automated Report Cards</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Student Roster &amp; Attendance Tracking</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Manual Fee Payment Recording</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Standard SchoolAid Subdomain Website</span>
</li>
</ul>
</div>
<a className="w-full min-h-[48px] inline-flex items-center justify-center rounded-lp-lg bg-lp-surface-container text-lp-primary text-lp-label-md font-bold hover:bg-lp-surface-container-high transition-colors" href={DEMO_HREF}>
            Get Started
          </a>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-8 shadow-xl flex flex-col justify-between relative ring-2 ring-lp-primary">
<div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-lp-secondary-container text-lp-on-secondary-container text-lp-label-sm font-bold uppercase tracking-wider">
            Most Popular
          </div>
<div>
<div className="flex justify-between items-center mb-4 pt-2">
<h3 className="text-lp-title-md! text-lp-primary! font-bold!">School Pro</h3>
<span className="px-2.5 py-1 bg-lp-secondary-fixed text-lp-on-secondary-fixed text-lp-label-sm rounded-full font-bold">All-in-One</span>
</div>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-6">
              Complete administrative automation for standard primary and secondary institutions.
            </p>
<div className="mb-6">
<span className="text-lp-headline-xl text-lp-primary font-bold">₦750</span>
<span className="text-lp-on-surface-variant text-sm">/ student / term</span>
<p className="text-xs text-lp-on-surface-variant mt-1">(or GH₵ 14.00 / term)</p>
</div>
<ul className="space-y-3 pt-4 border-t border-lp-surface-container mb-8 text-lp-label-sm text-lp-on-surface">
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-secondary text-[18px]">check_circle</span>
<span className="font-bold">Everything in Starter, plus:</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-secondary text-[18px]">check_circle</span>
<span>Unlimited CBT Exam Bank &amp; Online Tests</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-secondary text-[18px]">check_circle</span>
<span>Automated Online Fee Collection &amp; QR Slips</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-secondary text-[18px]">check_circle</span>
<span>Parent Portal with WhatsApp Result Alerts</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-secondary text-[18px]">check_circle</span>
<span>Custom Domain (.sch.ng / .edu.gh) Included</span>
</li>
</ul>
</div>
<a className="w-full min-h-[48px] inline-flex items-center justify-center rounded-lp-lg bg-lp-secondary-container text-lp-on-secondary-container text-lp-label-md font-bold hover:bg-lp-secondary-fixed-dim transition-colors shadow-lp-md" href={DEMO_HREF}>
            Start Free Pilot Term
          </a>
</div>

<div className="bg-lp-surface-container-lowest rounded-lp-xl p-8 shadow-lp-sm flex flex-col justify-between">
<div>
<div className="flex justify-between items-center mb-4">
<h3 className="text-lp-title-md! text-lp-on-surface!">Enterprise Network</h3>
<span className="px-2.5 py-1 bg-lp-surface-container text-lp-primary text-lp-label-sm rounded-full">Multi-Branch</span>
</div>
<p className="text-lp-body-md text-lp-on-surface-variant text-sm mb-6">
              Tailored governance, dedicated SLA, and centralized reporting for large school groups.
            </p>
<div className="mb-6">
<span className="text-lp-headline-xl text-lp-primary font-bold">Custom</span>
<span className="text-lp-on-surface-variant text-sm">/ group quote</span>
<p className="text-xs text-lp-on-surface-variant mt-1">Multi-campus volume discounts</p>
</div>
<ul className="space-y-3 pt-4 border-t border-lp-surface-container mb-8 text-lp-label-sm text-lp-on-surface">
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Unified Multi-Campus Master Dashboard</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Dedicated Technical Account Manager</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>Custom API &amp; Accounting Software Sync</span>
</li>
<li className="flex items-center gap-2">
<span className="material-symbols-outlined text-lp-primary text-[18px]">check</span>
<span>On-site Staff Hands-on Training</span>
</li>
</ul>
</div>
<a className="w-full min-h-[48px] inline-flex items-center justify-center rounded-lp-lg bg-lp-surface-container text-lp-primary text-lp-label-md font-bold hover:bg-lp-surface-container-high transition-colors" href={DEMO_HREF}>
            Contact Sales Team
          </a>
</div>
</div>
</div>
</section>

<section id="faq" className="w-full py-20 bg-lp-surface">
<div className="max-w-5xl mx-auto px-6 lg:px-12">
<div className="text-center mb-14">
<span className="text-lp-label-md text-lp-secondary uppercase font-bold tracking-wider">Got Questions?</span>
<h2 className="text-lp-headline-lg! text-lp-primary! tracking-tight! mt-2!">
          Frequently Asked Questions
        </h2>
<p className="text-lp-body-md text-lp-on-surface-variant mt-2">
          Everything school administrators ask before transitioning to SchoolAid.
        </p>
</div>
<div className="space-y-4">

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>How fast can our school migrate existing student records and past grades?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            Most schools complete full onboarding within 48 hours. Our dedicated Nigerian and Ghanaian implementation teams ingest your existing Excel or paper rosters, map past student IDs, configure your grading schemes, and test broadsheets without interrupting active classes.
          </p>
</details>

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>Does SchoolAid work smoothly with poor internet connection or during power cuts?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            Yes. SchoolAid is built with offline-first caching for mobile score inputs. Teachers can key in CA marks and student remarks even when network drops; the system automatically synchronizes scores the moment connectivity restores.
          </p>
</details>

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>Can parents check report cards without creating complicated logins?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            Yes. Parents can log in securely using their registered WhatsApp phone number and a one-time SMS passkey, or access their child&apos;s dossier directly via unique encrypted tokens delivered right to their email or SMS inbox.
          </p>
</details>

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>How do we connect our official .sch.ng or .edu.gh domain to the website builder?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            We manage NiRA (.sch.ng) and Ghana Domain Name Registry (.edu.gh) DNS routing for you. If you already own your domain, simply point two CNAME records to our cloud cluster, and SSL certificates are provisioned automatically within minutes.
          </p>
</details>

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>How does SchoolAid handle multi-branch institutions with shared finances?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            Proprietors and boards receive an overarching Super Admin portal. You can view consolidated revenue across all branches (e.g. Ikeja, Lekki, and Abuja) while ensuring individual branch heads and bursars only access their specific student ledger.
          </p>
</details>

<details className="group bg-lp-surface-container-low rounded-lp-xl p-5 open:bg-lp-surface-container transition-colors">
<summary className="flex justify-between items-center text-lp-title-md text-lp-on-surface cursor-pointer list-none">
<span>What kind of training is provided for our non-tech-savvy teachers?</span>
<span className="material-symbols-outlined transition-transform group-open:rotate-180 text-lp-primary">expand_more</span>
</summary>
<p className="text-lp-body-md text-lp-on-surface-variant mt-4 pt-3 border-t border-lp-surface-container">
            Every onboarding includes live interactive Zoom or in-person sessions, accompanied by step-by-step short video clips and PDF guides in simple language. We also have a local WhatsApp hotline available throughout school hours.
          </p>
</details>
</div>
</div>
</section>

<section id="demo" className="w-full py-20 bg-lp-surface">
<div className="max-w-7xl mx-auto px-6 lg:px-12">
<div className="bg-lp-primary text-lp-on-primary rounded-lp-xl p-10 lg:p-16 relative overflow-hidden shadow-2xl">

<div className="absolute -right-20 -bottom-20 w-96 h-96 bg-lp-primary-container/40 rounded-full blur-3xl pointer-events-none"></div>
<div className="absolute -left-20 -top-20 w-80 h-80 bg-lp-secondary-container/10 rounded-full blur-3xl pointer-events-none"></div>
<div className="relative z-10 max-w-3xl space-y-6">
<span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lp-primary-container text-lp-on-primary text-lp-label-sm uppercase tracking-wide">
            Next Term Starts Ahead
          </span>
<h2 className="text-lp-headline-xl! text-lp-on-primary! tracking-tight!">
            Ready to modernize your school operations?
          </h2>
<p className="text-lp-body-lg text-lp-on-primary/85">
            Join 350+ leading schools across West Africa. See how SchoolAid saves 20+ hours per teacher every term while eliminating fee leakage.
          </p>
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
<a className="inline-flex items-center justify-center min-h-[52px] px-8 text-lp-label-lg bg-lp-secondary-container text-lp-on-secondary-container hover:bg-lp-secondary-fixed-dim rounded-lp-lg shadow-lp-lg transition-all font-bold group" href={DEMO_HREF}>
<span>Request a Personalized Demo</span>
<span className="material-symbols-outlined ml-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
</a>
<a className="inline-flex items-center justify-center min-h-[52px] px-6 text-lp-label-lg bg-lp-primary-container text-lp-on-primary hover:bg-lp-primary-fixed-dim hover:text-lp-on-primary-fixed rounded-lp-lg transition-all font-semibold" href="tel:+23418884590">
<span className="material-symbols-outlined mr-2 text-[20px]">call</span>
<span>Speak to an Education Specialist</span>
</a>
</div>
<div className="pt-6 flex flex-wrap items-center gap-6 text-xs text-lp-on-primary/70">
<span className="flex items-center gap-1.5">
<span className="material-symbols-outlined text-[16px] text-lp-secondary-container">check_circle</span>
              Free 30-Day Onboarding Pilot
            </span>
<span className="flex items-center gap-1.5">
<span className="material-symbols-outlined text-[16px] text-lp-secondary-container">check_circle</span>
              No Long-Term Binding Contract
            </span>
<span className="flex items-center gap-1.5">
<span className="material-symbols-outlined text-[16px] text-lp-secondary-container">check_circle</span>
              Dedicated Local Representative
            </span>
</div>
</div>
</div>
</div>
</section>
</div></main><footer className="w-full bg-lp-surface-container-low"><div className="max-w-7xl mx-auto px-6 lg:px-12 pt-16 pb-12"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12"><div className="lg:col-span-2 space-y-4"><div className="flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-lp-xl bg-lp-primary-container text-white"><span className="material-symbols-outlined text-[20px]">school</span></span><span className="text-lp-headline-sm text-lp-primary tracking-tight">SchoolAid</span></div><p className="text-lp-body-md text-lp-on-surface-variant max-w-sm">Operating infrastructure designed for West African basic, secondary, and multi-campus institutional administration. Authoritative ledgers, exam record automation, and instant parent engagement.</p><div className="flex items-center gap-3 pt-2"><div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-lp-surface-container-lowest shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-lp-on-surface-variant text-lp-label-sm"><span className="material-symbols-outlined text-lp-primary text-[18px]">verified_user</span><span>NDPR &amp; GDPR Compliant</span></div><div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-lp-surface-container-lowest shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-lp-on-surface-variant text-lp-label-sm"><span className="material-symbols-outlined text-lp-secondary text-[18px]">lock</span><span>256-bit Encrypted</span></div></div></div><div><h4 className="text-lp-label-lg! text-lp-on-surface! mb-4!">Multi-School Systems</h4><ul className="space-y-3 text-lp-body-md text-lp-on-surface-variant"><li><a className="hover:text-lp-primary transition-colors" href="#">Continuous Assessment (CA)</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">WAEC / BECE Gradebooks</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Multi-Campus Bursary</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Automated Fee Reconciliation</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Portal &amp; Web Builder</a></li></ul></div><div><h4 className="text-lp-label-lg! text-lp-on-surface! mb-4!">Platform &amp; Stakeholders</h4><ul className="space-y-3 text-lp-body-md text-lp-on-surface-variant"><li><a className="hover:text-lp-primary transition-colors" href="#">Proprietors &amp; Boards</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">School Bursars &amp; Finance</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Teachers &amp; Form Tutors</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Parent &amp; Guardian Portal</a></li><li><a className="hover:text-lp-primary transition-colors" href="#">Licensing &amp; Tiers</a></li></ul></div><div><h4 className="text-lp-label-lg! text-lp-on-surface! mb-4!">Regional Hubs</h4><div className="space-y-4 text-lp-body-md text-lp-on-surface-variant"><div className="p-3 rounded-lp-lg bg-lp-surface-container-lowest"><p className="text-lp-label-sm text-lp-primary uppercase">Nigeria Operations</p><p className="text-lp-body-md text-lp-on-surface mt-1">Plot 14, Commercial District, Victoria Island, Lagos</p><p className="text-lp-label-sm text-lp-on-surface-variant mt-1">+234 (1) 888 4590</p></div><div className="p-3 rounded-lp-lg bg-lp-surface-container-lowest"><p className="text-lp-label-sm text-lp-primary uppercase">Ghana Operations</p><p className="text-lp-body-md text-lp-on-surface mt-1">Liberation Road, Airport Residential Area, Accra</p><p className="text-lp-label-sm text-lp-on-surface-variant mt-1">+233 (30) 279 8100</p></div></div></div></div><div className="pt-8 mt-8 border-t border-lp-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-lp-body-md text-lp-on-surface-variant"><div>© 2025 SchoolAid Technologies Ltd. All rights reserved.</div><div className="flex items-center gap-6 text-lp-label-md"><a className="hover:text-lp-primary transition-colors" href="#">Privacy Policy</a><a className="hover:text-lp-primary transition-colors" href="#">Terms of Service</a><a className="hover:text-lp-primary transition-colors" href="#">Security Standards</a><a className="hover:text-lp-primary transition-colors" href="#">Help Center</a></div></div></div></footer>
    </div>
  );
}
