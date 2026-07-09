import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("teachers")
    .select("*, profiles(full_name, email)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error:
            "Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing",
        },
        { status: 500 },
      );
    }

    const { first_name, last_name, email, phone, qualification } =
      await request.json();
    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { error: "first_name, last_name, and email required" },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const password = "teacher123";
    const fullName = `${first_name} ${last_name}`;

    // Unique email to avoid collisions
    const uniqueSuffix = Date.now().toString(36);
    const safeEmail = email.includes("@")
      ? `${email.split("@")[0]}-${uniqueSuffix}@${email.split("@")[1]}`
      : `${email}-${uniqueSuffix}@school.edu`;

    // Create auth user
    const authRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({
          email: safeEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "teacher", school_id },
        }),
      },
    );

    if (!authRes.ok) {
      const authData = await authRes.json().catch(() => ({}));
      console.error("[teachers] Auth API failed:", authRes.status, authData);
      return NextResponse.json(
        {
          error:
            authData.msg ||
            authData.message ||
            `Auth service error (${authRes.status})`,
        },
        { status: 500 },
      );
    }

    const authData = await authRes.json();
    if (!authData.user?.id && !authData.id) {
      console.error("[teachers] Auth creation returned no user:", authData);
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 },
      );
    }

    const userId = authData.user?.id || authData.id;

    // Create profile
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      school_id,
      full_name: fullName,
      email: safeEmail,
      role: "teacher",
    });
    if (profileError) {
      console.error("[teachers] Profile insert failed:", profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    // Insert teacher record
    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      employee_id: `T-${Date.now().toString(36).toUpperCase()}`,
      qualification: qualification || null,
    };

    const { data: teacher, error } = await supabase
      .from("teachers")
      .insert({
        ...insertData,
        generated_password: password,
        must_change_password: true,
      })
      .select("*, profiles(full_name, email)")
      .single();

    if (error) {
      if (
        error.message?.includes("generated_password") ||
        error.message?.includes("must_change_password")
      ) {
        const { data: retryTeacher, error: retryError } = await supabase
          .from("teachers")
          .insert(insertData)
          .select("*, profiles(full_name, email)")
          .single();
        if (retryError) {
          console.error("[teachers] Teacher insert failed:", retryError);
          return NextResponse.json(
            { error: retryError.message },
            { status: 500 },
          );
        }
        return NextResponse.json({
          ...retryTeacher,
          password,
          email: safeEmail,
        });
      }
      console.error("[teachers] Teacher insert failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...teacher, password, email: safeEmail });
  } catch (err: any) {
    console.error("[teachers] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
