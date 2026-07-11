import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const supabase = getServiceClient();
  let query = supabase
    .from("students")
    .select("*, profiles(full_name, email)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (classId) query = query.eq("class_id", classId);
  const { data, error } = await query;
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
    const { first_name, last_name, class_id, date_of_birth, gender } =
      await request.json();
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if ((!fName && !lName) || !class_id) {
      return NextResponse.json(
        {
          error:
            "At least a first name or last name, plus a class, is required",
        },
        { status: 400 },
      );
    }
    const supabase = getServiceClient();
    const fullName =
      [fName, lName].filter(Boolean).join(" ") || "Unnamed Student";
    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school_id);
    const seq = String((count || 0) + 1).padStart(4, "0");
    const admissionNumber = `ADM-${seq}`;
    const uniqueSuffix = Date.now().toString(36);
    const email = `student.${admissionNumber.toLowerCase()}-${uniqueSuffix}@school.edu`;
    const password = "student123";

    const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
    const authRes = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "student", school_id },
      }),
    });
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
        { error: "Failed to create user account" },
        { status: 500 },
      );

    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        school_id,
        full_name: fullName,
        email,
        role: "student",
      });

    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      student_id: admissionNumber,
      class_id,
      date_of_birth: date_of_birth || null,
      gender: gender || null,
    };
    const { data: student, error } = await supabase
      .from("students")
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
        const { data: r2, error: e2 } = await supabase
          .from("students")
          .insert(insertData)
          .select("*, profiles(full_name, email)")
          .single();
        if (e2)
          return NextResponse.json({ error: e2.message }, { status: 500 });
        return NextResponse.json({ ...r2, password, email });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ...student, password, email });
  } catch (err: any) {
    console.error("[students] POST error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      id,
      first_name,
      last_name,
      class_id,
      date_of_birth,
      gender,
      parent_phone,
    } = await request.json();
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();

    // If name changed, update profiles too
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (fName || lName) {
      const fullName =
        [fName, lName].filter(Boolean).join(" ") || "Unnamed Student";
      const { data: s } = await supabase
        .from("students")
        .select("profile_id")
        .eq("id", id)
        .single();
      if (s?.profile_id) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", s.profile_id);
      }
    }

    const updates: Record<string, unknown> = {};
    if (class_id !== undefined) updates.class_id = class_id;
    if (date_of_birth !== undefined)
      updates.date_of_birth = date_of_birth || null;
    if (gender !== undefined) updates.gender = gender || null;
    if (parent_phone !== undefined) updates.parent_phone = parent_phone || null;

    const { data, error } = await supabase
      .from("students")
      .update(updates)
      .eq("id", id)
      .eq("school_id", school_id)
      .select("*, profiles(full_name, email)")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[students] PUT error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 },
    );
  }
}
