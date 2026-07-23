-- ============================================================================
-- SchoolAid — Migration 018: class_id on term_results
-- Lets the student-facing gate check which CLASS's report-card submission
-- was approved, independent of the student's current class_id (avoids a
-- false-negative if the student is later promoted to a new class).
-- ============================================================================

ALTER TABLE term_results ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_term_results_class_term ON term_results(class_id, term_id);
