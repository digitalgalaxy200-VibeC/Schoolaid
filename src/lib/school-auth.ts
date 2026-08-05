import { cookies } from "next/headers";
import { jwtVerify } from "jose";

/**
 * IMPORTANT: Both login/route.ts and school-auth.ts MUST use the same secret.
 * JWT_SECRET is the primary key. SUPABASE_SERVICE_ROLE_KEY is the fallback.
 * If JWT_SECRET is set in Vercel, it MUST match on both sign and verify sides.
 */
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) console.error("[school-auth] CRITICAL: No JWT secret found — JWT_SECRET and SUPABASE_SERVICE_ROLE_KEY are both missing!");
  return new TextEncoder().encode(secret);
};

export async function verifySchoolAdmin(): Promise<{
  authorized: boolean;
  school_id: string | null;
  userId: string | null;
}> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return { authorized: false, school_id: null, userId: null };

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    if (payload.role === "school_admin" && payload.school_id) {
      return {
        authorized: true,
        school_id: payload.school_id as string,
        userId: payload.sub as string,
      };
    }
    console.error(`[verifySchoolAdmin] Token role mismatch: got '${payload.role}', expected 'school_admin'`);
  } catch (err: any) {
    console.error("[verifySchoolAdmin] JWT verification failed:", err?.message || err);
  }

  return { authorized: false, school_id: null, userId: null };
}

export async function verifyTeacher(): Promise<{
  authorized: boolean;
  school_id: string | null;
  userId: string | null;
}> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return { authorized: false, school_id: null, userId: null };

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    if (payload.role === "teacher" && payload.school_id) {
      return {
        authorized: true,
        school_id: payload.school_id as string,
        userId: payload.sub as string,
      };
    }
    console.error(`[verifyTeacher] Token role mismatch: got '${payload.role}', expected 'teacher'`);
  } catch (err: any) {
    console.error("[verifyTeacher] JWT verification failed:", err?.message || err);
  }

  return { authorized: false, school_id: null, userId: null };
}

export async function verifyStudent(): Promise<{
  authorized: boolean;
  school_id: string | null;
  userId: string | null;
}> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return { authorized: false, school_id: null, userId: null };

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    if (payload.role === "student" && payload.school_id) {
      return {
        authorized: true,
        school_id: payload.school_id as string,
        userId: payload.sub as string,
      };
    }
    console.error(`[verifyStudent] Token role mismatch: got '${payload.role}', expected 'student'`);
  } catch (err: any) {
    console.error("[verifyStudent] JWT verification failed:", err?.message || err);
  }
  return { authorized: false, school_id: null, userId: null };
}
