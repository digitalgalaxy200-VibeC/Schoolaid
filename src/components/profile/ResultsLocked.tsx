"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { FIELD_ACTIONS, FIELD_LABELS, type ProfileField } from "@/lib/auth/profile-completion";

/**
 * Why a student cannot see their results yet — in TWO parts that other refusal
 * screens skip:
 *
 *   1. THE REASON. "Finish your profile" is an instruction; it is not a reason.
 *      A result sheet is the child's academic record for the term, and the
 *      school will not release it until it can identify the student (date of
 *      birth, photo) and reach someone (a number to call) if something is wrong.
 *
 *   2. THE ACTIONS. Each missing field comes with what to type, taken from
 *      `FIELD_ACTIONS` so the wording lives with the rule it explains.
 *
 * The button goes to the profile page, where every field listed here can be
 * filled — a gate whose list cannot be acted on is a wall, not a gate.
 */
export function ResultsLocked({
  percent,
  required,
  missing,
}: {
  percent: number;
  required: number;
  missing: ProfileField[];
}) {
  // Long lists bury the instructions; the rest are still on the profile page.
  const steps = missing.slice(0, 6);

  return (
    <Card variant="default" className="shadow-sm">
      <div className="p-5 space-y-5">
        <div>
          <h1 className="text-h2 font-bold text-text-primary">Results unlock at {required}%</h1>
          <p className="text-body text-text-secondary mt-1">
            Your record is <strong className="text-text-primary">{percent}%</strong> complete. You
            need {required}% to open a result sheet.
          </p>
        </div>

        <div className="rounded-lg border border-info bg-info-bg px-4 py-3">
          <p className="text-small font-semibold text-text-primary">Why this step exists</p>
          <p className="text-small text-text-secondary mt-1">
            A result sheet is your academic record for the term. Before the school releases it, the
            record must carry your date of birth and photograph, so the office can identify you, and
            a number to call in an emergency, so your family can be reached if anything is wrong.
          </p>
        </div>

        {steps.length > 0 ? (
          <div>
            <p className="text-small font-semibold text-text-primary">What to do</p>
            <ul className="mt-2 space-y-2">
              {steps.map((field) => (
                <li key={field} className="flex gap-2 text-small text-text-secondary">
                  <span aria-hidden="true" className="font-bold text-primary">
                    •
                  </span>
                  <span>
                    <strong className="text-text-primary">{FIELD_LABELS[field]}</strong>
                    {" — "}
                    {FIELD_ACTIONS[field] ?? `Add your ${FIELD_LABELS[field].toLowerCase()}.`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-small text-text-secondary">
            Your details are recorded. Reload this page — if it stays locked, ask your school office
            to check your record.
          </p>
        )}

        <Link href="/student/profile">
          <Button>Complete my profile</Button>
        </Link>
      </div>
    </Card>
  );
}
