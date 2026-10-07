// ============================================================
// Capability Registry — maps every AI capability to existing
// backend API routes. This is the single source of truth that
// the AI uses to understand what it can do.
//
// NEVER add capabilities that bypass existing APIs.
// Every capability must call an existing route handler.
//
// riskLevel:
//   "safe"     — fully reversible, low-impact (create, configure)
//   "moderate" — significant but not destructive (update, assign)
//   "high"     — BLOCKED from AI execution (deactivate, publish,
//                delete, billing changes, migrations)
// ============================================================

import type { Capability, CapabilityParam } from "./types";

// Helper to reduce repetition
const P = (name: string, type: CapabilityParam["type"], description: string, required = false): CapabilityParam => ({
  name, type, description, required,
});

// ── Capabilities blocked from AI execution ──────────────────
// These are checked at the execution-engine level (not just prompt).
export const HIGH_RISK_CAPABILITIES = new Set([
  "publish_results",
  "deactivate_school",
  "activate_school",
  "suspend_school",
  "delete_school",
  "delete_student",
  "delete_teacher",
  "delete_class",
  "delete_subject",
  "delete_session",
  "delete_term",
  "delete_report_card",
  "wipe_school_data",
  "run_migration",
  "modify_billing",
]);

export const CAPABILITIES: Capability[] = [
  // ═══════════════════════════════════════════════════════════
  // READ-ONLY QUERIES
  // ═══════════════════════════════════════════════════════════

  {
    name: "list_students",
    description: "Lists students for the current school, optionally filtered by class, status, or search term. Returns paginated results.",
    category: "query",
    endpoint: "/api/school-admin/students",
    method: "GET",
    params: [
      P("class_id", "string", "Filter by class ID", false),
      P("search", "string", "Search by name", false),
      P("status", "string", "active, archived, or all", false),
      P("page", "number", "Page number (1-based)", false),
      P("limit", "number", "Results per page (max 100)", false),
    ],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_teachers",
    description: "Lists teachers for the current school with optional search and pagination.",
    category: "query",
    endpoint: "/api/school-admin/teachers",
    method: "GET",
    params: [
      P("search", "string", "Search by name or email", false),
      P("subject_id", "string", "Filter by assigned subject", false),
      P("page", "number", "Page number", false),
      P("limit", "number", "Results per page", false),
    ],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_classes",
    description: "Lists all classes for the current school with primary teacher info and student counts.",
    category: "query",
    endpoint: "/api/school-admin/classes",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_subjects",
    description: "Lists all subjects for the current school.",
    category: "query",
    endpoint: "/api/school-admin/subjects",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_sessions",
    description: "Lists academic sessions for the current school.",
    category: "query",
    endpoint: "/api/school-admin/sessions",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_terms",
    description: "Lists academic terms for the current school.",
    category: "query",
    endpoint: "/api/school-admin/terms",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_grading_scales",
    description: "Lists grading scales configured for the current school.",
    category: "query",
    endpoint: "/api/school-admin/grading-scales",
    method: "GET",
    params: [P("class_id", "string", "Filter by class", false)],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_assessment_components",
    description: "Lists assessment components (e.g. Test, Exam) for the current school.",
    category: "query",
    endpoint: "/api/school-admin/assessment-components",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_psychomotor",
    description: "Lists psychomotor domain definitions for the current school.",
    category: "query",
    endpoint: "/api/school-admin/psychomotor",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_affective",
    description: "Lists affective domain definitions for the current school.",
    category: "query",
    endpoint: "/api/school-admin/affective",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_class_subjects",
    description: "Lists subjects assigned to a specific class.",
    category: "query",
    endpoint: "/api/school-admin/class-subjects",
    method: "GET",
    params: [P("class_id", "string", "Class ID", true)],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "list_class_teachers",
    description: "Lists teachers assigned to classes, optionally filtered by class.",
    category: "query",
    endpoint: "/api/school-admin/class-teachers",
    method: "GET",
    params: [P("class_id", "string", "Filter by class", false)],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "get_school_info",
    description: "Gets current school profile and configuration details.",
    category: "query",
    endpoint: "/api/school-admin/school",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "get_report_card_settings",
    description: "Gets report card configuration for the current school.",
    category: "query",
    endpoint: "/api/school-admin/report-card-settings",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  // ═══════════════════════════════════════════════════════════
  // STUDENT OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_student",
    description: "Creates a single student record including auth user, profile, and a unique generated password. The password is returned once in this step's output so it can be handed to the student; it is cleared automatically the first time they sign in.",
    category: "student",
    endpoint: "/api/school-admin/students",
    method: "POST",
    params: [
      P("first_name", "string", "Student first name", true),
      P("last_name", "string", "Student last name", true),
      P("middle_name", "string", "Student middle name", false),
      P("class_id", "string", "Class ID to assign student to", true),
      P("date_of_birth", "string", "Date of birth (YYYY-MM-DD)", false),
      P("gender", "string", "male or female", false),
      P("parent_phone", "string", "Parent/guardian phone number", false),
      P("student_id", "string", "Custom admission number (auto-generated if omitted)", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Archive the student via PATCH with is_active=false",
  },

  {
    name: "update_student",
    description: "Updates an existing student's details including class assignment and profile info.",
    category: "student",
    endpoint: "/api/school-admin/students",
    method: "PUT",
    params: [
      P("id", "string", "Student ID", true),
      P("first_name", "string", "Updated first name", false),
      P("last_name", "string", "Updated last name", false),
      P("class_id", "string", "New class assignment", false),
      P("date_of_birth", "string", "Date of birth (YYYY-MM-DD)", false),
      P("gender", "string", "male or female", false),
      P("parent_phone", "string", "Parent phone", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription: "Previous values must be stored and re-applied. Not automatically reversible.",
  },

  {
    name: "archive_student",
    description: "Archives (deactivates) a student so they no longer appear in active lists. Does not delete data.",
    category: "student",
    endpoint: "/api/school-admin/students",
    method: "PATCH",
    params: [
      P("id", "string", "Student ID", true),
      P("is_active", "boolean", "false to archive, true to restore", true),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Set is_active=true to restore the student",
  },

  // ═══════════════════════════════════════════════════════════
  // TEACHER OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_teacher",
    description: "Creates a teacher record with auth user, profile, and generated credentials.",
    category: "teacher",
    endpoint: "/api/school-admin/teachers",
    method: "POST",
    params: [
      P("first_name", "string", "Teacher first name", true),
      P("last_name", "string", "Teacher last name", true),
      P("email", "string", "Teacher email (auto-generated if omitted)", false),
      P("phone", "string", "Phone number", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Archive the teacher via the teachers endpoint",
  },

  {
    name: "assign_teacher_to_class",
    description: "Assigns a teacher as primary or assistant teacher for a class.",
    category: "teacher",
    endpoint: "/api/school-admin/class-teachers",
    method: "POST",
    params: [
      P("teacher_id", "string", "Teacher ID", true),
      P("class_id", "string", "Class ID", true),
      P("role", "string", "primary or assistant", true),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Remove the class-teacher assignment",
  },

  {
    name: "assign_teacher_to_subject",
    description: "Assigns a teacher to teach a specific subject in a specific class.",
    category: "teacher",
    endpoint: "/api/school-admin/assignments",
    method: "POST",
    params: [
      P("teacher_id", "string", "Teacher ID", true),
      P("subject_id", "string", "Subject ID", true),
      P("class_id", "string", "Class ID", true),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Remove the teacher-subject-class assignment",
  },

  // ═══════════════════════════════════════════════════════════
  // CLASS OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_class",
    description: "Creates a new class/grade level for the school.",
    category: "class",
    endpoint: "/api/school-admin/classes",
    method: "POST",
    params: [
      P("name", "string", "Class name, e.g. 'Basic 1' or 'Primary 1'", true),
      P("grade_level", "number", "Numeric grade level for ordering", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created class",
  },

  // ═══════════════════════════════════════════════════════════
  // SUBJECT OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_subject",
    description: "Creates a new subject for the school.",
    category: "subject",
    endpoint: "/api/school-admin/subjects",
    method: "POST",
    params: [
      P("name", "string", "Subject name, e.g. 'Mathematics'", true),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created subject",
  },

  {
    name: "assign_subject_to_class",
    description: "Assigns a subject to a class so it appears on their report card.",
    category: "subject",
    endpoint: "/api/school-admin/class-subjects",
    method: "POST",
    params: [
      P("subject_id", "string", "Subject ID", true),
      P("class_id", "string", "Class ID", true),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Remove the class-subject assignment",
  },

  // ═══════════════════════════════════════════════════════════
  // SESSION / TERM OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_session",
    description: "Creates a new academic session (e.g. '2026/2027').",
    category: "session",
    endpoint: "/api/school-admin/sessions",
    method: "POST",
    params: [
      P("name", "string", "Session name, e.g. '2026/2027'", true),
      P("is_active", "boolean", "Set as active session", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created session",
  },

  {
    name: "create_term",
    description: "Creates a new academic term within a session.",
    category: "term",
    endpoint: "/api/school-admin/terms",
    method: "POST",
    params: [
      P("session_id", "string", "Parent session ID", true),
      P("term_name", "string", "First Term, Second Term, or Third Term", true),
      P("is_active", "boolean", "Set as active term", false),
      P("next_term_begins", "string", "Next term start date", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created term",
  },

  // ═══════════════════════════════════════════════════════════
  // ASSESSMENT / GRADING OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_assessment_component",
    description: "Creates an assessment component (e.g. 'Test', 'Exam', 'Assignment') with a maximum score.",
    category: "assessment",
    endpoint: "/api/school-admin/assessment-components",
    method: "POST",
    params: [
      P("name", "string", "Component name, e.g. 'Continuous Assessment'", true),
      P("maximum_score", "number", "Maximum possible score", true),
      P("display_order", "number", "Display order (1-based)", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created assessment component",
  },

  {
    name: "create_grading_scale",
    description: "Creates a grading scale entry (e.g. A=70-100, B=60-69).",
    category: "grading",
    endpoint: "/api/school-admin/grading-scales",
    method: "POST",
    params: [
      P("grade", "string", "Grade letter, e.g. 'A'", true),
      P("minimum_score", "number", "Minimum score for this grade", true),
      P("maximum_score", "number", "Maximum score for this grade", true),
      P("remark", "string", "Remark, e.g. 'Excellent'", true),
      P("class_id", "string", "Class ID (omit for school-wide default)", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created grading scale entry",
  },

  // ═══════════════════════════════════════════════════════════
  // PSYCHOMOTOR / AFFECTIVE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_psychomotor_trait",
    description: "Creates a psychomotor domain trait (e.g. 'Handwriting', 'Sports').",
    category: "psychomotor",
    endpoint: "/api/school-admin/psychomotor",
    method: "POST",
    params: [
      P("name", "string", "Trait name", true),
      P("display_order", "number", "Display order", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created psychomotor trait",
  },

  {
    name: "create_affective_trait",
    description: "Creates an affective domain trait (e.g. 'Punctuality', 'Neatness').",
    category: "affective",
    endpoint: "/api/school-admin/affective",
    method: "POST",
    params: [
      P("name", "string", "Trait name", true),
      P("display_order", "number", "Display order", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created affective trait",
  },

  // ═══════════════════════════════════════════════════════════
  // REPORT CARD SETTINGS (safe — config only, not publishing)
  // ═══════════════════════════════════════════════════════════

  {
    name: "configure_report_card_settings",
    description: "Updates report card display configuration settings for the school (what sections to show/hide).",
    category: "report_card",
    endpoint: "/api/school-admin/report-card-settings",
    method: "PUT",
    params: [
      P("show_attendance", "boolean", "Show attendance on report cards", false),
      P("show_psychomotor", "boolean", "Show psychomotor ratings", false),
      P("show_affective", "boolean", "Show affective ratings", false),
      P("principal_name", "string", "Principal/head teacher name for signature", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription: "Settings override. Store previous values to restore.",
  },

  // ═══════════════════════════════════════════════════════════
  // HIGH-RISK — BLOCKED FROM AI EXECUTION
  // These capabilities are defined so the AI knows they exist
  // but the execution engine will hard-refuse them.
  // ═══════════════════════════════════════════════════════════

  {
    name: "publish_results",
    description: "⛔ HIGH-RISK: Publishes term results for a class. Results become visible to students and parents. BLOCKED — must be done manually through the Report Cards dashboard.",
    category: "publishing",
    endpoint: "/api/school-admin/report-card-review",
    method: "POST",
    params: [
      P("class_id", "string", "Class to publish results for", true),
      P("term_id", "string", "Term to publish", true),
    ],
    isReadOnly: false,
    riskLevel: "high",
    rollbackStrategy: "manual",
    rollbackDescription: "Unpublish via the report card review endpoint. Not automatically reversible.",
  },

  // ══════════════════════════════════════════════════════════
  // WEBSITE
  // These do not invent a second way to write a website: they run the same
  // validators and the same database function the school's own website editor
  // runs, scoped to one school, and they refuse everything while the school's
  // `website` feature is off. There is no draft/publish step in V1 — a save IS
  // live — so every write below says so in its result.
  // ═══════════════════════════════════════════════════════════

  {
    name: "read_website_config",
    description:
      "Reads the school's website settings: whether the website is enabled, its status (active, suspended or disabled), its template, the colour palette, the contact links, the search-engine title and description, and any custom domain.",
    category: "website",
    endpoint: "/api/school-admin/website/config",
    method: "GET",
    params: [],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "get_website_content",
    description:
      "Reads the school website's home page. Without `kind` it lists every block already saved, whether each is visible, the field names it holds, and what each kind of block requires. With `kind` it returns that one block in full, what the block's list items must contain, and — for a block that has never been saved — a fill-in shape. ALWAYS read a block before editing it, and always read before filling a block for the first time.",
    category: "website",
    endpoint: "/api/school-admin/website/content",
    method: "GET",
    params: [P("kind", "string", "Return this one block in full, e.g. hero, about, principal_message, contact, events, gallery", false)],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "configure_website",
    description:
      "Changes the school's website settings. Only the settings you give are changed; everything else is left alone. An empty string clears a contact link or an SEO field. LIVE IMMEDIATELY — there is no draft step, visitors see the change as soon as it saves. Requires the school's Website feature to be enabled.",
    category: "website",
    endpoint: "/api/school-admin/website/config",
    method: "PUT",
    params: [
      P("palette", "string", "Colour palette: cobalt, forest, plum, slate or maroon", false),
      P("whatsapp", "string", "WhatsApp link as a URL, e.g. https://wa.me/2348012345678", false),
      P("facebook", "string", "Facebook page URL (https://)", false),
      P("instagram", "string", "Instagram profile URL (https://)", false),
      P("x", "string", "X/Twitter profile URL (https://)", false),
      P("youtube", "string", "YouTube channel URL (https://)", false),
      P("seo_title", "string", "Browser-tab and search-result title (max 80 characters)", false),
      P("seo_description", "string", "Search-engine description (max 200 characters)", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription:
      "Re-run configure_website with the previous values (read them with read_website_config first).",
  },

  {
    name: "update_website_section",
    description:
      "Fills or edits ONE block on the school website's home page. Blocks the classic template can render: notice, hero, values, about, programs, facilities, principal_message, highlights, testimonials, admissions_steps, events, faq, gallery, blog, contact. Only the fields you send are changed — the rest of the block, and every other block, is left as it was. A block that has never been saved must be sent complete the first time, so read it first (get_website_content with that kind) and fill the shape it returns; a block marked hidden may stay half-written. Send ONE step per block, with its fields and its visibility together — never a fill step and a separate switch-on step. LIVE IMMEDIATELY. Requires the school's Website feature to be enabled.",
    category: "website",
    endpoint: "/api/school-admin/website/content",
    method: "PUT",
    params: [
      P("kind", "string", "The block to change, e.g. hero, about, contact", true),
      P("fields", "object", "The block's content fields (text, lists, image URLs). Read the block first to see the fields it holds.", false),
      P("is_visible", "boolean", "Show or hide the block on the public page", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription:
      "Re-run update_website_section with the previous field values (read the block first to capture them).",
  },

  // ══════════════════════════════════════════════════════════
  // SUPER ADMIN OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "list_all_schools",
    description: "Lists all schools in the platform with their subscription status.",
    category: "school",
    endpoint: "/api/super-admin/schools",
    method: "GET",
    params: [
      P("archived", "string", "Set to 'true' for archived, 'false' for active", false),
    ],
    isReadOnly: true,
    riskLevel: "safe",
    rollbackStrategy: "not_supported",
  },

  {
    name: "create_school",
    description: "Creates a new school with its subscription row and first admin account, exactly as the Super Admin Schools screen does. The admin's email and one-time password are returned in this step's output.",
    category: "school",
    endpoint: "/api/super-admin/schools",
    method: "POST",
    params: [
      P("name", "string", "School name, e.g. 'Grace Academy'", true),
      P("email", "string", "School contact email", true),
      P("slug", "string", "Unique URL slug (auto-generated if omitted)", false),
      P("phone", "string", "School phone", false),
      P("address", "string", "School address", false),
      P("motto", "string", "School motto", false),
    ],
    isReadOnly: false,
    riskLevel: "safe",
    rollbackStrategy: "manual",
    rollbackDescription: "School creation is not automatically reversible; manage or archive the school from the Super Admin Schools dashboard.",
  },

  {
    name: "update_school",
    description: "Updates a school's name, email, phone, or address. Subscription and billing fields are not reachable through this capability.",
    category: "school",
    endpoint: "/api/super-admin/schools",
    method: "PUT",
    params: [
      P("school_id", "string", "School ID", true),
      P("name", "string", "Updated name", false),
      P("email", "string", "Updated email", false),
      P("phone", "string", "Updated phone", false),
      P("address", "string", "Updated address", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription: "Previous values must be stored and re-applied.",
  },

  {
    name: "provision_school_admin",
    description: "Provisions a school admin account for schools missing one.",
    category: "school",
    endpoint: "/api/super-admin/bulk-provision-admins",
    method: "POST",
    params: [
      P("school_id", "string", "School ID to provision. Omit for all schools missing admins.", false),
    ],
    isReadOnly: false,
    riskLevel: "moderate",
    rollbackStrategy: "manual",
    rollbackDescription: "Provisioned accounts must be manually deactivated.",
  },
];

// ── Helpers ─────────────────────────────────────────────────

/** Get a capability by name */
export function getCapability(name: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.name === name);
}

/** Get all read-only capabilities */
export function getReadOnlyCapabilities(): Capability[] {
  return CAPABILITIES.filter((c) => c.isReadOnly);
}

/** Get all write capabilities */
export function getWriteCapabilities(): Capability[] {
  return CAPABILITIES.filter((c) => !c.isReadOnly);
}

/** Check if a capability is blocked from AI execution */
export function isHighRisk(capabilityName: string): boolean {
  const cap = getCapability(capabilityName);
  return cap?.riskLevel === "high" || HIGH_RISK_CAPABILITIES.has(capabilityName);
}

/** Get capabilities grouped by category */
export function getCapabilitiesByCategory(): Record<string, Capability[]> {
  const grouped: Record<string, Capability[]> = {};
  for (const cap of CAPABILITIES) {
    if (!grouped[cap.category]) grouped[cap.category] = [];
    grouped[cap.category].push(cap);
  }
  return grouped;
}

/** Generate a text description of all capabilities for the AI system prompt.
 *  High-risk capabilities are mentioned as "blocked" so the AI knows to refuse them. */
export function generateCapabilitiesDescription(): string {
  const byCategory = getCapabilitiesByCategory();
  const lines: string[] = [];

  for (const [category, caps] of Object.entries(byCategory)) {
    lines.push(`## ${category.toUpperCase()}`);
    for (const cap of caps) {
      const rw = cap.isReadOnly ? "[READ]" : cap.riskLevel === "high" ? "[BLOCKED]" : "[WRITE]";
      lines.push(`- **${cap.name}** ${rw}: ${cap.description}`);
      if (cap.params && cap.params.length > 0 && cap.riskLevel !== "high") {
        const required = cap.params.filter((p: CapabilityParam) => p.required).map((p: CapabilityParam) => p.name);
        const optional = cap.params.filter((p: CapabilityParam) => !p.required).map((p: CapabilityParam) => p.name);
        if (required.length) lines.push(`  Required: ${required.join(", ")}`);
        if (optional.length) lines.push(`  Optional: ${optional.join(", ")}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
