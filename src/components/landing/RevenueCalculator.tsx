"use client";

import { useMemo, useState } from "react";

/**
 * Revenue illustration — the one interactive element on the page.
 *
 * The model is the published one, unchanged:
 *   parent fees    = students × fee per student per month × 3 months
 *   SchoolAid fee  = students × ₦400 per month × 3 months, floor ₦40,000/term
 *   school's share = parent fees − SchoolAid fee
 *
 * On a phone the two sliders sit above the result, so the number the visitor came
 * for is on screen while they drag. Nothing is invented: every figure below is
 * computed from their input.
 */

const PLATFORM_PER_STUDENT_MONTH = 400;
const PLATFORM_MIN_PER_TERM = 40000;
const MONTHS_PER_TERM = 3;

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;

export function RevenueCalculator() {
  const [students, setStudents] = useState(50);
  const [fee, setFee] = useState(1000);

  const model = useMemo(() => {
    const parentFees = students * fee * MONTHS_PER_TERM;
    const platformFee = Math.max(
      students * PLATFORM_PER_STUDENT_MONTH * MONTHS_PER_TERM,
      PLATFORM_MIN_PER_TERM,
    );
    return { parentFees, platformFee, schoolShare: parentFees - platformFee };
  }, [students, fee]);

  const shortfall = model.schoolShare < 0;

  return (
    <div className="sa-card p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="sa-h3 text-[#0f1f3d]">Work out your numbers</h3>
        <span className="rounded-full bg-[#f4eee4] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#2a4b8d]">
          Illustrative
        </span>
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <label htmlFor="calc-students" className="block text-[14px] font-semibold text-[#0f1f3d]">
            Students in your school
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="calc-students"
              type="range"
              min={10}
              max={1500}
              step={10}
              value={students}
              onChange={(e) => setStudents(clamp(Number(e.target.value), 10, 1500))}
              className="h-2 w-full accent-[#2a4b8d]"
            />
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={1500}
              value={students}
              onChange={(e) => setStudents(clamp(Number(e.target.value), 10, 1500))}
              aria-label="Number of students"
              className="min-h-[44px] w-20 shrink-0 rounded-[10px] border border-[#e6dfd3] bg-white px-2 text-center text-[16px] text-[#0f1f3d]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="calc-fee" className="block text-[14px] font-semibold text-[#0f1f3d]">
            Digital services fee per student, per month
          </label>
          <div className="mt-2 flex items-center gap-3">
            <input
              id="calc-fee"
              type="range"
              min={0}
              max={5000}
              step={100}
              value={fee}
              onChange={(e) => setFee(clamp(Number(e.target.value), 0, 5000))}
              className="h-2 w-full accent-[#2a4b8d]"
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={5000}
              step={100}
              value={fee}
              onChange={(e) => setFee(clamp(Number(e.target.value), 0, 5000))}
              aria-label="Fee per student per month, in naira"
              className="min-h-[44px] w-24 shrink-0 rounded-[10px] border border-[#e6dfd3] bg-white px-2 text-center text-[16px] text-[#0f1f3d]"
            />
          </div>
        </div>
      </div>

      <dl aria-live="polite" className="mt-6 overflow-hidden rounded-[14px] border border-[#e6dfd3]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 bg-white px-4 py-3">
          <dt className="text-[15px] text-[#4a586e]">Parent fees collected per term</dt>
          <dd className="text-[15px] tabular-nums text-[#0f1f3d]">
            {naira.format(model.parentFees)}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-[#e6dfd3] bg-white px-4 py-3">
          <dt className="text-[15px] text-[#4a586e]">
            SchoolAid fee per term
            <span className="mt-0.5 block text-[12px] text-[#6b7686]">
              ₦400 per student per month · ₦40,000 per term minimum
            </span>
          </dt>
          <dd className="text-[15px] tabular-nums text-[#0f1f3d]">
            {naira.format(model.platformFee)}
          </dd>
        </div>
        <div
          className={`flex flex-wrap items-baseline justify-between gap-2 px-4 py-4 ${
            shortfall ? "bg-[#fdecea]" : "bg-[#eaf4ef]"
          }`}
        >
          <dt className={`text-[15px] font-bold ${shortfall ? "text-[#8c1d13]" : "text-[#155f45]"}`}>
            Your school&apos;s additional income
          </dt>
          <dd
            className={`sa-h3 tabular-nums ${shortfall ? "text-[#8c1d13]" : "text-[#155f45]"}`}
          >
            {naira.format(model.schoolShare)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-[13px] leading-relaxed text-[#4a586e]">
        {shortfall
          ? "At this fee the parent fees do not cover SchoolAid's rate. Raise the fee or the student count."
          : "Figures are illustrative. Your school sets its own fee and keeps anything it collects above SchoolAid's rate."}
      </p>
    </div>
  );
}
