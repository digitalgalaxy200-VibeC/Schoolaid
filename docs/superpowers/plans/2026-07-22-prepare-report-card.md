# Prepare Report Card (Teacher) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New teacher module "Prepare Report Card" — class teacher reviews subject scores (read-only), enters attendance/traits/remarks, previews report card, submits class to admin for approval.

**Architecture:** New API namespace `/api/teacher/report-card/*` (4 routes) + new page `/teacher/report-card` + 1 migration (submission workflow + audit). Reuses existing tables: `attendance_records`, `psychomotor_scores`, `affective_scores`, `teacher_comments`, `student_scores`, template systems (011). Lock enforced server-side on submit; also enforced in existing scores route.

**Tech Stack:** Next.js 16 App Router, Supabase (service client + JWT cookie auth via `verifyTeacher`), Tailwind v4, existing UI kit (`src/components/ui`).

**Verification per task:** `npx tsc --noEmit` (no test framework in repo). Final: `npm run build`.

**Note repo:** commits sans ligne Co-Authored-By (préférence utilisateur). Branch: `kevin`.

---

## Key decisions (locked)

1. **Class teacher access** = row in `class_teachers` with `is_active=true` (any role; `primary` displayed as "Form Teacher"). No row → module inaccessible (nav hidden + API 403).
2. **Active context** = `academic_terms.is_active=true` (+ its `session_id` → session name). Resolved server-side; term never client-selectable. No active term → clear error state.
3. **Submission state** = new table `report_card_submissions`, unique `(class_id, term_id)`. Statuses: `draft` → `pending_approval` → (`approved` | `returned` → editable again). Admin review UI = follow-up scope (hors MVP teacher).
4. **Lock** = status `pending_approval` or `approved` blocks: report-card saves AND subject score writes (`/api/teacher/scores` POST).
5. **Academic summary** computed live from `student_scores` + components/grading templates (same class→school fallback logic as `src/app/api/teacher/scores/route.ts:21-52`). "Pending Subject Teacher" = subject in `class_subjects` with zero scores for that student.
6. **Auto remark** = pure function from average/grade/attendance, "Suggest" button always available (no school config flag exists; simplification documentée).
7. **Preview** = HTML modal (read-only), même structure visuelle que `ReportCardPDF.tsx` mais en HTML. Pas de PDF au preview (MVP).
8. **Audit** = `report_card_audit_logs` table; every save/submit writes one row; UI shows "Last saved by X at Y".
9. **Autosave** = debounce 1.5s sur champs modifiés (dirty-tracking par record) + bouton Save manuel. Seuls les records dirty sont envoyés.

---

### Task 1: Migration — submission workflow + audit trail

**Files:**
- Create: `supabase/migrations/017_report_card_submissions.sql`

- [ ] **Step 1: Write migration**

```sql
-- ============================================================================
-- SchoolAid — Migration 017: Report Card Submission Workflow + Audit Trail
-- ============================================================================

-- 1. Per-class, per-term submission state
CREATE TABLE IF NOT EXISTS report_card_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'returned')),
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, term_id)
);

-- 2. Audit trail for report card preparation
CREATE TABLE IF NOT EXISTS report_card_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'save_attendance' | 'save_traits' | 'save_remark' | 'submit'
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_rcs_class_term ON report_card_submissions(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_rcs_school ON report_card_submissions(school_id);
CREATE INDEX IF NOT EXISTS idx_rcal_class_term ON report_card_audit_logs(class_id, term_id);

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS update_rcs_updated_at ON report_card_submissions;
CREATE TRIGGER update_rcs_updated_at
  BEFORE UPDATE ON report_card_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS (service_role bypasses; policies mirror class_subjects pattern)
ALTER TABLE report_card_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON report_card_submissions TO anon, authenticated, service_role;
GRANT ALL ON report_card_audit_logs TO anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_all_rcs ON report_card_submissions;
CREATE POLICY tenant_all_rcs ON report_card_submissions
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_all_rcal ON report_card_audit_logs;
CREATE POLICY tenant_all_rcal ON report_card_audit_logs
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/017_report_card_submissions.sql
git commit -m "feat: add report card submission + audit tables"
```

Note: apply DB via Supabase dashboard/`supabase db push` — hors scope build.

---

### Task 2: Shared helper — class-teacher guard + template resolution

**Files:**
- Create: `src/lib/report-card.ts`

- [ ] **Step 1: Write helper**

```typescript
import { getServiceClient } from "@/lib/supabase/service";

/** Resolve the teachers.id row for a profile, or null. */
export async function getTeacherByProfile(userId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
  return data;
}

/** True if teacher is an active class teacher of class_id. */
export async function isClassTeacher(school_id: string, teacher_id: string, class_id: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("school_id", school_id)
    .eq("teacher_id", teacher_id)
    .eq("class_id", class_id)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

/** Active term + session name, or null. */
export async function getActiveTerm(school_id: string) {
  const supabase = getServiceClient();
  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, name, session_id")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!term) return null;
  let session_name = "";
  if (term.session_id) {
    const { data: s } = await supabase.from("academic_sessions").select("name").eq("id", term.session_id).single();
    session_name = s?.name || "";
  }
  return { id: term.id, name: term.name, session_name };
}

/** Generic class→school template row resolution (components/grading/psychomotor/affective). */
export async function resolveTemplateRows(
  school_id: string,
  class_id: string,
  linkTable: string,     // e.g. "class_psychomotor_templates"
  templateTable: string, // e.g. "psychomotor_templates"
  rowsTable: string,     // e.g. "psychomotor_rows"
  orderBy = "display_order",
) {
  const supabase = getServiceClient();
  const { data: link } = await supabase.from(linkTable).select("template_id").eq("class_id", class_id).maybeSingle();
  let templateId = link?.template_id;
  if (!templateId) {
    const { data: t } = await supabase.from(templateTable).select("id").eq("school_id", school_id).limit(1).maybeSingle();
    templateId = t?.id;
  }
  if (!templateId) return [];
  const { data: rows } = await supabase.from(rowsTable).select("*").eq("template_id", templateId).order(orderBy);
  return rows || [];
}

/** Submission lock check. */
export function isLocked(status: string | null | undefined) {
  return status === "pending_approval" || status === "approved";
}

/** Suggested remark from average/grade/attendance %. */
export function suggestRemark(average: number, grade: string, attendancePct: number | null) {
  let base: string;
  if (average >= 80) base = "An excellent result. Keep up the outstanding work.";
  else if (average >= 70) base = "A very good performance. Keep aiming higher.";
  else if (average >= 60) base = "A good result with room for improvement.";
  else if (average >= 50) base = "A fair performance. More effort is needed.";
  else base = "Needs significant improvement. Please encourage consistent study.";
  let att = "";
  if (attendancePct !== null) {
    if (attendancePct >= 95) att = " Excellent attendance.";
    else if (attendancePct < 75) att = " Attendance needs improvement.";
  }
  return `${base}${att} (Grade: ${grade || "N/A"})`;
}
```

Nota: `grading_rows` n'a pas de `display_order` → passer `orderBy: "minimum_score"` à l'appel.

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit**

```bash
git add src/lib/report-card.ts
git commit -m "feat: report card shared helpers"
```

---

### Task 3: API — GET classes (Step 1 du spec)

**Files:**
- Create: `src/app/api/teacher/report-card/classes/route.ts`

- [ ] **Step 1: Write route**

```typescript
import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, getActiveTerm } from "@/lib/report-card";

export async function GET() {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  const { data: assignments } = await supabase
    .from("class_teachers")
    .select("class_id, role, classes(name, grade_level)")
    .eq("school_id", school_id)
    .eq("teacher_id", teacher.id)
    .eq("is_active", true);

  const activeTerm = await getActiveTerm(school_id);

  const classes = (assignments || []).map((a: any) => {
    const cls = Array.isArray(a.classes) ? a.classes[0] : a.classes;
    return { id: a.class_id, name: cls?.name || "Unknown", grade: cls?.grade_level || "", role: a.role };
  });

  // Attach submission status per class for the active term
  let submissions: any[] = [];
  if (activeTerm && classes.length > 0) {
    const { data } = await supabase
      .from("report_card_submissions")
      .select("class_id, status")
      .eq("school_id", school_id)
      .eq("term_id", activeTerm.id)
      .in("class_id", classes.map((c) => c.id));
    submissions = data || [];
  }
  const withStatus = classes.map((c) => ({
    ...c,
    status: submissions.find((s) => s.class_id === c.id)?.status || "draft",
  }));

  return NextResponse.json({ isClassTeacher: classes.length > 0, activeTerm, classes: withStatus });
}
```

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: report card classes API`

---

### Task 4: API — GET class-data (Steps 2–7 + completion)

**Files:**
- Create: `src/app/api/teacher/report-card/class-data/route.ts`

- [ ] **Step 1: Write route**

Query param: `class_id`. Guards: `verifyTeacher` + `isClassTeacher` (403 sinon) + `getActiveTerm` (409 si absent). Returns everything the page needs in one payload:

```typescript
import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, resolveTemplateRows } from "@/lib/report-card";

export async function GET(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, classId)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });

  const supabase = getServiceClient();

  // Students (alphabetical by name)
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, student_id, photo_url, profiles(full_name)")
    .eq("school_id", school_id)
    .eq("class_id", classId);
  const students = (studentsRaw || [])
    .map((s: any) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return { id: s.id, admission_no: s.student_id || "", name: p?.full_name || "Unknown", photo_url: s.photo_url || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const studentIds = students.map((s) => s.id);

  // Subjects of the class
  const { data: classSubjects } = await supabase
    .from("class_subjects")
    .select("subject_id, subjects(name)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("is_active", true);
  const subjects = (classSubjects || []).map((cs: any) => {
    const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
    return { id: cs.subject_id, name: subj?.name || "Unknown" };
  });

  // Templates: components (for max), grading, psychomotor, affective
  const [components, gradingRows, psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, classId, "class_components_templates", "components_templates", "components_rows"),
    resolveTemplateRows(school_id, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
    resolveTemplateRows(school_id, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, classId, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  // Scores + prep data
  const empty = Promise.resolve({ data: [] as any[] });
  const [scoresQ, attendanceQ, psychoQ, affQ, commentsQ] = await Promise.all(
    studentIds.length === 0
      ? [empty, empty, empty, empty, empty]
      : [
          supabase.from("student_scores").select("student_id, subject_id, component_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
          supabase.from("attendance_records").select("student_id, days_school_opened, days_present, days_absent").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
          supabase.from("psychomotor_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
          supabase.from("affective_scores").select("student_id, trait_id, score").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
          supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", activeTerm.id).in("student_id", studentIds),
        ],
  );

  // Submission status + last audit
  const [{ data: submission }, { data: lastAudit }, { data: school }] = await Promise.all([
    supabase.from("report_card_submissions").select("status, submitted_at, return_reason").eq("class_id", classId).eq("term_id", activeTerm.id).maybeSingle(),
    supabase.from("report_card_audit_logs").select("action, created_at, profiles(full_name)").eq("class_id", classId).eq("term_id", activeTerm.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("schools").select("name, logo_url, address").eq("id", school_id).single(),
  ]);

  return NextResponse.json({
    activeTerm,
    students,
    subjects,
    components: (components as any[]).map((c: any) => ({ id: c.id, name: c.name, maximum_score: c.maximum_score })),
    gradingRows: (gradingRows as any[]).map((g: any) => ({ grade: g.grade, minimum_score: g.minimum_score, maximum_score: g.maximum_score, remark: g.remark })),
    psychomotorTraits: (psychomotorTraits as any[]).map((t: any) => ({ id: t.id, name: t.name })),
    affectiveTraits: (affectiveTraits as any[]).map((t: any) => ({ id: t.id, name: t.name })),
    scores: (scoresQ as any).data || [],
    attendance: (attendanceQ as any).data || [],
    psychomotorScores: (psychoQ as any).data || [],
    affectiveScores: (affQ as any).data || [],
    comments: (commentsQ as any).data || [],
    submission: submission || { status: "draft" },
    lastAudit: lastAudit || null,
    school: school || null,
  });
}
```

Client computes per-student subject totals, grade (via gradingRows on % of component max), average, position (rank by average, ties = same position), "Pending Subject Teacher" (subject with 0 scores for student).

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: report card class-data API`

---

### Task 5: API — POST save (Steps 5–8 + audit)

**Files:**
- Create: `src/app/api/teacher/report-card/save/route.ts`

- [ ] **Step 1: Write route**

Body: `{ class_id, attendance?: [{student_id, days_school_opened, days_present}], psychomotor?: [{student_id, trait_id, score}], affective?: [{student_id, trait_id, score}], comments?: [{student_id, comment}] }`. Only dirty records sent.

```typescript
import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { class_id, attendance = [], psychomotor = [], affective = [], comments = [] } = body;
  if (!class_id) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, class_id)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  // Lock check
  const { data: submission } = await supabase
    .from("report_card_submissions").select("status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Report cards are locked (submitted for approval)" }, { status: 423 });

  // Attendance validation: 0 ≤ present ≤ opened
  for (const a of attendance) {
    const opened = Number(a.days_school_opened), present = Number(a.days_present);
    if (!Number.isFinite(opened) || !Number.isFinite(present) || opened < 0 || present < 0 || present > opened) {
      return NextResponse.json({ error: `Invalid attendance: days present must be between 0 and days opened` }, { status: 400 });
    }
  }

  if (attendance.length > 0) {
    const { error } = await supabase.from("attendance_records").upsert(
      attendance.map((a: any) => ({
        school_id, term_id, student_id: a.student_id,
        days_school_opened: Number(a.days_school_opened),
        days_present: Number(a.days_present),
        days_absent: Number(a.days_school_opened) - Number(a.days_present),
      })),
      { onConflict: "student_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (psychomotor.length > 0) {
    const { error } = await supabase.from("psychomotor_scores").upsert(
      psychomotor.map((p: any) => ({ school_id, term_id, student_id: p.student_id, trait_id: p.trait_id, score: p.score })),
      { onConflict: "student_id,trait_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (affective.length > 0) {
    const { error } = await supabase.from("affective_scores").upsert(
      affective.map((p: any) => ({ school_id, term_id, student_id: p.student_id, trait_id: p.trait_id, score: p.score })),
      { onConflict: "student_id,trait_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (comments.length > 0) {
    const { error } = await supabase.from("teacher_comments").upsert(
      comments.map((c: any) => ({ school_id, term_id, student_id: c.student_id, comment: c.comment })),
      { onConflict: "student_id,term_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit
  const actions: string[] = [];
  if (attendance.length) actions.push("save_attendance");
  if (psychomotor.length || affective.length) actions.push("save_traits");
  if (comments.length) actions.push("save_remark");
  if (actions.length) {
    await supabase.from("report_card_audit_logs").insert({
      school_id, class_id, term_id, user_id: userId,
      action: actions.join(","),
      details: { attendance: attendance.length, psychomotor: psychomotor.length, affective: affective.length, comments: comments.length },
    });
  }

  return NextResponse.json({ success: true, savedAt: new Date().toISOString() });
}
```

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: report card save API with lock + validation`

---

### Task 6: API — POST submit (Step 10 + readiness check serveur)

**Files:**
- Create: `src/app/api/teacher/report-card/submit/route.ts`

- [ ] **Step 1: Write route**

Body: `{ class_id }`. Guards identiques à save. Server-side readiness re-check (jamais confiance au client) :

```typescript
import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherByProfile, isClassTeacher, getActiveTerm, isLocked, resolveTemplateRows } from "@/lib/report-card";

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { class_id } = await request.json();
  if (!class_id) return NextResponse.json({ error: "class_id required" }, { status: 400 });

  const teacher = await getTeacherByProfile(userId);
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  if (!(await isClassTeacher(school_id, teacher.id, class_id)))
    return NextResponse.json({ error: "Not the class teacher for this class" }, { status: 403 });

  const activeTerm = await getActiveTerm(school_id);
  if (!activeTerm) return NextResponse.json({ error: "No active term configured" }, { status: 409 });
  const term_id = activeTerm.id;
  const supabase = getServiceClient();

  const { data: submission } = await supabase
    .from("report_card_submissions").select("id, status").eq("class_id", class_id).eq("term_id", term_id).maybeSingle();
  if (isLocked(submission?.status))
    return NextResponse.json({ error: "Already submitted" }, { status: 423 });

  // ── Readiness check ──
  const { data: studentsRaw } = await supabase.from("students").select("id").eq("school_id", school_id).eq("class_id", class_id);
  const studentIds = (studentsRaw || []).map((s) => s.id);
  if (studentIds.length === 0) return NextResponse.json({ error: "No students in class" }, { status: 400 });

  const { data: classSubjects } = await supabase
    .from("class_subjects").select("subject_id, subjects(name)").eq("school_id", school_id).eq("class_id", class_id).eq("is_active", true);
  const [psychomotorTraits, affectiveTraits] = await Promise.all([
    resolveTemplateRows(school_id, class_id, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
    resolveTemplateRows(school_id, class_id, "class_affective_templates", "affective_templates", "affective_rows"),
  ]);

  const [{ data: scores }, { data: attendance }, { data: psycho }, { data: aff }, { data: comments }] = await Promise.all([
    supabase.from("student_scores").select("student_id, subject_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    supabase.from("attendance_records").select("student_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    supabase.from("psychomotor_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    supabase.from("affective_scores").select("student_id, trait_id").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
    supabase.from("teacher_comments").select("student_id, comment").eq("school_id", school_id).eq("term_id", term_id).in("student_id", studentIds),
  ]);

  const missing: string[] = [];
  for (const cs of (classSubjects || []) as any[]) {
    const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
    const done = studentIds.filter((sid) => (scores || []).some((sc) => sc.student_id === sid && sc.subject_id === cs.subject_id)).length;
    if (done < studentIds.length) missing.push(`${subj?.name || "Subject"}: ${done} of ${studentIds.length} students completed`);
  }
  const attDone = studentIds.filter((sid) => (attendance || []).some((a) => a.student_id === sid)).length;
  if (attDone < studentIds.length) missing.push(`Attendance: ${studentIds.length - attDone} students missing`);
  if ((psychomotorTraits as any[]).length > 0) {
    const pDone = studentIds.filter((sid) =>
      (psychomotorTraits as any[]).every((t: any) => (psycho || []).some((p) => p.student_id === sid && p.trait_id === t.id))).length;
    if (pDone < studentIds.length) missing.push(`Psychomotor: ${studentIds.length - pDone} students incomplete`);
  }
  if ((affectiveTraits as any[]).length > 0) {
    const aDone = studentIds.filter((sid) =>
      (affectiveTraits as any[]).every((t: any) => (aff || []).some((p) => p.student_id === sid && p.trait_id === t.id))).length;
    if (aDone < studentIds.length) missing.push(`Affective: ${studentIds.length - aDone} students incomplete`);
  }
  const rDone = studentIds.filter((sid) => (comments || []).some((c) => c.student_id === sid && c.comment?.trim())).length;
  if (rDone < studentIds.length) missing.push(`Teacher remarks: ${studentIds.length - rDone} students missing`);

  if (missing.length > 0) return NextResponse.json({ error: "Submission incomplete", missing }, { status: 422 });

  // ── Transition ──
  const now = new Date().toISOString();
  const { error } = await supabase.from("report_card_submissions").upsert(
    { school_id, class_id, term_id, status: "pending_approval", submitted_by: userId, submitted_at: now, return_reason: null },
    { onConflict: "class_id,term_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("report_card_audit_logs").insert({
    school_id, class_id, term_id, user_id: userId, action: "submit", details: { students: studentIds.length },
  });

  return NextResponse.json({ success: true, status: "pending_approval" });
}
```

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: report card submit API with readiness check`

---

### Task 7: Lock des subject marks après soumission

**Files:**
- Modify: `src/app/api/teacher/scores/route.ts` (POST, après ligne 89 `const supabase = getServiceClient();`)

- [ ] **Step 1: Add lock check in POST**

```typescript
  // Report-card lock: once a class is submitted for approval, block all writes
  const lockClassId = data?.class_id;
  const lockTermId = data?.term_id;
  if (lockClassId && lockTermId) {
    const { data: sub } = await supabase
      .from("report_card_submissions")
      .select("status")
      .eq("class_id", lockClassId)
      .eq("term_id", lockTermId)
      .maybeSingle();
    if (sub?.status === "pending_approval" || sub?.status === "approved") {
      return NextResponse.json({ error: "This class's report cards have been submitted for approval — marks are locked" }, { status: 423 });
    }
  }
```

Note: types `attendance`/`psychomotor`/`affective`/`comment` du route scores n'envoient pas class_id — lock couvre le type `score` (subject marks, exigence du spec). Les autres types passent désormais par le nouveau module verrouillé (Task 5).

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: lock subject marks after report card submission`

---

### Task 8: Sidebar — entrée "Report Card" conditionnelle

**Files:**
- Modify: `src/app/teacher/layout.tsx`

- [ ] **Step 1: Conditional nav item**

1. Add to NAV array a 4th item:
```typescript
  { label: "Report Card", href: "/teacher/report-card", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", classTeacherOnly: true },
```
2. State `const [isClassTeacher, setIsClassTeacher] = useState(false);` — set from existing `/api/teacher/dashboard` fetch (line 38): `if (Array.isArray(d.classes)) setIsClassTeacher(d.classes.some((c: any) => c.role));`
3. Filter everywhere NAV is mapped (desktop sidebar, mobile menu, bottom bar):
```typescript
  const visibleNav = NAV.filter((item) => !item.classTeacherOnly || isClassTeacher);
```
Replace the 3 `NAV.map(` occurrences with `visibleNav.map(`.

- [ ] **Step 2: `npx tsc --noEmit` → PASS. Commit** `feat: conditional Report Card nav for class teachers`

---

### Task 9: Page — /teacher/report-card (UI complète)

**Files:**
- Create: `src/app/teacher/report-card/page.tsx` (orchestration: class select, students table, progress, submit)
- Create: `src/app/teacher/report-card/StudentEditor.tsx` (panel par élève: academic summary read-only, attendance, traits, remark)
- Create: `src/app/teacher/report-card/PreviewModal.tsx` (report card HTML read-only)
- Create: `src/app/teacher/report-card/lib.ts` (types + calculs partagés client)

Style: suivre patterns existants (`src/app/teacher/scores/page.tsx`, UI kit `Card/Button/Badge/Modal/Toast`, classes Tailwind du design system `bg-surface`, `text-text-muted`, `tablet:` breakpoints, mobile-first).

- [ ] **Step 1: `lib.ts` — types + computations**

```typescript
export type Student = { id: string; admission_no: string; name: string; photo_url: string | null };
export type Subject = { id: string; name: string };
export type GradingRow = { grade: string; minimum_score: number; maximum_score: number; remark: string | null };
export type Trait = { id: string; name: string };
export type ScoreRow = { student_id: string; subject_id: string | null; component_id: string; score: number };
export type AttendanceDraft = { days_school_opened: string; days_present: string };

export const TRAIT_RATINGS = ["5", "4", "3", "2", "1"]; // 5 = Excellent … 1 = Poor

export function gradeFor(pct: number, rows: GradingRow[]): string {
  const r = rows.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score));
  return r?.grade || "N/A";
}

/** Per-student, per-subject totals; null when no score rows exist for that subject. */
export function subjectTotal(scores: ScoreRow[], studentId: string, subjectId: string): number | null {
  const rows = scores.filter((s) => s.student_id === studentId && s.subject_id === subjectId);
  if (rows.length === 0) return null;
  return rows.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
}

/** Average over subjects that HAVE scores (percentage of component max). */
export function studentSummary(
  scores: ScoreRow[], subjects: Subject[], studentId: string, maxTotal: number, grading: GradingRow[],
) {
  const totals = subjects.map((subj) => ({ subject: subj, total: subjectTotal(scores, studentId, subj.id) }));
  const done = totals.filter((t) => t.total !== null) as { subject: Subject; total: number }[];
  const grand = done.reduce((s, t) => s + t.total, 0);
  const avg = done.length > 0 && maxTotal > 0 ? grand / done.length / maxTotal * 100 : 0;
  return { totals, grand, average: avg, grade: gradeFor(avg, grading), pending: totals.filter((t) => t.total === null).map((t) => t.subject.name) };
}

/** Positions: rank students by average desc; equal averages share position. */
export function computePositions(averages: Map<string, number>): Map<string, number> {
  const sorted = [...averages.entries()].sort((a, b) => b[1] - a[1]);
  const pos = new Map<string, number>();
  sorted.forEach(([sid, avg], i) => {
    if (i > 0 && avg === sorted[i - 1][1]) pos.set(sid, pos.get(sorted[i - 1][0])!);
    else pos.set(sid, i + 1);
  });
  return pos;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
```

- [ ] **Step 2: `page.tsx` — orchestration**

State machine: `loading → no-access | class-select → class-loaded`. Contenu :
- Fetch `/api/teacher/report-card/classes` on mount. `!isClassTeacher` → Card "This module is only available to Class Teachers." `!activeTerm` → Card erreur "No active term configured. Contact your school admin."
- Class cards (name, grade, status Badge: Draft/Pending Approval/Approved/Returned+reason). Click → fetch `class-data`.
- Header classe : session/term (read-only), `Total Students: N`, badge statut, "Last saved by {lastAudit.profiles.full_name} — {date}".
- **Progress indicators** (Reco 3) : 4 barres (Academic Scores, Attendance, Psychomotor+Affective, Remarks) — % = students complets / total, calculés client depuis les données (mêmes règles que readiness Task 6).
- **Students table** (Step 3) : S/N, Name, Admission No, Average, Grade, Position, statut par élève (✓/incomplete), bouton "Open" → StudentEditor. Bouton "Preview" par élève → PreviewModal.
- **Completion dashboard** (Reco 1) : liste par sujet `English ✓` / `Mathematics — 17 of 23 students completed`, Attendance/Psychomotor/Remarks ✓ ou manquants.
- **Submit for Approval** : bouton désactivé si incomplet (tooltip liste manquants), confirm via `ConfirmDialog`, POST submit ; 422 → afficher `missing[]` ; succès → statut `pending_approval`, tout passe read-only.
- **Save** : état `dirty` global remonté par StudentEditor via callbacks ; autosave `useEffect` + `setTimeout` 1500ms debounce sur dirty ; bouton "Save" manuel ; Toast "Saved" / erreurs. Payload = uniquement records dirty. 423 → Toast lock + refetch.
- Locked (`pending_approval`/`approved`) : tous inputs `disabled`, bannière statut.

- [ ] **Step 3: `StudentEditor.tsx`**

Props: student, subjects, scores, components/maxTotal, grading, traits (2 sets), drafts (attendance/psycho/affective/comment) + `onChange(kind, payload)` + `locked`, `suggestRemark` util. Sections (accordéon ou stack) :
1. **Academic Summary (read-only)** : table Subject | Score | Grade ; sujets sans score → Badge warning "Pending Subject Teacher". Footer : Total, Average %, Position.
2. **Attendance** : inputs number Days Opened / Days Present, Days Absent calculé affiché ; validation inline `present ≤ opened` (bordure error + message, onChange refuse de marquer valid-dirty si invalide).
3. **Psychomotor & Affective** : pour chaque trait (dynamique), select 1–5.
4. **Teacher's Remark** : textarea + bouton "Suggest remark" (utilise `suggestRemark(average, grade, attendancePct)` de `src/lib/report-card.ts` — importable côté client car fonction pure ; sinon dupliquer dans `lib.ts`). ⚠ `src/lib/report-card.ts` importe `getServiceClient` → NE PAS importer côté client ; dupliquer `suggestRemark` dans `app/teacher/report-card/lib.ts`.

- [ ] **Step 4: `PreviewModal.tsx`**

Modal read-only, structure report card : logo école + nom (depuis `school`), photo élève, infos élève (name, admission no, class, session/term), table subjects (score/grade/remark grading), Total/Average/Position, Attendance (opened/present/absent), tables Psychomotor/Affective (trait → rating), Teacher's Remark. Print-friendly (`overflow-auto`, largeur max). Aucun champ éditable.

- [ ] **Step 5: `npx tsc --noEmit` → PASS. Commit** `feat: prepare report card page UI`

---

### Task 10: Vérification finale

- [ ] **Step 1:** `npm run build` → Expected: compile OK, zéro erreur TS/ESLint bloquante.
- [ ] **Step 2:** `npm run lint` → clean sur fichiers nouveaux.
- [ ] **Step 3:** Revue acceptance criteria du spec (checklist ci-dessous), commit final si retouches.

**Acceptance criteria → couverture :**

| Critère | Tâche |
|---|---|
| Sidebar visible seulement Class Teachers | 8 |
| Seules classes assignées affichées | 3 |
| Session/Term actifs auto | 2 (getActiveTerm), 3, 4 |
| Élèves alphabétique + S/N | 4, 9 |
| Scores sujets read-only | 9 (StudentEditor §1) |
| Validation attendance | 5 (serveur) + 9 (client) |
| Traits dynamiques depuis config admin | 2 (resolveTemplateRows), 4 |
| Remarks éditables + suggestion | 9 |
| Autosave + save manuel, dirty only | 9 |
| Completion dashboard | 9 |
| Soumission bloquée si incomplet | 6 (serveur) + 9 (client) |
| Preview via template école | 9 (PreviewModal) — MVP: template unique HTML |
| Submit → Pending School Admin Approval + lock | 6, 7 |
| Audit trail | 1, 5, 6 |
| Pas de régression Teacher/Admin dashboards | 7 (seul fichier existant touché: scores route + layout), build final |

**Hors scope MVP (documenté) :** UI admin de review/approve/return (le schéma le supporte via `status`/`reviewed_by`/`return_reason`) ; génération PDF au preview ; flag école "automatic remarks".
