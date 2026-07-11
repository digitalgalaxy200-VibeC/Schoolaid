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
    .select("*, profiles(full_name, email, phone, avatar_url)")
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
        { error: "SUPABASE_SERVICE_ROLE_KEY missing" },
        { status: 500 },
      );
    }
    const { first_name, last_name, email, phone, qualification } =
      await request.json();
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (!fName && !lName)
      return NextResponse.json(
        { error: "At least a first name or last name is required" },
        { status: 400 },
      );

    const supabase = getServiceClient();
    const password = "teacher123";
    const fullName =
      [fName, lName].filter(Boolean).join(" ") || "Unnamed Teacher";
    const uniqueSuffix = Date.now().toString(36);
    const safeEmail = email
      ? `${email.split("@")[0]}-${uniqueSuffix}@${email.split("@")[1] || "school.edu"}`
      : `teacher-${uniqueSuffix}@school.edu`;

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
      const ad = await authRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: ad.msg || ad.message || `Auth error (${authRes.status})` },
        { status: 500 },
      );
    }
    const authData = await authRes.json();
    const userId = authData.user?.id || authData.id;
    if (!userId)
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 },
      );

    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        school_id,
        full_name: fullName,
        email: safeEmail,
        role: "teacher",
      });

    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      employee_id: `T-${Date.now().toString(36).toUpperCase()}`,
      qualification: qualification || null,
      generated_password: password,
      must_change_password: true,
    };
    const { data: teacher, error } = await supabase
      .from("teachers")
      .insert(insertData)
      .select("*, profiles(full_name, email, phone, avatar_url)")
      .single();
    if (error) {
      if (error.message?.includes("generated_password")) {
        delete insertData.generated_password;
        delete insertData.must_change_password;
        const { data: t2, error: e2 } = await supabase
          .from("teachers")
          .insert(insertData)
          .select("*, profiles(full_name, email, phone, avatar_url)")
          .single();
        if (e2)
          return NextResponse.json({ error: e2.message }, { status: 500 });
        return NextResponse.json({ ...t2, password, email: safeEmail });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ...teacher, password, email: safeEmail });
  } catch (err: any) {
    console.error("[teachers] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, first_name, last_name, phone, qualification, staff_role } =
      await request.json();
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();

    // If name changed, update profiles too
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (fName || lName) {
      const fullName =
        [fName, lName].filter(Boolean).join(" ") || "Unnamed Teacher";
      const { data: t } = await supabase
        .from("teachers")
        .select("profile_id")
        .eq("id", id)
        .single();
      if (t?.profile_id) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", t.profile_id);
      }
    }

    const updates: Record<string, unknown> = {};
    if (phone !== undefined) updates.phone = phone || null;
    if (qualification !== undefined)
      updates.qualification = qualification || null;
    if (staff_role !== undefined) updates.staff_role = staff_role || null;

    const { data, error } = await supabase
      .from("teachers")
      .update(updates)
      .eq("id", id)
      .eq("school_id", school_id)
      .select("*, profiles(full_name, email, phone, avatar_url)")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[teachers] PUT error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 },
    );
  }
}
