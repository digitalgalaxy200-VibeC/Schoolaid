import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

export async function verifySchoolAdmin(): Promise<{
  authorized: boolean;
  school_id: string | null;
  userId: string | null;
  impersonated: boolean;
}> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return { authorized: false, school_id: null, userId: null, impersonated: false };

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    if (payload.role === "school_admin" && payload.school_id) {
      return {
        authorized: true,
        school_id: payload.school_id as string,
        userId: payload.sub as string,
        impersonated: payload.impersonated === true,
      };
    }
    console.error(`[verifySchoolAdmin] Token role mismatch: got '${payload.role}', expected 'school_admin'`);
  } catch (err) {
    console.error(
      "[verifySchoolAdmin] JWT verification failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return { authorized: false, school_id: null, userId: null, impersonated: false };
}

export async function verifyTeacher(): Promise<{
  authorized: boolean;
  school_id: string | null;
  userId: string | null;
  all_classes: boolean;
}> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return { authorized: false, school_id: null, userId: null, all_classes: false };

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    if (payload.role === "teacher" && payload.school_id) {
      return {
        authorized: true,
        school_id: payload.school_id as string,
        userId: payload.sub as string,
        all_classes: payload.all_classes === true,
      };
    }
    console.error(`[verifyTeacher] Token role mismatch: got '${payload.role}', expected 'teacher'`);
  } catch (err) {
    console.error(
      "[verifyTeacher] JWT verification failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return { authorized: false, school_id: null, userId: null, all_classes: false };
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
  } catch (err) {
    console.error(
      "[verifyStudent] JWT verification failed:",
      err instanceof Error ? err.message : err,
    );
  }
  return { authorized: false, school_id: null, userId: null };
}

/**
 * Verifies the session cookie once and returns its raw claims, or null.
 *
 * ADDITIVE — the three verifiers above are untouched. Each of them answers
 * "is the actor of exactly this type?" and logs a role mismatch when it is not,
 * so a caller that must try several roles would emit spurious errors and parse
 * the same JWT up to four times. This returns the claims once and lets the
 * caller decide. JWT verification stays in this module either way.
 *
 * Callers must still make their own authorization decision: possession of a
 * valid session is authentication, not permission.
 */
export async function readSession(): Promise<Record<string, unknown> | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return null;

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    return payload;
  } catch (err) {
    console.error(
      "[readSession] JWT verification failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
