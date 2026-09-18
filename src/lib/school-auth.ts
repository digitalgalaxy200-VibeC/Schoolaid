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
  } catch (err: any) {
    console.error("[verifySchoolAdmin] JWT verification failed:", err?.message || err);
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
  } catch (err: any) {
    console.error("[verifyTeacher] JWT verification failed:", err?.message || err);
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
  } catch (err: any) {
    console.error("[verifyStudent] JWT verification failed:", err?.message || err);
  }
  return { authorized: false, school_id: null, userId: null };
}
