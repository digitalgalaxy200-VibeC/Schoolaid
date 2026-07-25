-- Migration 012: Report Card Template System (MVP)
-- Super Admin manages templates. Schools assign per grade_level.

-- 1. Report card templates (Super Admin managed)
CREATE TABLE IF NOT EXISTS report_card_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  page_size     TEXT NOT NULL DEFAULT 'A4',
  orientation   TEXT NOT NULL DEFAULT 'portrait',
  colors        JSONB DEFAULT '{"primary":"#2A4B8D","accent":"#F0A63A","text":"#16202E"}',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version       INT NOT NULL DEFAULT 1,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Sections within a template
CREATE TABLE IF NOT EXISTS report_card_template_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,  -- 'header','student_info','attendance','academic', etc.
  label         TEXT NOT NULL,  -- Default display label
  display_order INT NOT NULL DEFAULT 0,
  config        JSONB DEFAULT '{}',
  is_enabled    BOOLEAN DEFAULT true,
  UNIQUE(template_id, section_key)
);

-- 3. Immutable snapshots on publish
CREATE TABLE IF NOT EXISTS report_card_template_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  version       INT NOT NULL,
  frozen_config JSONB NOT NULL,  -- Full template + sections at publish time
  published_by  UUID REFERENCES profiles(id),
  published_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. School assigns template per grade_level
CREATE TABLE IF NOT EXISTS school_template_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  grade_level   TEXT NOT NULL,  -- Matches classes.grade_level
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  assigned_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, grade_level)
);

-- 5. Per-school section toggles + renames
CREATE TABLE IF NOT EXISTS school_template_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  section_key   TEXT NOT NULL,
  is_enabled    BOOLEAN DEFAULT true,
  custom_label  TEXT,
  UNIQUE(school_id, template_id, section_key)
);

-- Add template snapshot reference to term_results for historical integrity
ALTER TABLE term_results 
ADD COLUMN IF NOT EXISTS template_snapshot_id UUID REFERENCES report_card_template_versions(id);

-- RLS: Super Admin full access to templates
ALTER TABLE report_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_template_versions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published templates
CREATE POLICY "Anyone can read published templates" ON report_card_templates
  FOR SELECT USING (status = 'published');

-- Super Admin full access
CREATE POLICY "Super admin full access templates" ON report_card_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Super admin full access sections" ON report_card_template_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Anyone can read template sections" ON report_card_template_sections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM report_card_templates t WHERE t.id = template_id AND t.status = 'published')
  );

-- School template assignments: school admin manages, anyone reads
ALTER TABLE school_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_template_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admin manages own assignments" ON school_template_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

CREATE POLICY "Anyone can read assignments" ON school_template_assignments FOR SELECT USING (true);

CREATE POLICY "School admin manages own configs" ON school_template_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

CREATE POLICY "Anyone can read configs" ON school_template_configs FOR SELECT USING (true);
