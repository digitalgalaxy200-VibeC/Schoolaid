// ============================================================
// SchoolAid — Database Types
// Auto-describe every table column for full TypeScript safety.
// Expand each table as the schema migration is applied in Phase 0.
// ============================================================

export type UserRole = "super_admin" | "school_admin" | "teacher" | "student";
export type SubscriptionStatus = "active" | "inactive" | "suspended";
export type AccountStatus = "active" | "suspended" | "disabled";
export type TermName = "First Term" | "Second Term" | "Third Term";

// ------------------------------------------------------------------
// Authentication (managed by Supabase Auth)
// ------------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  school_id: string | null; // NULL only for super_admin
  status: AccountStatus;
  created_at: string;
}

// ------------------------------------------------------------------
// 1. Schools
// ------------------------------------------------------------------
export interface School {
  id: string;
  school_name: string;
  school_motto: string | null;
  school_logo: string | null; // Storage URL
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  subscription_plan: string | null;
  subscription_status: SubscriptionStatus;
  subscription_expiry: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------
// 2. School Admins
// ------------------------------------------------------------------
export interface SchoolAdmin {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  auth_user_id: string;
  status: AccountStatus;
  created_at: string;
}

// ------------------------------------------------------------------
// 3. Teachers
// ------------------------------------------------------------------
export interface Teacher {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  generated_password: string | null; // Temporary — cleared after first login
  must_change_password: boolean;
  auth_user_id: string;
  status: AccountStatus;
  created_at: string;
}

// ------------------------------------------------------------------
// 4. Students
// ------------------------------------------------------------------
export interface Student {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  date_of_birth: string | null;
  gender: "male" | "female" | null;
  current_class_id: string;
  generated_password: string | null; // Temporary — cleared after first login
  must_change_password: boolean;
  auth_user_id: string;
  status: AccountStatus;
  created_at: string;
}

// ------------------------------------------------------------------
// 5. Academic Sessions
// ------------------------------------------------------------------
export interface AcademicSession {
  id: string;
  school_id: string;
  session_name: string; // e.g. "2026/2027"
  is_active: boolean; // Partial unique index enforces one per school
  created_at: string;
}

// ------------------------------------------------------------------
// 6. Terms
// ------------------------------------------------------------------
export interface Term {
  id: string;
  school_id: string;
  session_id: string;
  term_name: TermName;
  next_term_begins: string | null;
  is_active: boolean; // Partial unique index enforces one per school
}

// ------------------------------------------------------------------
// 7. Classes
// ------------------------------------------------------------------
export interface Class {
  id: string;
  school_id: string;
  class_name: string;
  display_order: number;
  status: AccountStatus;
}

// ------------------------------------------------------------------
// 8. Teacher–Class Assignment
// ------------------------------------------------------------------
export interface TeacherClassAssignment {
  id: string;
  school_id: string;
  teacher_id: string;
  class_id: string;
  can_publish: boolean; // Default false — controls publish permission
}

// ------------------------------------------------------------------
// 9. Subjects
// ------------------------------------------------------------------
export interface Subject {
  id: string;
  school_id: string;
  subject_name: string;
  status: AccountStatus;
}

// ------------------------------------------------------------------
// 10. Subject–Class Assignment
// ------------------------------------------------------------------
export interface SubjectClassAssignment {
  id: string;
  school_id: string;
  subject_id: string;
  class_id: string;
}

// ------------------------------------------------------------------
// 11. Teacher Subject Assignment
// ------------------------------------------------------------------
export interface TeacherSubjectAssignment {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string;
  class_id: string;
}

// ------------------------------------------------------------------
// 12. Assessment Components
// ------------------------------------------------------------------
export interface AssessmentComponent {
  id: string;
  school_id: string;
  name: string; // e.g. "Test", "Exam"
  maximum_score: number;
  display_order: number;
}

// ------------------------------------------------------------------
// 13. Grading Scale
// ------------------------------------------------------------------
export interface GradingScale {
  id: string;
  school_id: string;
  class_id: string | null; // Nullable — allows per-class override
  grade: string; // e.g. "A", "B"
  minimum_score: number;
  maximum_score: number;
  remark: string; // e.g. "Excellent"
}

// ------------------------------------------------------------------
// 14. Psychomotor Definitions
// ------------------------------------------------------------------
export interface PsychomotorDefinition {
  id: string;
  school_id: string;
  name: string;
  display_order: number;
}

// ------------------------------------------------------------------
// 15. Affective Domain Definitions
// ------------------------------------------------------------------
export interface AffectiveDefinition {
  id: string;
  school_id: string;
  name: string;
  display_order: number;
}

// ------------------------------------------------------------------
// 16. Student Scores (raw, compute-on-read)
// ------------------------------------------------------------------
export interface StudentScore {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  assessment_component_id: string;
  teacher_id: string;
  session_id: string;
  term_id: string;
  score: number;
}

// ------------------------------------------------------------------
// 17. Attendance
// ------------------------------------------------------------------
export interface Attendance {
  id: string;
  school_id: string;
  student_id: string;
  session_id: string;
  term_id: string;
  days_school_opened: number;
  days_present: number;
  days_absent: number;
}

// ------------------------------------------------------------------
// 18. Psychomotor Scores
// ------------------------------------------------------------------
export interface PsychomotorScore {
  id: string;
  school_id: string;
  student_id: string;
  trait_id: string;
  session_id: string;
  term_id: string;
  score: number;
}

// ------------------------------------------------------------------
// 19. Affective Scores
// ------------------------------------------------------------------
export interface AffectiveScore {
  id: string;
  school_id: string;
  student_id: string;
  trait_id: string;
  session_id: string;
  term_id: string;
  score: number;
}

// ------------------------------------------------------------------
// 20. Teacher Comments
// ------------------------------------------------------------------
export interface TeacherComment {
  id: string;
  school_id: string;
  student_id: string;
  teacher_id: string;
  session_id: string;
  term_id: string;
  comment: string;
}

// ------------------------------------------------------------------
// 21. School Admin Comments
// ------------------------------------------------------------------
export interface SchoolAdminComment {
  id: string;
  school_id: string;
  student_id: string;
  school_admin_id: string;
  session_id: string;
  term_id: string;
  comment: string;
}

// ------------------------------------------------------------------
// 22. term_results — Published Snapshot (Section 3.4, Stage 2)
// ------------------------------------------------------------------
export interface TermResult {
  id: string;
  school_id: string;
  student_id: string;
  session_id: string;
  term_id: string;
  subject_id: string;
  total_score: number; // Frozen at moment of publishing
  grade: string; // Frozen at moment of publishing
  remark: string; // Frozen at moment of publishing
  last_edited_at: string | null;
}

// ------------------------------------------------------------------
// 23. Published Results
// ------------------------------------------------------------------
export interface PublishedResult {
  id: string;
  school_id: string;
  student_id: string;
  session_id: string;
  term_id: string;
  published: boolean;
  published_by: string; // teacher_id or school_admin_id
  published_at: string;
}

// ------------------------------------------------------------------
// Super Admin — Subscriptions
// ------------------------------------------------------------------
export interface Subscription {
  id: string;
  school_id: string;
  plan: string;
  start_date: string;
  expiry_date: string;
  payment_status: string;
  amount: number;
}

// ------------------------------------------------------------------
// Super Admin — Support Logs
// ------------------------------------------------------------------
export interface SupportLog {
  id: string;
  school_id: string;
  super_admin_id: string;
  action: string;
  created_at: string;
}

// ------------------------------------------------------------------
// Result Edit Log (audit trail for post-publish edits)
// ------------------------------------------------------------------
export interface ResultEditLog {
  id: string;
  student_id: string;
  term_id: string;
  subject_id: string;
  edited_by: string;
  edited_at: string;
  previous_grade: string;
  new_grade: string;
  previous_total: number;
  new_total: number;
}
