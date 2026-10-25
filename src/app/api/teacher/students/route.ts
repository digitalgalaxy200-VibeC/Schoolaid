import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { findPossibleDuplicates } from "@/lib/students/duplicates";
import { registerStudent } from "@/lib/students/registration";
import { parseTeacherStudentEdit } from "@/lib/students/teacher-editable";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * /api/teacher/students — the class roster a teacher works from.
 *
 * GET lists the students of one class. By default only ACTIVE students are
 * returned; `status=archived` lists the class's archived records (or, with
 * `search`, the school's archived records) so a teacher can find and restore a
 * child who was archived by mistake or who has come back.
 *
 * POST registers a new student in a class the caller is the FORM teacher of.
 * The class is taken from the authenticated session's school plus the verified
 * class id — never from anything the client could point at another tenant — and
 * the existing provisioning flow in lib/students/registration is reused.
 *
 * DUPLICATE WARNING: POST answers 409 with the matching records when the child
 * may already exist (including archived records). The teacher then restores the
 * existing record, cancels, or resends with `allow_duplicate: true` when the two
 * children are genuinely different people.
 */

const STUDENT_SELECT =
  "*, profiles!inner(full_name, email, is_active, first_name, middle_name, last_name, phone, avatar_url), classes(name)";

type StudentRow = Record<string, unknown> & {
  class_id?: string | null;
  generated_password?: unknown;
};

function forClient(rows: StudentRow[], canRestore: (row: StudentRow) => boolean) {
  return rows.map((row) => {
    const copy = { ...row };
    // The stored temporary password is deliberately NOT returned: a teacher
    // sees a generated password exactly once, on the reset response.
    delete copy.generated_password;
    return { ...copy, can_restore: canRestore(row) };
  });
}

export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const classErrors = new ValidationErrors();
  if (!uuid({ class_id: classId }, "class_id", classErrors, { required: true })) {
    return NextResponse.json({ error: "class_id required" }, { status: 400 });
  }

  const status = searchParams.get("status") === "archived" ? "archived" : "active";
  const search = (searchParams.get("search") || "").trim();

  const supabase = getServiceClient();

  // Ownership — caller must teach this class (class teacher, or subject
  // assignment in it). Impersonation sessions may read any class.
  let canManage = !!all_classes;
  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: classId,
    });
    if (!access.assigned) {
      return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }
    canManage = access.classTeacher;
  }

  let query = supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("school_id", school_id)
    .eq("profiles.is_active", status === "active");

  if (status === "active") {
    query = query.eq("class_id", classId);
  } else if (search) {
    // Archived search is school-scoped so a teacher can find the record they
    // are about to recreate. `can_restore` below shows which ones they may
    // actually adopt.
    query = query.ilike("profiles.full_name", `%${search}%`);
  } else {
    // Archived records of this class, plus those with no class left — the
    // latter are exactly the ones a teacher can restore into their roster.
    query = query.or(`class_id.eq.${classId},class_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    forClient((data || []) as StudentRow[], (row) =>
      canManage && (!row.class_id || row.class_id === classId),
    ),
  );
}

export async function POST(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const classErrors = new ValidationErrors();
  if (!uuid(body, "class_id", classErrors, { required: true })) {
    return NextResponse.json({ error: "a valid class_id is required" }, { status: 400 });
  }
  const classId = typeof body.class_id === "string" ? body.class_id : "";

  const supabase = getServiceClient();

  // Adding a student changes who is in the class, so it belongs to the FORM
  // teacher. A subject teacher can read and correct records (GET/PATCH) but
  // cannot add to a roster they do not own.
  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: classId,
    });
    if (!access.classTeacher) {
      return NextResponse.json(
        { error: "Only the class teacher can add students to this class" },
        { status: 403 },
      );
    }
  }

  const errors = new ValidationErrors();
  const edit = parseTeacherStudentEdit(body, errors);
  if (!edit) return NextResponse.json({ error: errors.summary() }, { status: 400 });

  // Warn before writing anything. The check spans ACTIVE and ARCHIVED records
  // in this school, and the class is part of the identity signal.
  if (body.allow_duplicate !== true) {
    const matches = await findPossibleDuplicates(supabase, {
      school_id,
      class_id: classId,
      first_name: edit.first_name,
      middle_name: edit.middle_name,
      last_name: edit.last_name,
      date_of_birth: edit.date_of_birth,
      parent_phone: edit.parent_phone,
      student_id: typeof body.student_id === "string" ? body.student_id : null,
    });
    if (matches.length > 0) {
      return NextResponse.json(
        {
          error: "A student with these details already exists.",
          matches,
        },
        { status: 409 },
      );
    }
  }

  // School and class are forced from the verified scope above, never trusted
  // from the request body beyond the class the teacher actually owns.
  const result = await registerStudent({
    school_id,
    class_id: classId,
    ...edit,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { ...result.student, password: result.password, email: result.email },
    { status: 201 },
  );
}
