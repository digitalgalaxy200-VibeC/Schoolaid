"use client";

import { useState } from "react";
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
  MailIcon,
  PinIcon,
  ShieldIcon,
  WhatsAppIcon,
} from "@/components/landing/icons";
import { PLACEHOLDERS, bookingLink, whatsappLink } from "@/lib/landing/placeholders";
import { TRANSLATIONS, type LandingLanguage } from "@/lib/landing/translations";

const APPLY = "#apply";
const BOOK = bookingLink();
const WHATSAPP = whatsappLink("Hello SchoolAid, I would like to talk about my school.");

/* ── Phone Mockup Component ─────────────────────────────────────────────── */

type HeroCopy = {
  mockupReportCard: string;
  mockupTerm: string;
  mockupStudent: string;
  mockupSubject: string;
  mockupScore: string;
  mockupGrade: string;
  mockupAverage: string;
  mockupPosition: string;
  mockupInClass: string;
  mockupDisclaimer: string;
};

function PhoneMockup({ t }: { t: HeroCopy }) {
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
            {t.mockupReportCard}
          </p>
          <p className="sa-serif mt-1 text-center text-[16px] font-semibold text-[#0f1f3d]">
            {t.mockupTerm}
          </p>
          <p className="text-center text-[11px] font-semibold text-[#1e293b]">{t.mockupStudent}</p>

          <div className="mt-3 overflow-hidden rounded-[10px] border border-[#e6dfd3]">
            <div className="flex items-center justify-between bg-[#f4eee4] px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[#4a586e]">
              <span>{t.mockupSubject}</span>
              <span className="flex gap-3">
                <span>{t.mockupScore}</span>
                <span>{t.mockupGrade}</span>
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
            <span className="text-[10px] font-semibold uppercase tracking-wide">{t.mockupAverage}</span>
            <span className="text-[14px] font-black tabular-nums">80.2%</span>
          </div>

          <div className="mt-2.5 flex gap-1.5">
            <div className="flex-1 rounded-[8px] bg-[#eaf4ef] px-2 py-1.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#155f45]">{t.mockupPosition}</p>
              <p className="text-[14px] font-black text-[#0f1f3d]">3<span className="text-[10px] font-normal">rd</span></p>
            </div>
            <div className="flex-1 rounded-[8px] bg-[#f4eee4] px-2 py-1.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[#7a5a2e]">{t.mockupInClass}</p>
              <p className="text-[14px] font-black text-[#0f1f3d]">32</p>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[13px] font-semibold text-[#1e293b]">
        {t.mockupDisclaimer}
      </p>
    </figure>
  );
}

/* ── Split Card Component ────────────────────────────────────────────────── */

function SplitCard({
  tone,
  label,
  items,
}: {
  tone: "before" | "after";
  label: string;
  items: readonly string[];
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

/* ── Section Divider ─────────────────────────────────────────────────────── */

function SectionDivider() {
  return (
    <div className="sa-container">
      <div className="h-px bg-gradient-to-r from-transparent via-[#e6dfd3] to-transparent" />
    </div>
  );
}

/* ── Interactive Landing Page ────────────────────────────────────────────── */

export function LandingPageClient() {
  const [lang, setLang] = useState<LandingLanguage>("en");
  const t = TRANSLATIONS[lang];

  const schoolsServed: string = PLACEHOLDERS.SCHOOLS_SERVED;
  const screenshotUrl: string = PLACEHOLDERS.SCREENSHOT_URL;
  const demoVideoUrl: string = PLACEHOLDERS.DEMO_VIDEO_URL;
  const schoolQuote: string = PLACEHOLDERS.SCHOOL_QUOTE;
  const schoolQuoteWho: string = PLACEHOLDERS.SCHOOL_QUOTE_ATTRIBUTION;
  const schoolLogo: string = PLACEHOLDERS.SCHOOL_LOGO_URL;

  const proofPresent = Boolean(schoolsServed || screenshotUrl || demoVideoUrl || schoolQuote);

  return (
    <>
      <SiteHeader
        applyHref={APPLY}
        whatsappHref={WHATSAPP}
        lang={lang}
        onLanguageChange={setLang}
        labels={t.nav}
      />

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
                    {t.hero.eyebrow}
                  </span>
                </div>

                <h1 className="sa-h1 mt-5 max-w-[16ch] text-[#0f1f3d] leading-[1.1]">
                  {t.hero.titleStart}
                  <span className="relative whitespace-nowrap">
                    {t.hero.titleHighlight}
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
                  {t.hero.subtitle}
                </p>

                <p className="sa-body mt-5 max-w-[46ch] text-[#4a586e] leading-relaxed">
                  {t.hero.body}
                </p>

                {/* Main CTA & Secondary Action Buttons */}
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <a href={APPLY} className="sa-btn sa-btn-primary">
                    {t.hero.applyBtn}
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
                      {t.hero.whatsappBtn}
                    </a>
                  ) : (
                    <a
                      href={BOOK !== APPLY ? BOOK : "#contact"}
                      className="sa-btn sa-btn-ghost"
                    >
                      <CalendarCheckIcon className="h-5 w-5 text-[#2a4b8d]" />
                      {t.hero.discoveryBtn}
                    </a>
                  )}
                </div>

                {/* Trust micro-row */}
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                  {t.hero.trust.map((trust) => (
                    <span key={trust} className="flex items-center gap-1.5 text-[13px] font-medium text-[#1e293b]">
                      <CheckIcon className="h-3.5 w-3.5 text-[#1f7a5a]" />
                      {trust}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-[13px] font-semibold text-[#1e293b]">
                  {t.hero.countries}
                </p>
              </div>

              {/* Right column — mockup on desktop */}
              <div className="relative hidden lg:flex lg:items-end lg:justify-center lg:pb-0">
                <div className="relative">
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
                    <PhoneMockup t={t.hero} />
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile mockup */}
            <div className="mt-8 lg:hidden">
              <PhoneMockup t={t.hero} />
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-10 border-t border-[#e6dfd3] bg-white/80 backdrop-blur-sm">
            <div className="sa-container">
              <div className="grid grid-cols-2 divide-x divide-[#e6dfd3] sm:grid-cols-4">
                {t.hero.stats.map((stat) => (
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
              <p className="sa-eyebrow">{t.challenge.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                {t.challenge.title}
              </h2>
              <p className="sa-body mt-4 text-[#4a586e] leading-relaxed">
                {t.challenge.body}
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <SplitCard tone="before" label={t.challenge.beforeLabel} items={t.challenge.before} />
              <SplitCard tone="after" label={t.challenge.afterLabel} items={t.challenge.after} />
            </div>

            <div className="mt-8 rounded-2xl border border-[#e0d6c6] bg-[#f9f6f1] p-5 sm:p-6">
              <p className="sa-body text-[#243349] leading-relaxed max-w-[56ch]">
                <span className="font-bold text-[#0f1f3d]">{t.challenge.calloutStart}</span>{" "}
                {t.challenge.calloutEnd}
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how-it-works" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">{t.howItWorks.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">{t.howItWorks.title}</h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                {t.howItWorks.body}
              </p>
            </div>

            <div className="mt-10 grid gap-0 md:grid-cols-2 md:gap-x-12">
              {t.howItWorks.steps.map((step, index) => (
                <div
                  key={step.title}
                  className={`relative flex gap-4 pb-6 ${index === t.howItWorks.steps.length - 1 ? "pb-0" : ""}`}
                >
                  {index < t.howItWorks.steps.length - 1 ? (
                    <span
                      className="absolute left-[13px] top-8 h-[calc(100%-0.5rem)] w-px bg-gradient-to-b from-[#2a4b8d]/30 to-transparent"
                      aria-hidden="true"
                    />
                  ) : null}
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
                {t.howItWorks.milestone}
              </p>
            </div>

            {/* We do / You bring */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2a4b8d] mb-2">
                  {t.howItWorks.weDoTitle}
                </p>
                <ul className="space-y-2">
                  {t.howItWorks.weDo.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[14px] text-[#243349]">
                      <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#2a4b8d]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e] mb-2">
                  {t.howItWorks.youBringTitle}
                </p>
                <ul className="space-y-2">
                  {t.howItWorks.youBring.map((item) => (
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
              <p className="sa-eyebrow">{t.digitise.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                {t.digitise.title}
              </h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                {t.digitise.body}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
              {t.digitise.modules.map((mod) => {
                const isLarge = "large" in mod && Boolean(mod.large);
                const { key, title, benefit, body, Icon } = mod;
                return isLarge ? (
                  <div
                    key={key}
                    className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a3570] via-[#2a4b8d] to-[#1e3a7a] p-6 text-white shadow-xl md:col-span-2 md:row-span-2"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute -top-10 -right-10 h-48 w-48 rounded-full opacity-10 blur-3xl"
                      style={{ background: "#f5a524" }}
                    />
                    <div className="relative">
                      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                        <Icon className="h-6 w-6 text-[#f5a524]" />
                      </div>
                      <h3 className="sa-h2 mt-5 max-w-[16ch] leading-tight !text-white" style={{ color: "#ffffff" }}>
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
                );
              })}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Revenue calculator ───────────────────────────────────────────── */}
        <section id="revenue" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">{t.revenue.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                {t.revenue.title}
              </h2>
              <p className="sa-body mt-4 text-[#4a586e] leading-relaxed">
                {t.revenue.body}
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
              <p className="sa-eyebrow">{t.pricing.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">{t.pricing.title}</h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                {t.pricing.body}
              </p>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              {/* Setup card */}
              <div className="rounded-2xl border border-[#e6dfd3] bg-white p-6 shadow-sm sm:p-7">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e]">
                  {t.pricing.setupTitle}
                </p>
                <div className="mt-3 flex items-baseline gap-2">
                  <p className="sa-h1 text-[#0f1f3d]">{t.pricing.setupPrice}</p>
                </div>
                <p className="mt-1 text-[13px] text-[#6b7686]">{t.pricing.setupNote}</p>
                <div className="my-5 h-px bg-[#e6dfd3]" />
                <ul className="space-y-3">
                  {t.pricing.setupFeatures.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[#243349]">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#2a4b8d]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Per-student card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a3570] to-[#2a4b8d] p-6 text-white shadow-xl sm:p-7">
                <div className="absolute top-5 right-5 rounded-full bg-[#f5a524] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-[#0f1f3d]">
                  {t.pricing.ongoingBadge}
                </div>
                <div
                  aria-hidden="true"
                  className="absolute -bottom-12 -right-12 h-48 w-48 rounded-full opacity-10 blur-3xl"
                  style={{ background: "#f5a524" }}
                />
                <div className="relative">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#f5a524]">
                    {t.pricing.ongoingTitle}
                  </p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <p className="sa-h1 !text-white" style={{ color: "#ffffff" }}>{t.pricing.ongoingPrice}</p>
                    <span className="text-[14px] text-[#c5d3ef]">{t.pricing.ongoingUnit}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-[#c5d3ef]">{t.pricing.ongoingNote}</p>
                  <div className="my-5 h-px bg-white/15" />
                  <ul className="space-y-3">
                    {t.pricing.ongoingFeatures.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-[15px] leading-relaxed text-[#e7ecf5]">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#f5a524]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a href={APPLY} className="sa-btn sa-btn-light mt-7 w-full">
                    {t.pricing.ongoingBtn}
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Footer notes */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <p className="rounded-xl bg-[#f9f6f1] p-4 text-[13px] leading-relaxed text-[#4a586e]">
                {t.pricing.extras}
              </p>
              <p className="rounded-xl bg-[#f9f6f1] p-4 text-[13px] leading-relaxed text-[#4a586e]">
                {t.pricing.confirm}
              </p>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ── Trust ────────────────────────────────────────────────────────── */}
        <section id="trust" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">{t.trust.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                {t.trust.title}
              </h2>
            </div>

            {/* Founder card */}
            <div className="mt-8 rounded-2xl border border-[#e6dfd3] bg-white p-5 shadow-sm sm:flex sm:gap-6 sm:p-7">
              <div className="mb-4 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-dashed border-[#d5c9b5] text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-[#6b6357] sm:mb-0 whitespace-pre-line">
                {t.trust.founderPhoto}
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#0f1f3d]">{t.trust.founderTitle}</p>
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
                <p className="text-[15px] font-bold text-[#0f1f3d]">{t.trust.privacyTitle}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-[#4a586e]">
                  {PLACEHOLDERS.PRIVACY_TEXT ||
                    "[PRIVACY STATEMENT — how records are stored, who can access them, and what happens if a school leaves.]"}
                </p>
              </div>
            </div>

            {/* Francophone pilot */}
            <div className="mt-4 rounded-2xl border border-[#e0c9a3] bg-gradient-to-r from-[#fdf3e3] to-[#fdf8ef] p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7a5a2e] mb-2">
                {t.trust.pilotBadge}
              </p>
              <p className="text-[14px] leading-relaxed text-[#5a5247]">
                {t.trust.pilotBody}
              </p>
            </div>
          </div>
        </section>

        {/* ── Vision ───────────────────────────────────────────────────────── */}
        <section
          id="vision"
          className="relative overflow-hidden bg-[#0f1f3d] py-16 sm:py-24 text-white"
          style={{ backgroundColor: "#0f1f3d", color: "#ffffff" }}
        >
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
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#f5a524]" style={{ color: "#f5a524" }}>
              {t.vision.eyebrow}
            </p>
            <h2 className="sa-h2 mt-3 max-w-[22ch] leading-snug !text-white" style={{ color: "#ffffff" }}>
              {t.vision.title}
            </h2>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-[#c5d3ef]" style={{ color: "#c5d3ef" }}>
              {t.vision.body}
            </p>
            <a href={APPLY} className="sa-btn sa-btn-light mt-8 inline-flex">
              {t.vision.cta}
              <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* ── Application ──────────────────────────────────────────────────── */}
        <section id="apply" className="sa-section bg-[#f9f6f1]">
          <div className="sa-container">
            <div className="max-w-xl">
              <p className="sa-eyebrow">{t.apply.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">
                {t.apply.title}
              </h2>
              <p className="sa-body mt-3 text-[#4a586e] leading-relaxed">
                {t.apply.body}
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
              <p className="sa-eyebrow">{t.faq.eyebrow}</p>
              <h2 className="sa-h2 mt-3 text-[#0f1f3d]">{t.faq.title}</h2>
            </div>

            <div className="mt-8 divide-y divide-[#e6dfd3] overflow-hidden rounded-2xl border border-[#e6dfd3] bg-white shadow-sm">
              {t.faq.items.map((item) => (
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
              <p className="sa-eyebrow">{t.contact.eyebrow}</p>
              <h2 className="sa-h2 mt-3 max-w-[22ch] text-[#0f1f3d] leading-snug">
                {t.contact.title}
              </h2>
              <p className="sa-body mt-4 max-w-[50ch] text-[#4a586e] leading-relaxed">
                {t.contact.body}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={APPLY} className="sa-btn sa-btn-primary">
                  {t.contact.applyBtn}
                  <ArrowRightIcon className="h-4 w-4" />
                </a>
                {BOOK !== APPLY ? (
                  <a
                    href={BOOK}
                    {...(BOOK.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="sa-btn sa-btn-ghost"
                  >
                    {t.contact.discoveryBtn}
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
                      {t.contact.whatsappLabel}
                    </a>
                  </li>
                ) : (
                  <li className="flex min-h-[48px] items-center gap-3 text-[16px] text-[#9aa3ad]">
                    <WhatsAppIcon className="h-5 w-5" />
                    {t.contact.whatsappLabel} — [WHATSAPP NUMBER]
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
                {t.footer.description}
              </p>
              <p className="mt-3 text-[12px] text-[#5d7799] whitespace-pre-line">
                {t.footer.regions}
              </p>
            </div>

            {/* Nav */}
            <nav aria-label="Explore">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#5d7799] mb-3">
                {t.footer.exploreTitle}
              </p>
              <ul className="space-y-0.5">
                {[
                  [t.nav.howItWorks, "#how-it-works"],
                  [t.nav.digitise, "#digitise"],
                  [t.nav.pricing, "#pricing"],
                  [t.nav.vision, "#vision"],
                  [t.nav.apply, "#apply"],
                  [t.nav.faq, "#faq"],
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
                {t.footer.contactTitle}
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
                    {t.footer.loginLink}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-1 border-t border-white/[0.07] pt-6 text-[12px] text-[#4a607c] sm:flex-row sm:justify-between">
            <p>© {new Date().getFullYear()} SchoolAid. {t.footer.copyright}</p>
            <p>{t.footer.disclaimer}</p>
          </div>
        </div>
      </footer>

      <StickyBar whatsappHref={WHATSAPP} />
    </>
  );
}
