import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10));
  const status = searchParams.get("status") || "active"; // "active" | "archived" | "all"
  const offset = (page - 1) * limit;

  const supabase = getServiceClient();

  let query = supabase
    .from("students")
    .select(
      "*, profiles(full_name, email, avatar_url, phone, is_active), classes(name)",
      { count: "exact" }
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (classId) query = query.eq("class_id", classId);
  if (search) query = query.ilike("profiles.full_name", `%${search}%`);

  // Filter by is_active on the joined profiles table
  if (status === "active") query = query.eq("profiles.is_active", true);
  else if (status === "archived") query = query.eq("profiles.is_active", false);

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // When filtering by profile fields via join, Supabase returns nulls for non-matching rows
  // Filter them out client-side if search is active
  let filtered = data || [];
  if (search) {
    filtered = filtered.filter((s: any) =>
      s.profiles?.full_name?.toLowerCase().includes(search.toLowerCase())
    );
  }
  if (status === "active") {
    filtered = filtered.filter((s: any) => s.profiles?.is_active !== false);
  } else if (status === "archived") {
    filtered = filtered.filter((s: any) => s.profiles?.is_active === false);
  }

  return NextResponse.json({
    data: filtered,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
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
    const { first_name, last_name, class_id, date_of_birth, gender, parent_phone, student_id: customStudentId } =
      await request.json();
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (!fName && !lName) {
      return NextResponse.json(
        { error: "At least a first name or last name is required" },
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
    const admissionNumber = customStudentId || `ADM-${seq}`;
    const uniqueSuffix = Date.now().toString(36);
    const email = `student.${admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}-${uniqueSuffix}@school.edu`;
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
        is_active: true,
      });

    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      student_id: admissionNumber,
      class_id: class_id || null,
      date_of_birth: date_of_birth || null,
      gender: gender || null,
      parent_phone: parent_phone || null,
    };
    const { data: student, error } = await supabase
      .from("students")
      .insert(insertData)
      .select("*, profiles(full_name, email, avatar_url, phone, is_active), classes(name)")
      .single();
    if (error) {
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
      student_id,
      is_active,
      avatar_url,
    } = await request.json();
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();

    // Update name + is_active in profiles if changed
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    const { data: s } = await supabase
      .from("students")
      .select("profile_id")
      .eq("id", id)
      .single();

    if (s?.profile_id) {
      const profileUpdates: Record<string, unknown> = {};
      if (fName || lName) {
        profileUpdates.full_name =
          [fName, lName].filter(Boolean).join(" ") || "Unnamed Student";
      }
      if (is_active !== undefined) profileUpdates.is_active = is_active;
      if (avatar_url) profileUpdates.avatar_url = avatar_url;
      if (Object.keys(profileUpdates).length > 0) {
        await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq("id", s.profile_id);
      }
    }

    const updates: Record<string, unknown> = {};
    if (class_id !== undefined) updates.class_id = class_id || null;
    if (date_of_birth !== undefined) updates.date_of_birth = date_of_birth || null;
    if (gender !== undefined) updates.gender = gender || null;
    if (parent_phone !== undefined) updates.parent_phone = parent_phone || null;
    if (student_id !== undefined) updates.student_id = student_id || null;

    const { data, error } = await supabase
      .from("students")
      .update(updates)
      .eq("id", id)
      .eq("school_id", school_id)
      .select("*, profiles(full_name, email, avatar_url, phone, is_active), classes(name)")
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

// PATCH — archive/restore (set is_active)
export async function PATCH(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, is_active } = await request.json();
    if (!id || is_active === undefined)
      return NextResponse.json(
        { error: "id and is_active required" },
        { status: 400 },
      );

    const supabase = getServiceClient();
    const { data: s } = await supabase
      .from("students")
      .select("profile_id")
      .eq("id", id)
      .eq("school_id", school_id)
      .single();

    if (!s)
      return NextResponse.json({ error: "Student not found" }, { status: 404 });

    await supabase
      .from("profiles")
      .update({ is_active })
      .eq("id", s.profile_id);

    return NextResponse.json({ success: true, is_active });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 },
    );
  }
}
