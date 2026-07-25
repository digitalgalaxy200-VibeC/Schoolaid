-- Migration: Preserve historical subject names in term_results
-- 1. Add snapshot columns
ALTER TABLE term_results ADD COLUMN IF NOT EXISTS subject_name TEXT;
ALTER TABLE term_results ADD COLUMN IF NOT EXISTS subject_code TEXT;

-- 2. Backfill existing records from current subjects table
UPDATE term_results tr
SET subject_name = s.name, subject_code = s.code
FROM subjects s
WHERE tr.subject_id = s.id AND tr.subject_name IS NULL;

-- 3. Drop the CASCADE constraint and recreate without it
ALTER TABLE term_results DROP CONSTRAINT IF EXISTS term_results_subject_id_fkey;
ALTER TABLE term_results ADD CONSTRAINT term_results_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_term_results_subject ON term_results(subject_id);
