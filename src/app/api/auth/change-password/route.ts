import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";

const getSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload;
  try {
    const verified = await jwtVerify(session, getSecret());
    payload = verified.payload;
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { newPassword } = await request.json();
  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json(
      { error: "Password must be at least 4 characters" },
      { status: 400 },
    );
  }

  const userId = payload.sub as string;
  const role = payload.role as string;

  // Update password via Supabase Admin API
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({ password: newPassword }),
    },
  );

  if (!authRes.ok) {
    return NextResponse.json(
      { error: "Failed to update password" },
      { status: 500 },
    );
  }

  // Clear must_change_password flag on the role-specific table
  const supabase = getServiceClient();
  const table = role === "student" ? "students" : role === "teacher" ? "teachers" : null;

  if (table) {
    try {
      await supabase
        .from(table)
        .update({ must_change_password: false, generated_password: null })
        .eq("profile_id", userId);
    } catch {
      console.warn(`[change-password] Could not update ${table}.must_change_password for user ${userId}`);
    }
  }

  return NextResponse.json({ success: true });
}
