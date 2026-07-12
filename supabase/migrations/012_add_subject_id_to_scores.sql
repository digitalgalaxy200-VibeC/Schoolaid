-- Add subject_id to student_scores for per-subject score tracking
ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_student_scores_subject ON student_scores(subject_id);
