import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

const getSecret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "");

function validatePolicy(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character (e.g. @, #, $, !).";
  return null;
}

async function updatePassword(userId: string, password: string) {
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({ password }),
  });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getSecret());
    if (!payload.role || !payload.sub) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const supabase = getServiceClient();
    const ip = req.headers.get("x-forwarded-for") || "";

    // Super Admin: auto-generates or accepts provided password
    if (payload.role === "super_admin") {
      const body = await req.json().catch(() => ({}));
      let password = body.newPassword && body.newPassword.length >= 4 ? body.newPassword : await generateUniquePassword("SCHOOL", "school_admin");
      await updatePassword(payload.sub as string, password);
      await supabase.from("audit_logs").insert({ user_id: payload.sub, event: "password_changed", ip_address: ip });
      return NextResponse.json({ password });
    }

    const body = await req.json().catch(() => ({}));
    const { currentPassword, newPassword } = body;

    // First-time password creation (must_change_password = true): no current password needed
    const isFirstTime = payload.must_change_password === true;

    if (!isFirstTime && !currentPassword) {
      return NextResponse.json({ error: "Current password is required" }, { status: 400 });
    }

    if (!newPassword) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }

    // Validate against policy
    const policyErr = validatePolicy(newPassword);
    if (policyErr) return NextResponse.json({ error: policyErr }, { status: 400 });

    // Verify current password (skip for first-time setup)
    if (!isFirstTime) {
      const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        body: JSON.stringify({ email: (payload.email as string) || "", password: currentPassword }),
      });
      if (!verifyRes.ok) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    // Update password in Supabase Auth
    await updatePassword(payload.sub as string, newPassword);

    // Clear must_change_password flag
    const table = payload.role === "teacher" ? "teachers" : payload.role === "student" ? "students" : null;
    if (table) {
      await supabase.from(table).update({ must_change_password: false }).eq("profile_id", payload.sub);
    }

    // Log
    await supabase.from("password_history").insert({ password: newPassword, school_prefix: "USR", role: payload.role as string, used_by: payload.sub });
    await supabase.from("audit_logs").insert({ user_id: payload.sub, school_id: payload.school_id, event: "password_changed", ip_address: ip });

    // Clear session — user must re-login with new password
    const response = NextResponse.json({ success: true });
    response.cookies.set("schoolaid-session", "", { maxAge: 0, path: "/" });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: "Failed", details: err?.message }, { status: 500 });
  }
}
