-- ============================================================================
-- SchoolAid — Migration 057: add teachers.designation
-- ============================================================================
-- The app has used teachers.designation ("class_teacher" | "subject_teacher")
-- since the teacher profile work, but no migration ever defined it, so built
-- environments drifted. PostgREST rejects inserts that reference a missing
-- column (PGRST204: "Could not find the 'designation' column of 'teachers'"),
-- which made every "Add Teacher" fail with a 500.
--
-- Safe and idempotent: no-op where the column already exists.

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS designation TEXT DEFAULT 'subject_teacher';

UPDATE public.teachers
   SET designation = 'subject_teacher'
 WHERE designation IS NULL;
