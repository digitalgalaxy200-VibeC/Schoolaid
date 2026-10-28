import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm } from "@/lib/report-card";
import { registerStudent } from "@/lib/students/registration";
import { normaliseClassId } from "@/lib/students/class-change";
import {
  loadClassNames,
  loadSchoolClass,
  recordClassChange,
  type ClassRef,
} from "@/lib/students/class-assignment";

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

  // Use profiles!inner so that filtering on profiles fields (search/status)
  // actually excludes non-matching rows at the DB level BEFORE LIMIT/OFFSET.
  // Without !inner, PostgREST uses a LEFT JOIN and returns non-matching
  // parents with null profiles, which breaks search-before-pagination.
  let query = supabase
    .from("students")
    .select(
      "*, profiles!inner(full_name, email, avatar_url, phone, is_active, first_name, middle_name, last_name, recovery_email), classes(name)",
      { count: "exact" }
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });

  if (classId) query = query.eq("class_id", classId);
  if (search) query = query.ilike("profiles.full_name", `%${search}%`);

  // Filter by is_active on the joined profiles table
  if (status === "active") query = query.eq("profiles.is_active", true);
  else if (status === "archived") query = query.eq("profiles.is_active", false);

  // Apply pagination AFTER all filters
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

export async function POST(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized || !school_id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Provisioning lives in lib/students/registration so the class-teacher flow
    // and this one are literally the same code path. That module already
    // re-checks that `class_id` belongs to this school; normalising here only
    // makes a whitespace-only id mean "no class" instead of a failed lookup.
    const result = await registerStudent({
      school_id,
      first_name: body.first_name,
      middle_name: body.middle_name,
      last_name: body.last_name,
      class_id: normaliseClassId(body.class_id),
      date_of_birth: body.date_of_birth,
      gender: body.gender,
      parent_phone: body.parent_phone,
      student_id: body.student_id,
      nationality: body.nationality,
      religion: body.religion,
      blood_group: body.blood_group,
      parent_occupation: body.parent_occupation,
      parent_location: body.parent_location,
      emergency_contact: body.emergency_contact,
      allergies: body.allergies,
      health_notes: body.health_notes,
      recovery_email: body.recovery_email,
      avatar_url: body.avatar_url,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ...result.student,
      password: result.password,
      email: result.email,
    });
  } catch (err) {
    console.error("[students] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { authorized, school_id, userId } = await verifySchoolAdmin();
    if (!authorized || !school_id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      id,
      first_name,
      middle_name,
      last_name,
      class_id,
      date_of_birth,
      gender,
      parent_phone,
      student_id,
      nationality,
      religion,
      blood_group,
      parent_occupation,
      parent_location,
      emergency_contact,
      allergies,
      health_notes,
      status,
      is_active,
      avatar_url,
      recovery_email,
    } = await request.json();
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();
    const fName = (first_name || "").trim();
    const mName = (middle_name || "").trim();
    const lName = (last_name || "").trim();

    // Build profile updates
    const profileUpdates: Record<string, unknown> = {};
    if (fName || mName || lName) {
      profileUpdates.full_name = [fName, mName, lName].filter(Boolean).join(" ") || "Unnamed Student";
      if (fName) profileUpdates.first_name = fName;
      if (mName) profileUpdates.middle_name = mName;
      if (lName) profileUpdates.last_name = lName;
    }
    if (is_active !== undefined) profileUpdates.is_active = is_active;
    if (avatar_url) profileUpdates.avatar_url = avatar_url;
    if (recovery_email !== undefined) profileUpdates.recovery_email = recovery_email || null;

    // Build student table updates. `class_id` is handled below, AFTER the
    // student is loaded and the target class has been checked against this
    // school — a class id must never be written on trust.
    const studentUpdates: Record<string, unknown> = {};
    if (date_of_birth !== undefined) studentUpdates.date_of_birth = date_of_birth || null;
    if (gender !== undefined) studentUpdates.gender = gender || null;
    if (parent_phone !== undefined) studentUpdates.parent_phone = parent_phone || null;
    if (student_id !== undefined) studentUpdates.student_id = student_id || null;
    if (nationality !== undefined) studentUpdates.nationality = nationality || null;
    if (religion !== undefined) studentUpdates.religion = religion || null;
    if (blood_group !== undefined) studentUpdates.blood_group = blood_group || null;
    if (parent_occupation !== undefined) studentUpdates.parent_occupation = parent_occupation || null;
    if (parent_location !== undefined) studentUpdates.parent_location = parent_location || null;
    if (emergency_contact !== undefined) studentUpdates.emergency_contact = emergency_contact || null;
    if (allergies !== undefined) studentUpdates.allergies = allergies || null;
    if (health_notes !== undefined) studentUpdates.health_notes = health_notes || null;
    if (status !== undefined) studentUpdates.status = status;
    if (avatar_url !== undefined) studentUpdates.photo_url = avatar_url || null;

    // Tenant guard: verify the student belongs to this school before mutating (RLS bypassed via service client)
    const { data: student } = await supabase
      .from("students")
      .select("id, profile_id, class_id")
      .eq("id", id)
      .eq("school_id", school_id)
      .single();
    if (!student)
      return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // ── Class assignment ──────────────────────────────────────────────────────
    // `class_id` may be absent (leave the class alone), empty (`""` / null —
    // "not assigned"), or a class id, which must belong to THIS school. The
    // dropdown only offers own classes, but the route is the boundary: without
    // this check a stale or crafted id silently orphaned a student from every
    // roster in their school, because rosters filter by school AND class.
    let classChange: { from: ClassRef | null; to: ClassRef | null } | null = null;
    if (class_id !== undefined) {
      const requested = normaliseClassId(class_id);
      const lookup = await loadSchoolClass(supabase, school_id, requested);
      if (!lookup.ok) {
        return NextResponse.json({ error: lookup.error }, { status: lookup.status });
      }

      const current = normaliseClassId(student.class_id);
      studentUpdates.class_id = requested;

      if (requested !== current) {
        // Name the class being left so the audit row reads as a sentence, not
        // as two UUIDs. Best effort: an id from another tenant resolves to
        // nothing, which is the honest answer and does not block the move.
        const names = current
          ? await loadClassNames(supabase, school_id, [current])
          : new Map<string, string>();
        classChange = {
          from: current ? { id: current, name: names.get(current) ?? "" } : null,
          to: lookup.klass,
        };
      }
    }

    // Update student record (scoped by id AND school_id)
    if (Object.keys(studentUpdates).length > 0) {
      const { error: stuErr } = await supabase
        .from("students")
        .update(studentUpdates)
        .eq("id", id)
        .eq("school_id", school_id);
      if (stuErr)
        return NextResponse.json({ error: stuErr.message }, { status: 500 });
    }

    // Update profile (profile of the verified student, scoped to this school)
    if (student.profile_id && Object.keys(profileUpdates).length > 0) {
      const { error: profileErr } = await supabase.from("profiles").update(profileUpdates).eq("id", student.profile_id).eq("school_id", school_id);
      if (profileErr)
        return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // WHO moved WHOM, in the trail the report-card and delete actions already
    // use. Written only after both writes succeeded, and never allowed to fail
    // the update: a missing audit row is a worse record, not a lost edit.
    if (classChange) {
      const term = await getActiveTerm(school_id);
      await recordClassChange(supabase, {
        school_id,
        user_id: userId,
        student_id: id,
        from: classChange.from,
        to: classChange.to,
        term_id: term?.id ?? null,
      });
    }

    const { data, error } = await supabase
      .from("students")
      .select("*, profiles(full_name, email, avatar_url, phone, is_active, first_name, middle_name, last_name, recovery_email), classes(name)")
      .eq("id", id)
      .eq("school_id", school_id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[students] PUT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
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

    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ is_active })
      .eq("id", s.profile_id);

    if (profileErr)
      return NextResponse.json(
        { error: `Could not update student status: ${profileErr.message}` },
        { status: 500 },
      );

    // Finance keeps a mirror of the archive flag on `students`; keep it in step
    // with the canonical profile flag so archived students are not billed.
    const { error: mirrorErr } = await supabase
      .from("students")
      .update({ is_active })
      .eq("id", id)
      .eq("school_id", school_id);
    if (mirrorErr) {
      console.warn("[students] finance archive flag sync failed:", mirrorErr.message);
    }

    return NextResponse.json({ success: true, is_active });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}

// DELETE — permanently delete a student (Super Admin impersonating only)
export async function DELETE(request: Request) {
  try {
    const { authorized, school_id, userId, impersonated } = await verifySchoolAdmin();
    if (!authorized || !school_id)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Only a Super Admin (via impersonation) may permanently delete a student
    if (!impersonated)
      return NextResponse.json({ error: "Only the Super Admin can permanently delete students" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = getServiceClient();

    // Resolve the student + profile + auth user
    const { data: student } = await supabase
      .from("students")
      .select("id, profile_id, class_id, profiles(email)")
      .eq("id", id)
      .eq("school_id", school_id)
      .single();

    if (!student)
      return NextResponse.json({ error: "Student not found" }, { status: 404 });

    const profileId = student.profile_id;
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    const email = profile?.email;

    // Delete dependent records first (avoid FK constraint failures).
    // Most child tables cascade on student_id, but we clean up explicitly
    // for tables without ON DELETE CASCADE.
    const dependentTables = [
      "student_scores",
      "term_results",
      "term_result_components",
      "attendance_records",
      "psychomotor_scores",
      "affective_scores",
      "teacher_comments",
      "school_admin_comments",
      "enrollments",
      "result_edit_logs",
    ];
    for (const table of dependentTables) {
      await supabase.from(table).delete().eq("student_id", id);
    }

    // Delete the student record
    const { error: stuErr } = await supabase.from("students").delete().eq("id", id).eq("school_id", school_id);
    if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });

    // Delete the profile (auth user cascades via FK)
    if (profileId) {
      await supabase.from("profiles").delete().eq("id", profileId);
    }

    // Delete the auth user
    if (email) {
      await supabase.auth.admin.deleteUser(profileId);
    }

    // Log the deletion. class_id and term_id are NOT NULL on this table, so
    // they are filled from the student and the active term; failures surface.
    const activeTerm = await getActiveTerm(school_id);
    if (student.class_id && activeTerm) {
      const { error: auditErr } = await supabase.from("report_card_audit_logs").insert({
        school_id,
        class_id: student.class_id,
        term_id: activeTerm.id,
        user_id: userId,
        action: "delete_student",
        details: { student_id: id, email },
      });
      if (auditErr) console.error("[students] delete audit failed:", auditErr.message);
    } else {
      console.warn("[students] delete audit skipped — student has no class or no active term");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[students] DELETE error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server error" },
      { status: 500 },
    );
  }
}
