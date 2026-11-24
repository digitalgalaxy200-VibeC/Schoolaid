// ============================================================================
// Finance — who may do what inside a school
//
// A bursar is a school administrator who takes money and reads reports. They
// must not be able to void a payment, recalculate bills, or rewrite the fee
// setup, because each of those changes what every other figure means.
//
// This is an AUTHORISATION capability, not an authentication role:
// `profiles.role` still says `school_admin`, so the portal, the JWT and every
// RLS policy are unchanged. Only the routes that move money ask this question.
//
// FAIL-OPEN, DELIBERATELY
// -----------------------
// If the column is missing (migration 084 not applied) or the lookup fails, the
// account is treated as `admin` — today's behaviour. Nobody can be a bursar by
// accident, so failing open cannot grant a capability that was not explicitly
// granted, and it keeps the code shippable before the migration runs.
// ============================================================================

import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export type FinanceRole = "admin" | "bursar";

/**
 * Set once the column proves absent. Without it, a deployment that ships before
 * migration 084 would send a failing query on every guarded request.
 */
let columnMissing = false;

export type FinanceAuth =
  | { authorized: false }
  | {
      authorized: true;
      school_id: string;
      userId: string | null;
      role: FinanceRole;
    };

/** Read one account's finance role. Unknown/missing → "admin". */
export async function loadFinanceRole(userId: string | null): Promise<FinanceRole> {
  if (!userId) return "admin";
  if (columnMissing) return "admin";

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("finance_role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Most likely: migration 084 has not run. Treat as a full admin, exactly as
    // the platform behaved before this feature existed — and stop asking, so a
    // missing column does not turn every /me call into a failed query. A deploy
    // (or a restart) after the migration picks the column up.
    columnMissing = true;
    return "admin";
  }
  return (data as { finance_role?: string | null } | null)?.finance_role === "bursar"
    ? "bursar"
    : "admin";
}

/** The session plus the finance role. Use in routes that move money or change fees. */
export async function verifyFinanceAdmin(): Promise<FinanceAuth> {
  const session = await verifySchoolAdmin();
  if (!session.authorized || !session.school_id) return { authorized: false };
  return {
    authorized: true,
    school_id: session.school_id,
    userId: session.userId,
    role: await loadFinanceRole(session.userId),
  };
}

/**
 * A standard refusal a bursar can act on. It names the capability and says who
 * can do it, instead of a bare 403.
 */
export function bursarRefusal(action: string): NextResponse {
  return NextResponse.json(
    {
      error: `A bursar cannot ${action}. Ask a school administrator to do it.`,
      code: "bursar_not_allowed",
    },
    { status: 403 },
  );
}

/** True when the role may void, recalculate, waive, or edit fee configuration. */
export const mayChangeLedger = (role: FinanceRole): boolean => role !== "bursar";

/** True when the role may record payments and read reports. */
export const mayRecordPayments = (role: FinanceRole): boolean =>
  role === "admin" || role === "bursar";
