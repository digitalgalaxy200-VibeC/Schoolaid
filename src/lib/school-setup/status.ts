import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAiEntitlement } from "@/lib/ai/features";

/**
 * School Setup status — computed from the school's real records.
 *
 * WHY THIS IS A DERIVED REPORT
 * ----------------------------
 * Nothing here is stored. There is no checklist table, no "completed" flag and
 * no migration: every item is a question asked of data that already exists, so
 * the report cannot drift from the app, cannot be ticked falsely, and cannot
 * create duplicate rows.
 *
 * SCOPE
 * -----
 * Every query is filtered by `school_id`, and the caller supplies that id from
 * an already-verified session. There is no path here that reads another school.
 *
 * REQUIRED / OPTIONAL / NOT APPLICABLE
 * ------------------------------------
 * Only REQUIRED items that apply to this school count toward the percentage.
 * An optional item that is unset never drags the number down, and a category
 * whose feature is switched off (CBT, website, AI) is reported as
 * `not_applicable` rather than as a wall of missing work.
 */

export type SetupCategoryId =
  | "information"
  | "staff"
  | "students"
  | "academics"
  | "cbt"
  | "finance"
  | "website"
  | "ai";

export type SetupItemStatus =
  | "complete"
  | "incomplete"
  | "blocked"
  | "warning"
  | "not_applicable";

export type SetupRequirement = "required" | "optional";

export type SetupItem = {
  id: string;
  category: SetupCategoryId;
  label: string;
  requirement: SetupRequirement;
  status: SetupItemStatus;
  /** Why it is in this state — written for the person reading the screen. */
  detail: string;
  /** Where to go to fix it. Always a real, existing page. */
  href: string;
  /** The verb on the button: Add, Configure, Manage, Review, Fix. */
  action: string;
};

export type SetupCategory = {
  id: SetupCategoryId;
  label: string;
  complete: number;
  total: number;
  percent: number;
  state: "complete" | "in_progress" | "not_started" | "not_applicable";
};

export type SetupReport = {
  school: { id: string; name: string; logo_url: string | null };
  counts: { requiredTotal: number; requiredComplete: number; percent: number };
  state: "not_started" | "in_progress" | "almost_complete" | "ready" | "attention";
  categories: SetupCategory[];
  items: SetupItem[];
};

const CATEGORY_LABELS: Record<SetupCategoryId, string> = {
  information: "School Information",
  staff: "Teachers & Staff",
  students: "Students",
  academics: "Academics & Assessment",
  cbt: "CBT Configuration",
  finance: "Finance",
  website: "Website",
  ai: "AI Features",
};

const CATEGORY_ORDER: SetupCategoryId[] = [
  "information",
  "staff",
  "students",
  "academics",
  "cbt",
  "finance",
  "website",
  "ai",
];

type Row = Record<string, unknown>;

/**
 * A PostgREST failure, in words.
 *
 * `error.message` can arrive empty (it did for a missing column), which turned a
 * precise diagnosis into a blank one and cost a deploy cycle to find. Every part
 * that carries information is kept.
 */
function describe(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  const parts = [error.message, error.code, error.details, error.hint].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" | ") : "unknown database error";
}

/**
 * Runs every check against one school and returns the whole picture.
 *
 * One round of parallel reads, then pure decisions — so the page costs a fixed
 * number of queries whether the school has 10 students or 10,000.
 */
export async function buildSetupReport(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<SetupReport> {
  /**
   * A head count, always scoped to this school.
   *
   * `column` exists because not every table is keyed by `id`: the answer-key
   * table is keyed by `question_id`, and asking it for `id` is a 400 from
   * PostgREST, not an empty result.
   */
  const count = async (
    table: string,
    tweak?: (q: never) => unknown,
    column = "id",
  ): Promise<number> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base: any = supabase
      .from(table)
      .select(column, { count: "exact", head: true })
      .eq("school_id", schoolId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: n, error } = await (tweak ? (tweak(base as never) as any) : base);
    if (error) throw new Error(`[school-setup] ${table}: ${describe(error)}`);
    return n ?? 0;
  };

  /** Selected columns, always scoped to this school. */
  const rows = async (table: string, columns: string): Promise<Row[]> => {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .eq("school_id", schoolId);
    if (error) throw new Error(`[school-setup] ${table}: ${describe(error)}`);
    return (data ?? []) as unknown as Row[];
  };

  const [
    schoolResult,
    features,
    sessionCount,
    termRows,
    sectionCount,
    levelCount,
    classRows,
    classTeacherRows,
    teacherCount,
    teacherSubjectCount,
    studentCount,
    studentsWithoutClass,
    studentsOnTempPassword,
    studentsWithParentPhone,
    subjectCount,
    classSubjectCount,
    componentTemplates,
    boundComponentTemplates,
    gradingTemplateCount,
    boundGradingCount,
    psychomotorBound,
    affectiveBound,
    reportCardSettingsCount,
    cbtQuestionCount,
    cbtMcqCount,
    cbtAnswerKeyCount,
    cbtAssessments,
    feeHeadCount,
    termFeeCount,
    classFeeCount,
    billCount,
    websiteConfigRows,
    websiteVisibleSections,
  ] = await Promise.all([
    // `schools` is keyed by id, not school_id — the one read that does not use
    // the shared helper, deliberately.
    supabase.from("schools").select("id, name, logo_url, address, email").eq("id", schoolId).maybeSingle(),
    rows("school_features", "feature_key, is_enabled"),
    count("academic_sessions"),
    rows("academic_terms", "id, is_active"),
    count("academic_sections"),
    count("academic_levels"),
    rows("classes", "id, name"),
    rows("class_teachers", "class_id, role, is_active"),
    count("teachers"),
    count("teacher_subjects"),
    count("students", (q) => (q as unknown as { eq: (c: string, v: boolean) => unknown }).eq("is_active", true)),
    count("students", (q) =>
      (q as unknown as { is: (c: string, v: null) => { eq: (c: string, v: boolean) => unknown } })
        .is("class_id", null)
        .eq("is_active", true),
    ),
    count("students", (q) =>
      (q as unknown as { eq: (c: string, v: boolean) => { eq: (c: string, v: boolean) => unknown } })
        .eq("is_active", true)
        .eq("must_change_password", true),
    ),
    count("students", (q) =>
      (q as unknown as { not: (c: string, op: string, v: null) => { eq: (c: string, v: boolean) => unknown } })
        .not("parent_phone", "is", null)
        .eq("is_active", true),
    ),
    count("subjects"),
    count("class_subjects"),
    rows("components_templates", "id, name, components_rows(maximum_score)"),
    count("class_components_templates"),
    count("grading_templates"),
    count("class_grading_templates"),
    count("class_psychomotor_templates"),
    count("class_affective_templates"),
    // `report_card_templates` is a PLATFORM table with no school_id — it holds
    // the template designs themselves. What a school actually configures is a
    // row in `report_card_settings`, which is what this item asks about.
    count("report_card_settings"),
    count("cbt_questions"),
    count("cbt_questions", (q) =>
      (q as unknown as { eq: (c: string, v: string) => unknown }).eq("question_type", "mcq"),
    ),
    count("cbt_question_answer_keys", undefined, "question_id"),
    rows("cbt_assessments", "id, time_limit_minutes, instructions, published_at"),
    count("fee_heads"),
    count("term_fees"),
    count("class_fees"),
    count("student_bills"),
    rows("website_configs", "status"),
    count("website_sections", (q) =>
      (q as unknown as { eq: (c: string, v: boolean) => unknown }).eq("is_visible", true),
    ),
  ]);

  const school = (schoolResult.data ?? null) as
    | { id: string; name: string; logo_url: string | null; address: string | null; email: string | null }
    | null;

  const featureOn = (key: string) =>
    features.some((f) => f.feature_key === key && f.is_enabled === true);

  const cbtOn = featureOn("cbt");
  const websiteOn = featureOn("website");
  // Same rule the gateway applies, so the checklist cannot claim AI is on for a
  // school the gateway would refuse (or off for one it would accept).
  const aiOn = resolveAiEntitlement(
    features.map((f) => ({
      feature_key: String(f.feature_key ?? ""),
      is_enabled: f.is_enabled === true,
    })),
  );

  const classIds = classRows.map((c) => String(c.id));
  const withFormTeacher = new Set(
    classTeacherRows
      .filter((ct) => ct.role === "primary" && ct.is_active === true)
      .map((ct) => String(ct.class_id)),
  );
  const classesWithoutFormTeacher = classIds.filter((id) => !withFormTeacher.has(id)).length;
  const hasActiveTerm = termRows.some((t) => t.is_active === true);

  // Component totals, for the "do the marks add up" warning.
  const componentTotals = componentTemplates.map((t) => {
    const list = (t.components_rows ?? []) as { maximum_score: number | string | null }[];
    return list.reduce((sum, r) => sum + Number(r.maximum_score ?? 0), 0);
  });
  const marksAddUp =
    componentTotals.length > 0 && componentTotals.every((n) => Math.round(n) === 100);

  const publishedPapers = cbtAssessments.filter((a) => a.published_at).length;
  const papersWithDuration = cbtAssessments.filter((a) => a.time_limit_minutes).length;
  const papersWithInstructions = cbtAssessments.filter((a) => a.instructions).length;

  const websiteConfig = websiteConfigRows[0];

  const items: SetupItem[] = [];
  const add = (item: SetupItem) => items.push(item);

  /** A CBT item collapses to "does not apply" when the school's flag is off. */
  const cbt = (status: SetupItemStatus, detail: string): Pick<SetupItem, "status" | "detail"> =>
    cbtOn
      ? { status, detail }
      : { status: "not_applicable", detail: "CBT is switched off for this school, so this does not apply." };

  const site = (status: SetupItemStatus, detail: string): Pick<SetupItem, "status" | "detail"> =>
    websiteOn
      ? { status, detail }
      : { status: "not_applicable", detail: "The website feature is switched off for this school, so this does not apply." };

  // ── A. School information ────────────────────────────────────────────────
  const profileFilled = Boolean(school?.name && school?.address && school?.email);
  add({
    id: "school-profile",
    category: "information",
    label: "School profile",
    requirement: "required",
    status: profileFilled ? "complete" : "incomplete",
    detail: profileFilled
      ? "Name, address and contact email are recorded."
      : "The address or contact email is missing, so receipts and letters cannot carry it.",
    href: "/school-admin/profile",
    action: profileFilled ? "Review" : "Configure",
  });

  add({
    id: "school-branding",
    category: "information",
    label: "Logo and branding",
    requirement: "optional",
    status: school?.logo_url ? "complete" : "incomplete",
    detail: school?.logo_url ? "A logo is set." : "Optional — a logo appears on report cards and receipts.",
    href: "/school-admin/profile",
    action: "Configure",
  });

  add({
    id: "academic-session",
    category: "information",
    label: "Academic session",
    requirement: "required",
    status: sessionCount > 0 ? "complete" : "incomplete",
    detail: sessionCount > 0 ? `${sessionCount} session(s) recorded.` : "No academic session exists yet.",
    href: "/school-admin/sessions",
    action: sessionCount > 0 ? "Manage" : "Add",
  });

  add({
    id: "academic-term",
    category: "information",
    label: "Active term",
    requirement: "required",
    status: hasActiveTerm ? "complete" : sessionCount === 0 ? "blocked" : "incomplete",
    detail: hasActiveTerm
      ? "A term is marked active."
      : sessionCount === 0
        ? "Blocked: terms belong to a session, and no session exists yet."
        : "No term is active; report cards and billing read the active term.",
    href: "/school-admin/sessions",
    action: hasActiveTerm ? "Manage" : sessionCount === 0 ? "Fix: add a session" : "Configure",
  });

  add({
    id: "academic-sections",
    category: "information",
    label: "Academic sections",
    requirement: "required",
    status: sectionCount > 0 ? "complete" : "incomplete",
    detail: sectionCount > 0 ? `${sectionCount} section(s) recorded.` : "No sections exist yet.",
    href: "/school-admin/classes",
    action: sectionCount > 0 ? "Manage" : "Configure",
  });

  add({
    id: "academic-levels",
    category: "information",
    label: "Academic levels",
    requirement: "required",
    status: levelCount > 0 ? "complete" : "incomplete",
    detail: levelCount > 0 ? `${levelCount} level(s) recorded.` : "No academic levels exist yet.",
    href: "/school-admin/academic-levels",
    action: levelCount > 0 ? "Manage" : "Configure",
  });

  add({
    id: "classes",
    category: "information",
    label: "Classes",
    requirement: "required",
    status: classIds.length > 0 ? "complete" : "incomplete",
    detail: classIds.length > 0 ? `${classIds.length} class(es) recorded.` : "No classes exist yet.",
    href: "/school-admin/classes",
    action: classIds.length > 0 ? "Manage" : "Add",
  });

  // ── B. Teachers and staff ────────────────────────────────────────────────
  add({
    id: "teachers",
    category: "staff",
    label: "Teachers registered",
    requirement: "required",
    status: teacherCount > 0 ? "complete" : "incomplete",
    detail: teacherCount > 0 ? `${teacherCount} teacher(s) registered.` : "No teachers registered yet.",
    href: "/school-admin/teachers",
    action: teacherCount > 0 ? "Manage" : "Add",
  });

  add({
    id: "form-teachers",
    category: "staff",
    label: "Form teacher on every class",
    requirement: "required",
    status:
      classIds.length === 0 ? "blocked" : classesWithoutFormTeacher === 0 ? "complete" : "incomplete",
    detail:
      classIds.length === 0
        ? "Blocked: there are no classes to assign a form teacher to."
        : classesWithoutFormTeacher === 0
          ? "Every class has a form teacher."
          : `${classesWithoutFormTeacher} of ${classIds.length} class(es) have no form teacher.`,
    href: "/school-admin/classes",
    action: classesWithoutFormTeacher === 0 ? "Review" : "Assign",
  });

  add({
    id: "teacher-subjects",
    category: "staff",
    label: "Subject–teacher assignments",
    requirement: "required",
    status: teacherSubjectCount > 0 ? "complete" : teacherCount === 0 ? "blocked" : "incomplete",
    detail:
      teacherSubjectCount > 0
        ? `${teacherSubjectCount} assignment(s) recorded.`
        : teacherCount === 0
          ? "Blocked: no teachers exist yet."
          : "No teacher has been assigned a subject yet.",
    href: "/school-admin/teachers",
    action: teacherSubjectCount > 0 ? "Manage" : "Assign",
  });

  // ── C. Students ──────────────────────────────────────────────────────────
  add({
    id: "students",
    category: "students",
    label: "Students registered",
    requirement: "required",
    status: studentCount > 0 ? "complete" : "incomplete",
    detail: studentCount > 0 ? `${studentCount} active student(s).` : "No students registered yet.",
    href: "/school-admin/students",
    action: studentCount > 0 ? "Manage" : "Add",
  });

  add({
    id: "students-in-class",
    category: "students",
    label: "Every student in a class",
    requirement: "required",
    status: studentCount === 0 ? "blocked" : studentsWithoutClass === 0 ? "complete" : "incomplete",
    detail:
      studentCount === 0
        ? "Blocked: no students registered yet."
        : studentsWithoutClass === 0
          ? "All active students are assigned to a class."
          : `${studentsWithoutClass} active student(s) have no class.`,
    href: "/school-admin/students",
    action: studentsWithoutClass === 0 ? "Review" : "Assign",
  });

  add({
    id: "student-logins",
    category: "students",
    label: "Student logins activated",
    requirement: "optional",
    status: studentsOnTempPassword === 0 ? "complete" : "incomplete",
    detail:
      studentsOnTempPassword === 0
        ? "No student is still on a generated password."
        : `${studentsOnTempPassword} student(s) have not changed their generated password yet.`,
    href: "/school-admin/students",
    action: "Review",
  });

  add({
    id: "parent-contact",
    category: "students",
    label: "Parent/guardian contact",
    requirement: "optional",
    status: studentsWithParentPhone > 0 ? "complete" : "incomplete",
    detail:
      studentsWithParentPhone > 0
        ? `${studentsWithParentPhone} student(s) have a guardian number.`
        : "Optional — a guardian number keeps WhatsApp contact working.",
    href: "/school-admin/students",
    action: "Manage",
  });

  // ── D. Academics and assessment ──────────────────────────────────────────
  add({
    id: "subjects",
    category: "academics",
    label: "Subjects",
    requirement: "required",
    status: subjectCount > 0 ? "complete" : "incomplete",
    detail: subjectCount > 0 ? `${subjectCount} subject(s) recorded.` : "No subjects exist yet.",
    href: "/school-admin/subjects",
    action: subjectCount > 0 ? "Manage" : "Add",
  });

  add({
    id: "class-subjects",
    category: "academics",
    label: "Subjects attached to classes",
    requirement: "required",
    status: classSubjectCount > 0 ? "complete" : subjectCount === 0 ? "blocked" : "incomplete",
    detail:
      classSubjectCount > 0
        ? `${classSubjectCount} class–subject link(s).`
        : subjectCount === 0
          ? "Blocked: no subjects exist yet."
          : "No subject has been attached to a class.",
    href: "/school-admin/subjects",
    action: classSubjectCount > 0 ? "Manage" : "Assign",
  });

  add({
    id: "assessment-components",
    category: "academics",
    label: "Assessment components",
    requirement: "required",
    status: componentTemplates.length > 0 ? "complete" : "incomplete",
    detail:
      componentTemplates.length > 0
        ? `${componentTemplates.length} component template(s).`
        : "No assessment components configured yet.",
    href: "/school-admin/assessment?tab=components",
    action: componentTemplates.length > 0 ? "Manage" : "Configure",
  });

  add({
    id: "components-bound",
    category: "academics",
    label: "Components attached to classes",
    requirement: "required",
    status:
      boundComponentTemplates > 0
        ? "complete"
        : componentTemplates.length === 0
          ? "blocked"
          : "incomplete",
    detail:
      boundComponentTemplates > 0
        ? `${boundComponentTemplates} class binding(s).`
        : componentTemplates.length === 0
          ? "Blocked: no component template exists to attach."
          : "A component template exists but is not attached to any class.",
    href: "/school-admin/assessment?tab=components",
    action: boundComponentTemplates > 0 ? "Manage" : "Assign",
  });

  add({
    id: "components-total",
    category: "academics",
    label: "Component marks add up",
    requirement: "optional",
    status: componentTotals.length === 0 ? "incomplete" : marksAddUp ? "complete" : "warning",
    detail:
      componentTotals.length === 0
        ? "No components configured yet."
        : marksAddUp
          ? "Every component template totals 100."
          : `Totals found: ${componentTotals.map((n) => Math.round(n)).join(", ")}. Confirm this matches your assessment structure.`,
    href: "/school-admin/assessment?tab=components",
    action: "Review",
  });

  add({
    id: "grading",
    category: "academics",
    label: "Grading scale",
    requirement: "required",
    status:
      gradingTemplateCount > 0 && boundGradingCount > 0
        ? "complete"
        : gradingTemplateCount === 0
          ? "incomplete"
          : "warning",
    detail:
      gradingTemplateCount > 0 && boundGradingCount > 0
        ? "A grading scale is configured and attached to classes."
        : gradingTemplateCount === 0
          ? "No grading scale configured yet."
          : "A grading scale exists but is not attached to any class.",
    href: "/school-admin/assessment?tab=grading",
    action: gradingTemplateCount > 0 ? "Manage" : "Configure",
  });

  add({
    id: "psychomotor-affective",
    category: "academics",
    label: "Psychomotor and affective traits",
    requirement: "optional",
    status: psychomotorBound > 0 && affectiveBound > 0 ? "complete" : "incomplete",
    detail:
      psychomotorBound > 0 && affectiveBound > 0
        ? "Both trait sets are attached to classes."
        : "Optional — report cards can carry behavioural traits.",
    href: "/school-admin/assessment?tab=psychomotor",
    action: "Configure",
  });

  add({
    id: "report-card-template",
    category: "academics",
    label: "Report card template",
    requirement: "required",
    status: reportCardSettingsCount > 0 ? "complete" : "incomplete",
    detail:
      reportCardSettingsCount > 0
        ? "Report card settings are configured for this school."
        : "No report card settings configured yet.",
    href: "/school-admin/report-cards/settings",
    action: reportCardSettingsCount > 0 ? "Review" : "Configure",
  });

  // ── E. CBT ───────────────────────────────────────────────────────────────
  add({
    id: "cbt-enabled",
    category: "cbt",
    label: "CBT enabled for this school",
    requirement: "required",
    status: cbtOn ? "complete" : "not_applicable",
    detail: cbtOn
      ? "The CBT feature flag is on. It is changed from the Super Admin school page."
      : "CBT is switched off for this school. Turn it on in the Super Admin school page.",
    href: "/school-admin/dashboard",
    action: "Review",
  });

  add({
    id: "cbt-questions",
    category: "cbt",
    label: "Questions in the bank",
    requirement: "required",
    ...cbt(
      cbtQuestionCount > 0 ? "complete" : "incomplete",
      cbtQuestionCount > 0
        ? `${cbtQuestionCount} question(s) stored.`
        : "No CBT questions have been written yet.",
    ),
    href: "/teacher/cbt/questions",
    action: "Manage",
  });

  add({
    id: "cbt-answer-keys",
    category: "cbt",
    label: "Multiple-choice answer keys",
    requirement: "required",
    ...cbt(
      cbtMcqCount === 0 ? "incomplete" : cbtAnswerKeyCount >= cbtMcqCount ? "complete" : "incomplete",
      cbtMcqCount === 0
        ? "No multiple-choice questions exist yet."
        : `${cbtAnswerKeyCount} answer key(s) for ${cbtMcqCount} multiple-choice question(s).`,
    ),
    href: "/teacher/cbt/questions",
    action: "Manage",
  });

  add({
    id: "cbt-class-subjects",
    category: "cbt",
    label: "CBT classes and subjects ready",
    requirement: "required",
    ...cbt(
      classSubjectCount > 0 ? "complete" : "blocked",
      classSubjectCount > 0
        ? "At least one class has a subject, so papers can be set."
        : subjectCount === 0
          ? "Blocked: no subjects exist, so no CBT paper can be set."
          : "Blocked: no class has a subject attached yet.",
    ),
    href: "/school-admin/subjects",
    action: "Fix: assign subjects",
  });

  add({
    id: "cbt-papers",
    category: "cbt",
    label: "CBT papers created",
    requirement: "required",
    ...cbt(
      cbtAssessments.length > 0 ? "complete" : classSubjectCount === 0 ? "blocked" : "incomplete",
      cbtAssessments.length > 0
        ? `${cbtAssessments.length} paper(s) created.`
        : classSubjectCount === 0
          ? "Blocked: a paper needs a class with a subject first."
          : "No CBT paper created yet.",
    ),
    href: "/teacher/cbt/assessments",
    action: cbtAssessments.length > 0 ? "Manage" : "Configure",
  });

  add({
    id: "cbt-duration",
    category: "cbt",
    label: "Examination duration set",
    requirement: "required",
    ...cbt(
      papersWithDuration > 0 ? "complete" : cbtAssessments.length === 0 ? "blocked" : "incomplete",
      papersWithDuration > 0
        ? `${papersWithDuration} paper(s) have a time limit.`
        : cbtAssessments.length === 0
          ? "Blocked: create a paper before setting its duration."
          : "No paper has a time limit yet.",
    ),
    href: "/teacher/cbt/assessments",
    action: "Configure",
  });

  add({
    id: "cbt-instructions",
    category: "cbt",
    label: "Examination instructions",
    requirement: "optional",
    ...cbt(
      papersWithInstructions > 0 ? "complete" : "incomplete",
      papersWithInstructions > 0
        ? "Instructions are written on at least one paper."
        : "Optional — instructions are shown to students before they start.",
    ),
    href: "/teacher/cbt/assessments",
    action: "Configure",
  });

  add({
    id: "cbt-published",
    category: "cbt",
    label: "A paper published",
    requirement: "required",
    ...cbt(
      publishedPapers > 0 ? "complete" : cbtAssessments.length === 0 ? "blocked" : "incomplete",
      publishedPapers > 0
        ? `${publishedPapers} paper(s) published.`
        : cbtAssessments.length === 0
          ? "Blocked: publish a paper once it has been created."
          : "No paper is published, so students cannot sit one yet.",
    ),
    href: "/teacher/cbt/assessments",
    action: "Review",
  });

  // ── F. Finance (optional category) ───────────────────────────────────────
  const financeItems: [string, string, number, string][] = [
    ["fee-heads", "Fee heads", feeHeadCount, "/school-admin/finance/setup"],
    ["term-fees", "Term fees", termFeeCount, "/school-admin/finance/fees"],
    ["class-fees", "Class fees", classFeeCount, "/school-admin/finance/fees"],
    ["billing", "Bills generated", billCount, "/school-admin/finance/billing"],
  ];
  for (const [id, label, value, href] of financeItems) {
    add({
      id,
      category: "finance",
      label,
      requirement: "optional",
      status: value > 0 ? "complete" : "incomplete",
      detail: value > 0 ? `${value} record(s).` : "Optional — set up only if this school collects fees here.",
      href,
      action: value > 0 ? "Manage" : "Configure",
    });
  }

  // ── G. Website ───────────────────────────────────────────────────────────
  add({
    id: "website-config",
    category: "website",
    label: "Website configured",
    requirement: "optional",
    ...site(
      websiteConfig ? "complete" : "incomplete",
      websiteConfig ? "A website record exists." : "Optional — set up a public site for this school.",
    ),
    href: "/school-admin/website",
    action: "Configure",
  });

  add({
    id: "website-content",
    category: "website",
    label: "Content published to pages",
    requirement: "optional",
    ...site(
      websiteVisibleSections > 0 ? "complete" : "incomplete",
      websiteVisibleSections > 0
        ? `${websiteVisibleSections} visible section(s).`
        : "No visible website sections yet.",
    ),
    href: "/school-admin/website/content",
    action: "Manage",
  });

  // ── H. AI ────────────────────────────────────────────────────────────────
  add({
    id: "ai-enabled",
    category: "ai",
    label: "AI features enabled",
    requirement: "optional",
    status: aiOn ? "complete" : "not_applicable",
    detail: aiOn
      ? "The AI feature flag is on for this school."
      : "AI is switched off for this school, so this does not apply.",
    href: "/school-admin/dashboard",
    action: "Review",
  });

  // ── Percentages ──────────────────────────────────────────────────────────
  const counted = items.filter(
    (i) => i.requirement === "required" && i.status !== "not_applicable",
  );
  const requiredComplete = counted.filter(
    (i) => i.status === "complete" || i.status === "warning",
  ).length;
  const percent = counted.length === 0 ? 0 : Math.round((requiredComplete / counted.length) * 100);

  const categories: SetupCategory[] = CATEGORY_ORDER.map((id) => {
    const applicable = items.filter(
      (i) => i.category === id && i.requirement === "required" && i.status !== "not_applicable",
    );

    if (applicable.length === 0) {
      return {
        id,
        label: CATEGORY_LABELS[id],
        complete: 0,
        total: 0,
        percent: 0,
        state: "not_applicable" as const,
      };
    }

    const done = applicable.filter((i) => i.status === "complete" || i.status === "warning").length;
    return {
      id,
      label: CATEGORY_LABELS[id],
      complete: done,
      total: applicable.length,
      percent: Math.round((done / applicable.length) * 100),
      state: done === applicable.length ? "complete" : done === 0 ? "not_started" : "in_progress",
    };
  });

  const blocked = items.filter((i) => i.status === "blocked").length;
  const state: SetupReport["state"] =
    percent === 0
      ? "not_started"
      : percent === 100 && blocked === 0
        ? "ready"
        : percent === 100
          ? "attention"
          : percent >= 90
            ? "almost_complete"
            : "in_progress";

  return {
    school: {
      id: schoolId,
      name: school?.name ?? "This school",
      logo_url: school?.logo_url ?? null,
    },
    counts: { requiredTotal: counted.length, requiredComplete, percent },
    state,
    categories,
    items,
  };
}
