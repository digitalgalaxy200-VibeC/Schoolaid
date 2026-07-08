import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const getJwtSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

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
  } catch {}

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
  } catch {}

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
  } catch {}

  return { authorized: false, school_id: null, userId: null };
}
