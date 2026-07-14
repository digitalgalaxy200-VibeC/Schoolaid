import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";
import { getJwtSecret as getSecret } from "@/lib/jwt-secret";

// Maps a JWT role claim to the table that stores that role's profile row.
const ROLE_TABLE: Record<string, string> = {
  school_admin: "school_admins",
  teacher: "teachers",
  student: "students",
};

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getSecret());
    if (!payload.role || !payload.sub)
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const supabase = getServiceClient();
    let password = "";

    if (payload.role === "super_admin") {
      const body = await req.json().catch(() => ({}));
      if (!body.newPassword || body.newPassword.length < 4) {
        return NextResponse.json(
          { error: "Password must be at least 4 characters" },
          { status: 400 }
        );
      }
      password = body.newPassword;
    } else {
      if (!payload.school_id) {
        return NextResponse.json({ error: "No school ID" }, { status: 400 });
      }
      const { data: school } = await supabase
        .from("schools")
        .select("name")
        .eq("id", payload.school_id)
        .single();
      if (!school)
        return NextResponse.json({ error: "School not found" }, { status: 404 });

      password = await generateUniquePassword(
        school.name,
        payload.role as string,
      );
    }

    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${payload.sub}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ password }),
      },
    );

    if (payload.role !== "super_admin") {
      await supabase
        .from("password_history")
        .update({ used_by: payload.sub as string })
        .eq("password", password);

      // Clear the plaintext temporary password now that Supabase Auth holds
      // the real (hashed) credential, and clear must_change_password so the
      // forced-change screen doesn't reappear. Neither was ever reset here
      // before — generated_password stayed visible indefinitely (surfaced in
      // credential-export views and, for teachers, a plain table column that
      // has since been removed), and must_change_password was never flipped
      // back to false anywhere in the codebase, which meant the "set a new
      // password" screen would reappear on every subsequent login. See
      // docs/CORRECTIONS_SECURITE.md for details.
      const table = ROLE_TABLE[payload.role as string];
      if (table) {
        await supabase
          .from(table)
          .update({ generated_password: null, must_change_password: false })
          .eq("profile_id", payload.sub as string);
      }
    }

    return NextResponse.json({ password });
  } catch (err: any) {
    console.error("Change password error:", err);
    return NextResponse.json({ error: "Failed", details: err?.message }, { status: 500 });
  }
}

