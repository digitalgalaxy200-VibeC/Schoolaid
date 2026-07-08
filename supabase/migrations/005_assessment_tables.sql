-- Phase 4: Assessment Configuration Tables
-- Assessment Components (per school)
CREATE TABLE IF NOT EXISTS assessment_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grading Scale (school-wide or per-class override)
CREATE TABLE IF NOT EXISTS grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE, -- NULL = school-wide
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Psychomotor Trait Definitions
CREATE TABLE IF NOT EXISTS psychomotor_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affective Domain Definitions
CREATE TABLE IF NOT EXISTS affective_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add can_publish to teacher_subjects
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS can_publish BOOLEAN DEFAULT false;

-- Phase 5: Score Tables
-- Student Scores (raw scores per component)
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_component_id UUID NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, assessment_component_id, term_id)
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  days_school_opened INT DEFAULT 0,
  days_present INT DEFAULT 0,
  days_absent INT DEFAULT 0,
  UNIQUE(student_id, term_id)
);

-- Psychomotor Scores
CREATE TABLE IF NOT EXISTS psychomotor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES psychomotor_definitions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- Affective Scores
CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES affective_definitions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- Teacher Comments
CREATE TABLE IF NOT EXISTS teacher_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  comment TEXT,
  UNIQUE(student_id, term_id)
);

-- Phase 6: Publish & Snapshot
-- Term Results (frozen snapshot at publish time)
CREATE TABLE IF NOT EXISTS term_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  total_score DECIMAL(10,2) NOT NULL,
  grade TEXT NOT NULL,
  remark TEXT,
  published BOOLEAN DEFAULT false,
  published_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  last_edited_at TIMESTAMPTZ,
  UNIQUE(student_id, term_id, subject_id)
);

-- Result Edit Log (audit trail)
CREATE TABLE IF NOT EXISTS result_edit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ DEFAULT NOW(),
  previous_grade TEXT,
  new_grade TEXT,
  previous_total DECIMAL(10,2),
  new_total DECIMAL(10,2)
);

-- School Admin Comments
CREATE TABLE IF NOT EXISTS school_admin_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  comment TEXT,
  UNIQUE(student_id, term_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asmt_comp_school ON assessment_components(school_id);
CREATE INDEX IF NOT EXISTS idx_grading_school ON grading_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_student_scores_student ON student_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_scores_term ON student_scores(term_id);
CREATE INDEX IF NOT EXISTS idx_term_results_student ON term_results(student_id);
CREATE INDEX IF NOT EXISTS idx_term_results_published ON term_results(published);
