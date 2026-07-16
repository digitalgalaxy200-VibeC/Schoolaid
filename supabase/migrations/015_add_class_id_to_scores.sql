-- ============================================================================
-- SchoolAid — Migration 015: Add class_id to student_scores
-- Enables fast, direct filtering of scores by class without a student ID join.
-- ============================================================================

-- 1. Add the class_id column (nullable so existing rows aren't broken)
ALTER TABLE student_scores
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- 2. Backfill existing scores with the student's current class
--    (joins student_scores → students to get class_id)
UPDATE student_scores ss
SET class_id = s.class_id
FROM students s
WHERE ss.student_id = s.id
  AND ss.class_id IS NULL
  AND s.class_id IS NOT NULL;

-- 3. Performance index — the key query is school + term + class + subject
CREATE INDEX IF NOT EXISTS idx_student_scores_class
  ON student_scores(school_id, term_id, class_id, subject_id);

-- Done. class_id is now populated for all existing records.
