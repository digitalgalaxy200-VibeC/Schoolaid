-- ============================================================================
-- SchoolAid — Migration 019: Academic Levels & Template Inheritance
-- ============================================================================

-- 1. Academic Levels
CREATE TABLE IF NOT EXISTS academic_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name)
);

-- 2. Level → Template junction tables
CREATE TABLE IF NOT EXISTS level_components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

-- 3. Add academic_level_id to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academic_level_id UUID REFERENCES academic_levels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(academic_level_id);

-- 4. Grants
GRANT ALL ON academic_levels TO anon, authenticated, service_role;
GRANT ALL ON level_components_templates TO anon, authenticated, service_role;
GRANT ALL ON level_grading_templates TO anon, authenticated, service_role;
GRANT ALL ON level_psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON level_affective_templates TO anon, authenticated, service_role;
