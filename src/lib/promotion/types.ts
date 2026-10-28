// ============================================================
// Promotion & Graduation — shared types
//
// Everything here is derived from the administrator's explicit
// class→class (or class→graduate) mappings. Nothing infers a
// destination from class names, sorting, or suffixes.
// ============================================================

export type PromotionAction = "promote" | "graduate";

export type PromotionRunStatus = "running" | "completed" | "partial" | "failed";

/** A class as the promotion screen sees it. */
export interface PromotionClass {
  id: string;
  name: string;
  student_count: number;
}

/** One administrator decision, as posted by the UI. */
export interface MappingInput {
  source_class_id: string;
  action: PromotionAction;
  /** Required for `promote`; must be null/absent for `graduate`. */
  destination_class_id?: string | null;
}

/** A persisted mapping row. */
export interface SavedMapping {
  id: string;
  source_class_id: string;
  destination_class_id: string | null;
  action: PromotionAction;
}

/** A student as loaded for planning. */
export interface StudentForPreview {
  id: string;
  admission_no: string | null;
  name: string;
  class_id: string | null;
  status: string;
  /** `profiles.is_active` — the canonical roster/archive flag. */
  is_active: boolean;
}

export interface PreviewStudent {
  id: string;
  name: string;
  admission_no: string | null;
}

export interface FlaggedStudent extends PreviewStudent {
  reason: string;
}

/** One source class in the preview. */
export interface PreviewGroup {
  source_class_id: string;
  source_class_name: string;
  action: PromotionAction;
  destination_class_id: string | null;
  destination_class_name: string | null;
  /** Students that will actually be processed. */
  students: PreviewStudent[];
  /** Students in the source class that require administrator attention. */
  flagged: FlaggedStudent[];
}

export interface PreviewTotals {
  total: number;
  promoted: number;
  graduated: number;
  flagged: number;
}

export interface PromotionPreview {
  groups: PreviewGroup[];
  totals: PreviewTotals;
  /** Classes with no saved mapping — shown so the admin can complete the setup. */
  unconfigured_classes: PromotionClass[];
  /** Students with no class, or a class that no longer exists. */
  unassigned: FlaggedStudent[];
  warnings: string[];
}

/** A frozen per-student item in an executed run. */
export interface RunItem {
  student_id: string;
  from_class_id: string | null;
  to_class_id: string | null;
  action: PromotionAction;
}

export interface PromotionError {
  student_id: string;
  name?: string;
  reason: string;
}

export interface PromotionRunSummary {
  run_id: string;
  status: PromotionRunStatus;
  target_term_id: string | null;
  total: number;
  promoted: number;
  graduated: number;
  skipped: number;
  failed: number;
  errors: PromotionError[];
  groups: {
    source_class_name: string;
    destination: string;
    action: PromotionAction;
    count: number;
  }[];
}

/** A graduated student as the Graduated section displays them. */
export interface GraduatedStudent {
  id: string;
  admission_no: string | null;
  name: string;
  graduation_year: number | null;
  graduation_class_name: string;
  graduated_at: string | null;
  status: string;
  email: string | null;
}
