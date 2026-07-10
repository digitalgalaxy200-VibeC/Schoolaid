-- ============================================================================
-- SchoolAid — Migration 010: Master Assessment Templates
-- Replaces individual config tables with unified Assessment Templates.
-- WARNING: Drops old assessment tables and scores to start fresh.
-- ============================================================================

-- 1. Drop old score tables first (to avoid constraint errors)
DROP TABLE IF EXISTS student_scores CASCADE;
DROP TABLE IF EXISTS psychomotor_scores CASCADE;
DROP TABLE IF EXISTS affective_scores CASCADE;

-- 2. Drop old config tables
DROP TABLE IF EXISTS assessment_components CASCADE;
DROP TABLE IF EXISTS grading_scales CASCADE;
DROP TABLE IF EXISTS psychomotor_definitions CASCADE;
DROP TABLE IF EXISTS affective_definitions CASCADE;

-- 3. Create Template Core Table
CREATE TABLE IF NOT EXISTS assessment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Template to Class junction (1 class can only have 1 active template)
CREATE TABLE IF NOT EXISTS class_assessment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

-- 5. Template Components (Tests/Exams)
CREATE TABLE IF NOT EXISTS template_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 6. Template Grading Scales (A, B, C...)
CREATE TABLE IF NOT EXISTS template_grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT
);

-- 7. Template Psychomotor Traits
CREATE TABLE IF NOT EXISTS template_psychomotor_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 8. Template Affective Traits
CREATE TABLE IF NOT EXISTS template_affective_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 9. Recreate Score Tables mapping to new templates
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES template_components(id) ON DELETE CASCADE,
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
  trait_id UUID NOT NULL REFERENCES template_psychomotor_traits(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES template_affective_traits(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- 10. Enable RLS
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_assessment_templates ENABLE ROW LEVEL SECURITY;

-- 11. Policies
CREATE POLICY tenant_select_templates ON assessment_templates FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_insert_templates ON assessment_templates FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_update_templates ON assessment_templates FOR UPDATE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_delete_templates ON assessment_templates FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

CREATE POLICY tenant_select_class_templates ON class_assessment_templates FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_insert_class_templates ON class_assessment_templates FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_delete_class_templates ON class_assessment_templates FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- For sub-tables, we bypass RLS mostly since they are manipulated along with the template via API (using service_role)
-- But we can add basic read access for authenticated users.
GRANT ALL ON assessment_templates TO anon, authenticated, service_role;
GRANT ALL ON class_assessment_templates TO anon, authenticated, service_role;
GRANT ALL ON template_components TO anon, authenticated, service_role;
GRANT ALL ON template_grading_scales TO anon, authenticated, service_role;
GRANT ALL ON template_psychomotor_traits TO anon, authenticated, service_role;
GRANT ALL ON template_affective_traits TO anon, authenticated, service_role;
GRANT ALL ON student_scores TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_scores TO anon, authenticated, service_role;
GRANT ALL ON affective_scores TO anon, authenticated, service_role;
