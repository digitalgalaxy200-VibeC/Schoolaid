-- ============================================================================
-- SchoolAid — Migration 016: Fix student_scores Unique Constraint
-- Adds subject_id to the unique constraint so per-subject scores can be stored.
-- Previously the constraint was (student_id, component_id, term_id) which
-- prevented storing the same component (e.g. CA1) for different subjects.
-- Now allows (student_id, component_id, term_id, subject_id).
-- ============================================================================

-- 1. Drop the old constraint (student_id + component_id + term_id only)
ALTER TABLE student_scores 
  DROP CONSTRAINT IF EXISTS student_scores_student_id_component_id_term_id_key;

-- 2. Create the new constraint (includes subject_id)
ALTER TABLE student_scores 
  ADD UNIQUE(student_id, component_id, term_id, subject_id);
