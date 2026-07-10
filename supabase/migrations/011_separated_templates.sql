-- ============================================================================
-- SchoolAid — Migration 011: Separated Assessment Templates
-- Drops unified master template and creates 4 independent template systems.
-- ============================================================================

-- 1. Drop old unified score tables
DROP TABLE IF EXISTS student_scores CASCADE;
DROP TABLE IF EXISTS psychomotor_scores CASCADE;
DROP TABLE IF EXISTS affective_scores CASCADE;

-- 2. Drop old unified config tables (from Migration 010)
DROP TABLE IF EXISTS class_assessment_templates CASCADE;
DROP TABLE IF EXISTS template_components CASCADE;
DROP TABLE IF EXISTS template_grading_scales CASCADE;
DROP TABLE IF EXISTS template_psychomotor_traits CASCADE;
DROP TABLE IF EXISTS template_affective_traits CASCADE;
DROP TABLE IF EXISTS assessment_templates CASCADE;

-- ============================================================================
-- SYSTEM 1: COMPONENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS components_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ============================================================================
-- SYSTEM 2: GRADING SCALES
-- ============================================================================
CREATE TABLE IF NOT EXISTS grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS grading_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT
);

-- ============================================================================
-- SYSTEM 3: PSYCHOMOTOR TRAITS
-- ============================================================================
CREATE TABLE IF NOT EXISTS psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS psychomotor_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ============================================================================
-- SYSTEM 4: AFFECTIVE TRAITS
-- ============================================================================
CREATE TABLE IF NOT EXISTS affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS affective_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ============================================================================
-- RECREATE SCORE TABLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES components_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, component_id, term_id)
);

CREATE TABLE IF NOT EXISTS psychomotor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES psychomotor_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES affective_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- ============================================================================
-- RLS & GRANTS
-- ============================================================================
GRANT ALL ON components_templates TO anon, authenticated, service_role;
GRANT ALL ON class_components_templates TO anon, authenticated, service_role;
GRANT ALL ON components_rows TO anon, authenticated, service_role;

GRANT ALL ON grading_templates TO anon, authenticated, service_role;
GRANT ALL ON class_grading_templates TO anon, authenticated, service_role;
GRANT ALL ON grading_rows TO anon, authenticated, service_role;

GRANT ALL ON psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON class_psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_rows TO anon, authenticated, service_role;

GRANT ALL ON affective_templates TO anon, authenticated, service_role;
GRANT ALL ON class_affective_templates TO anon, authenticated, service_role;
GRANT ALL ON affective_rows TO anon, authenticated, service_role;

GRANT ALL ON student_scores TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_scores TO anon, authenticated, service_role;
GRANT ALL ON affective_scores TO anon, authenticated, service_role;
