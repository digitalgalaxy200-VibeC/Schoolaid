import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { formatDocumentDate } from "@/lib/finance/document-theme";
import {
  renderClassCredentialsPdf,
  type ClassCredentialRow,
} from "@/lib/students/credentials-pdf";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/teacher/students/credentials?class_id=… — the class login sheet.
 *
 * WHO MAY PRINT IT: the class teacher of that class, exactly like the per-student
 * reset. A subject teacher can see the roster but must not walk away with every
 * child's username and password; an `all_classes` impersonation session may ask
 * for any class, which is what the Super Admin is for.
 *
 * WHAT IT CONTAINS, AND WHAT IT CANNOT: name, username, and the stored TEMPORARY
 * password. SchoolAid keeps a plain-text password only until the child first
 * signs in — `generated_password` is cleared at login — so a student who has
 * already signed in prints as "Reset needed" rather than with a stale value.
 * The PDF says so on the page; this route does not pretend otherwise.
 *
 * No password is invented here. Generating one for every child just to fill the
 * column would silently change thirty passwords and lock out anyone mid-term.
 */
export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const errors = new ValidationErrors();
  if (!uuid({ class_id: classId }, "class_id", errors, { required: true })) {
    return NextResponse.json({ error: errors.summary() }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Tenant + role guard. Every read below is also filtered by school_id, so a
  // mis-shaped class id can never reach another school's roster.
  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: classId,
    });
    if (!access.classTeacher) {
      return NextResponse.json(
        { error: "Only the class teacher can download this class's logins" },
        { status: 403 },
      );
    }
  }

  const [{ data: school }, { data: klass }, { data: term }] = await Promise.all([
    supabase.from("schools").select("name").eq("id", school_id).maybeSingle(),
    supabase.from("classes").select("name").eq("id", classId).eq("school_id", school_id).maybeSingle(),
    supabase
      .from("academic_terms")
      .select("name, session_id")
      .eq("school_id", school_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!klass) return NextResponse.json({ error: "Class not found in this school" }, { status: 404 });

  let sessionName: string | null = null;
  if (term?.session_id) {
    const { data: session } = await supabase
      .from("academic_sessions")
      .select("name")
      .eq("id", term.session_id)
      .eq("school_id", school_id)
      .maybeSingle();
    sessionName = (session?.name as string | null) ?? null;
  }

  const { data: students, error } = await supabase
    .from("students")
    .select("id, generated_password, profiles!inner(full_name, email, is_active)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("profiles.is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: ClassCredentialRow[] = (students ?? [])
    .map((s) => {
      const rawProfile = s.profiles as
        | { full_name?: string | null; email?: string | null }
        | { full_name?: string | null; email?: string | null }[]
        | null;
      const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
      return {
        name: (profile?.full_name as string | null) || "Unnamed student",
        username: (profile?.email as string | null) || "—",
        password: (s.generated_password as string | null) || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const pdf = await renderClassCredentialsPdf({
    school_name: (school?.name as string | null) || "School",
    class_name: (klass.name as string | null) || "Class",
    term_label:
      [term?.name, sessionName ? `${sessionName} Session` : null].filter(Boolean).join(" · ") ||
      null,
    generated_on: formatDocumentDate(new Date().toISOString()),
    rows,
  });

  const safe = (value: string) => value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const fileName = `${safe((school?.name as string) || "School")} - ${safe(
    (klass.name as string) || "Class",
  )} - Student Logins.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // A roster of passwords must not sit in a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
