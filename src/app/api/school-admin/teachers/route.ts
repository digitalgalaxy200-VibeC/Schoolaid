import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10));
  const status = searchParams.get("status") || "active"; // "active" | "archived" | "all"
  const offset = (page - 1) * limit;

  const supabase = getServiceClient();

  let query = supabase
    .from("teachers")
    .select(
      "*, profiles(full_name, email, phone, avatar_url, is_active)",
      { count: "exact" }
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  let filtered = data || [];

  // Filter by is_active
  if (status === "active") {
    filtered = filtered.filter((t: any) => t.profiles?.is_active !== false);
  } else if (status === "archived") {
    filtered = filtered.filter((t: any) => t.profiles?.is_active === false);
  }

  // Live search filter
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (t: any) =>
        t.profiles?.full_name?.toLowerCase().includes(q) ||
        t.employee_id?.toLowerCase().includes(q) ||
        t.specialization?.toLowerCase().includes(q)
    );
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
    const { first_name, last_name, email, phone, qualification, employee_id, specialization } =
      await request.json();
    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (!fName && !lName)
      return NextResponse.json(
        { error: "At least a first name or last name is required" },
        { status: 400 },
      );

    const supabase = getServiceClient();

    // Fetch school abbreviation
    const { data: schoolData } = await supabase
      .from("schools")
      .select("name, abbreviation")
      .eq("id", school_id)
      .single();
    const abbreviation = schoolData?.abbreviation || (schoolData?.name || "school").substring(0, 5).toLowerCase().replace(/\s/g, "");

    const fullName =
      [fName, lName].filter(Boolean).join(" ") || "Unnamed Teacher";
      
    // Strip titles and non-alphanumeric chars for email
    let cleanName = fullName.replace(/\b(Mr|Mrs|Ms|Miss|Dr|Prof)\b\.?/gi, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    if (!cleanName) cleanName = "teacher";

    // Check if cleanName exists
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("email")
      .eq("school_id", school_id)
      .like("email", `${cleanName}%@${abbreviation}.com`);

    let finalName = cleanName;
    if (existingProfiles && existingProfiles.length > 0) {
      let suffix = 2;
      while (existingProfiles.some(p => p.email === `${cleanName}${suffix}@${abbreviation}.com`)) {
        suffix++;
      }
      finalName = `${cleanName}${suffix}`;
    }

    const safeEmail = email || `${finalName}@${abbreviation}.com`;
    const password = `${abbreviation}123`;

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

    await supabase.from("profiles").upsert({
      id: userId,
      school_id,
      full_name: fullName,
      email: safeEmail,
      phone: phone || null,
      role: "teacher",
      is_active: true,
    });

    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      employee_id: employee_id || `T-${Date.now().toString(36).toUpperCase()}`,
      qualification: qualification || null,
      specialization: specialization || null,
      generated_password: password,
      must_change_password: true,
    };
    const { data: teacher, error } = await supabase
      .from("teachers")
      .insert(insertData)
      .select("*, profiles(full_name, email, phone, avatar_url, is_active)")
      .single();
    if (error) {
      // If generated_password column doesn't exist, retry without it
      if (error.message?.includes("generated_password")) {
        delete insertData.generated_password;
        delete insertData.must_change_password;
        const { data: retryTeacher, error: retryError } = await supabase
          .from("teachers")
          .insert(insertData)
          .select("*, profiles(full_name, email, phone, avatar_url, is_active)")
          .single();
        if (retryError) return NextResponse.json({ error: retryError.message }, { status: 500 });
        return NextResponse.json({ ...retryTeacher, password, email: safeEmail });
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

    const { id, first_name, last_name, phone, qualification, employee_id, specialization, avatar_url, recovery_email } =
      await request.json();
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();

    const fName = (first_name || "").trim();
    const lName = (last_name || "").trim();
    if (fName || lName) {
      const fullName = [fName, lName].filter(Boolean).join(" ") || "Unnamed Teacher";
      const { data: t } = await supabase
        .from("teachers")
        .select("profile_id")
        .eq("id", id)
        .single();
      if (t?.profile_id) {
        const profileUpdates: Record<string, unknown> = { full_name: fullName };
        if (phone !== undefined) profileUpdates.phone = phone || null;
        if (avatar_url) profileUpdates.avatar_url = avatar_url;
        if (recovery_email !== undefined) profileUpdates.recovery_email = recovery_email || null;
        await supabase.from("profiles").update(profileUpdates).eq("id", t.profile_id);
      }
    } else if (phone !== undefined || avatar_url || recovery_email !== undefined) {
      const { data: t } = await supabase
        .from("teachers")
        .select("profile_id")
        .eq("id", id)
        .single();
      if (t?.profile_id) {
        const profileUpdates: Record<string, unknown> = {};
        if (phone !== undefined) profileUpdates.phone = phone || null;
        if (avatar_url) profileUpdates.avatar_url = avatar_url;
        if (recovery_email !== undefined) profileUpdates.recovery_email = recovery_email || null;
        await supabase.from("profiles").update(profileUpdates).eq("id", t.profile_id);
      }
    }

    const updates: Record<string, unknown> = {};
    if (qualification !== undefined) updates.qualification = qualification || null;
    if (employee_id !== undefined) updates.employee_id = employee_id || null;
    if (specialization !== undefined) updates.specialization = specialization || null;

    const { data, error } = await supabase
      .from("teachers")
      .update(updates)
      .eq("id", id)
      .eq("school_id", school_id)
      .select("*, profiles(full_name, email, phone, avatar_url, is_active)")
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

// PATCH — archive / restore teacher
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
    const { data: t } = await supabase
      .from("teachers")
      .select("profile_id")
      .eq("id", id)
      .eq("school_id", school_id)
      .single();

    if (!t)
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

    await supabase.from("profiles").update({ is_active }).eq("id", t.profile_id);

    return NextResponse.json({ success: true, is_active });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 },
    );
  }
}
