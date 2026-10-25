"use client";

import { PROFILE_GATE_PERCENT } from "@/lib/auth/profile-completion";

/**
 * How complete a profile is, and what that means right now.
 *
 * The number comes from the server on every read (`/api/auth/me` and the save
 * response), never from a local guess — the gate has to survive a reload and a
 * crafted request.
 */
export function ProfileProgress({
  percent,
  complete,
}: {
  percent: number;
  complete: boolean;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-small font-semibold text-text-primary">Profile completion</p>
        <p className={`text-small font-bold ${complete ? "text-success" : "text-warning"}`}>
          {value}%
        </p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completion"
      >
        <div
          className={`h-full rounded-full transition-all ${complete ? "bg-success" : "bg-warning"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-caption text-text-muted">
        {complete
          ? `You have full access. You can add the remaining details at any time.`
          : `Reach ${PROFILE_GATE_PERCENT}% to open the rest of your dashboard.`}
      </p>
    </div>
  );
}
