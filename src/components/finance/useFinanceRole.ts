"use client";

import { useEffect, useState } from "react";

export type FinanceRole = "admin" | "bursar";

/**
 * The signed-in account's finance capability.
 *
 * The server is the authority — every route that moves money or changes fees
 * checks `finance_role` itself. This hook exists only so a bursar is not shown
 * buttons that will be refused: hide the control, keep the check.
 *
 * Defaults to "admin" while loading and on any error, matching the API's
 * fail-open rule, so a slow or failed request never takes a control away from a
 * real administrator.
 */
export function useFinanceRole(): { role: FinanceRole; canChangeLedger: boolean; loading: boolean } {
  const [role, setRole] = useState<FinanceRole>("admin");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { finance_role?: string } | null) => {
        if (cancelled) return;
        setRole(d?.finance_role === "bursar" ? "bursar" : "admin");
      })
      .catch(() => {
        // Leave the fail-open default in place.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { role, canChangeLedger: role !== "bursar", loading };
}
