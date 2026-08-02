// ============================================================
// Copilot Auth — verifies super admin access for copilot APIs.
// Supports both school-scoped and super-admin-level operations.
// ============================================================

import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const getJwtSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

export interface CopilotAuthResult {
  authorized: boolean;
  userId: string | null;
  schoolId?: string;
  /** When true, operating at super-admin level (no school context needed) */
  isSuperAdminLevel: boolean;
  errorResponse?: NextResponse;
}

/**
 * Verify super admin access. If schoolId is provided, operations are
 * scoped to that school. If omitted, operates at super-admin level
 * (e.g., creating schools, listing all schools, provisioning admins).
 */
export async function verifyCopilotAccess(
  request: Request,
  requestSchoolId?: string,
): Promise<CopilotAuthResult> {
  // 1. Check if DEEPSEEK_API_KEY is configured
  if (!process.env.DEEPSEEK_API_KEY) {
    return {
      authorized: false,
      userId: null,
      isSuperAdminLevel: false,
      errorResponse: NextResponse.json(
        { error: "AI Copilot is not configured. Please add DEEPSEEK_API_KEY to environment variables." },
        { status: 501 },
      ),
    };
  }

  // 2. Verify super admin auth
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized || !userId) {
    return {
      authorized: false,
      userId: null,
      isSuperAdminLevel: false,
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // 3. Extract school_id from request or impersonation context
  let schoolId: string | undefined = requestSchoolId;

  if (!schoolId) {
    const cookieStore = await cookies();
    const session = cookieStore.get("schoolaid-session")?.value;
    if (session) {
      try {
        const { payload } = await jwtVerify(session, getJwtSecret());
        if (payload.impersonated && payload.school_id) {
          schoolId = payload.school_id as string;
        }
      } catch {
        // Not impersonating or invalid session
      }
    }
  }

  // If no school_id, operate at super-admin level (allowed)
  return {
    authorized: true,
    userId,
    schoolId,
    isSuperAdminLevel: !schoolId,
  };
}
