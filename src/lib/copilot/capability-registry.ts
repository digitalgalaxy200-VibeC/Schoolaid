// ============================================================
// Capability Registry — maps every AI capability to existing
// backend API routes. This is the single source of truth that
// the AI uses to understand what it can do.
//
// NEVER add capabilities that bypass existing APIs.
// Every capability must call an existing route handler.
// ============================================================

import type { Capability, CapabilityParam } from "./types";

// Helper to reduce repetition
const P = (name: string, type: CapabilityParam["type"], description: string, required = false): CapabilityParam => ({
  name, type, description, required,
});

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
    rollbackStrategy: "not_supported",
  },

  // ═══════════════════════════════════════════════════════════
  // STUDENT OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "create_student",
    description: "Creates a single student record including auth user, profile, and generated credentials. Also sends a welcome email with login details.",
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
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Delete the created affective trait",
  },

  // ═══════════════════════════════════════════════════════════
  // REPORT CARD / PUBLISHING OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "configure_report_card_settings",
    description: "Updates report card configuration settings for the school.",
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
    rollbackStrategy: "manual",
    rollbackDescription: "Settings override. Store previous values to restore.",
  },

  {
    name: "publish_results",
    description: "Publishes term results for a class. Results become visible to students and parents.",
    category: "publishing",
    endpoint: "/api/school-admin/report-card-review",
    method: "POST",
    params: [
      P("class_id", "string", "Class to publish results for", true),
      P("term_id", "string", "Term to publish", true),
    ],
    isReadOnly: false,
    rollbackStrategy: "manual",
    rollbackDescription: "Unpublish via the report card review endpoint. Not automatically reversible.",
  },

  // ═══════════════════════════════════════════════════════════
  // TEMPLATE OPERATIONS
  // ═══════════════════════════════════════════════════════════

  {
    name: "apply_assessment_template",
    description: "Applies a predefined assessment template to configure components and grading for classes.",
    category: "assessment",
    endpoint: "/api/school-admin/templates",
    method: "POST",
    params: [
      P("template_id", "string", "Template ID to apply", true),
      P("class_ids", "string[]", "Class IDs to apply the template to", true),
    ],
    isReadOnly: false,
    rollbackStrategy: "manual",
    rollbackDescription: "Templates create multiple records across tables. Manual rollback required.",
  },

  // ═══════════════════════════════════════════════════════════
  // SUPER ADMIN OPERATIONS (no school context needed)
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
    rollbackStrategy: "not_supported",
  },

  {
    name: "create_school",
    description: "Creates a new school on the platform. Requires school name. Optionally set slug, email, phone, address, motto, and website.",
    category: "school",
    endpoint: "/api/super-admin/schools",
    method: "POST",
    params: [
      P("name", "string", "School name, e.g. 'Grace Academy'", true),
      P("slug", "string", "Unique URL slug (auto-generated if omitted)", false),
      P("email", "string", "School contact email", false),
      P("phone", "string", "School phone", false),
      P("address", "string", "School address", false),
      P("motto", "string", "School motto", false),
    ],
    isReadOnly: false,
    rollbackStrategy: "reverse_api",
    rollbackDescription: "Archive the school (soft delete).",
  },

  {
    name: "update_school",
    description: "Updates a school's details or subscription status.",
    category: "school",
    endpoint: "/api/super-admin/schools",
    method: "PUT",
    params: [
      P("school_id", "string", "School ID", true),
      P("name", "string", "Updated name", false),
      P("subscription_status", "string", "active, inactive, or suspended", false),
    ],
    isReadOnly: false,
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
    rollbackStrategy: "manual",
    rollbackDescription: "Provisioned accounts must be manually deactivated.",
  },

  {
    name: "impersonate_school",
    description: "Opens the school admin dashboard as that school's admin. Use to manage a school's internal configuration.",
    category: "school",
    endpoint: "/api/super-admin/impersonate",
    method: "POST",
    params: [
      P("school_id", "string", "School ID to impersonate", true),
    ],
    isReadOnly: false,
    rollbackStrategy: "not_supported",
    rollbackDescription: "Exit impersonation to return to super admin dashboard.",
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

/** Get capabilities grouped by category */
export function getCapabilitiesByCategory(): Record<string, Capability[]> {
  const grouped: Record<string, Capability[]> = {};
  for (const cap of CAPABILITIES) {
    if (!grouped[cap.category]) grouped[cap.category] = [];
    grouped[cap.category].push(cap);
  }
  return grouped;
}

/** Generate a text description of all capabilities for the AI system prompt */
export function generateCapabilitiesDescription(): string {
  const byCategory = getCapabilitiesByCategory();
  const lines: string[] = [];

  for (const [category, caps] of Object.entries(byCategory)) {
    lines.push(`## ${category.toUpperCase()}`);
    for (const cap of caps) {
      const rw = cap.isReadOnly ? "[READ-ONLY]" : "[WRITE]";
      lines.push(`- **${cap.name}** ${rw}: ${cap.description}`);
      if (cap.params && cap.params.length > 0) {
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
