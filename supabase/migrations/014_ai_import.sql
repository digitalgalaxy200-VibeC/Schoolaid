-- Migration 014: AI Assessment Import Module
-- Feature flags, audit logs, import details

-- 1. Feature flags per school
CREATE TABLE IF NOT EXISTS school_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  enabled_by UUID REFERENCES profiles(id),
  enabled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, feature_key)
);

-- 2. AI import audit log
CREATE TABLE IF NOT EXISTS ai_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID REFERENCES subjects(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  images_processed INT DEFAULT 0,
  rows_extracted INT DEFAULT 0,
  rows_imported INT DEFAULT 0,
  rows_skipped INT DEFAULT 0,
  rows_needing_review INT DEFAULT 0,
  processing_duration_ms INT,
  confidence_avg DECIMAL(3,2),
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Per-cell audit detail
CREATE TABLE IF NOT EXISTS ai_import_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES ai_import_logs(id) ON DELETE CASCADE,
  student_name_raw TEXT,
  student_id UUID REFERENCES students(id),
  component_name_raw TEXT,
  component_id UUID REFERENCES components_rows(id),
  score_raw TEXT,
  score_parsed DECIMAL(10,2),
  confidence DECIMAL(3,2),
  match_status TEXT DEFAULT 'unmatched',
  action TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE school_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_import_details ENABLE ROW LEVEL SECURITY;
