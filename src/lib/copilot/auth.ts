// ============================================================
// Copilot Auth — verifies super admin access for copilot APIs
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
  errorResponse?: NextResponse;
}

/**
 * Verify that the request comes from a super admin (direct or impersonating).
 * Returns the user ID and optionally the school ID if impersonating.
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
      errorResponse: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // 3. Extract school_id from request or impersonation context
  let schoolId = requestSchoolId;

  if (!schoolId) {
    // Check if the user is impersonating a school
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

  if (!schoolId) {
    return {
      authorized: false,
      userId,
      errorResponse: NextResponse.json(
        { error: "schoolId is required. Specify which school to manage." },
        { status: 400 },
      ),
    };
  }

  return { authorized: true, userId, schoolId };
}
