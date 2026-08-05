-- Migration 020: Report Card Publishing & Retraction Workflow
-- Adds published/retracted statuses, publishing metadata, and retraction support

-- 1. Update status CHECK constraint to include published and retracted
ALTER TABLE report_card_submissions 
  DROP CONSTRAINT IF EXISTS report_card_submissions_status_check;

ALTER TABLE report_card_submissions 
  ADD CONSTRAINT report_card_submissions_status_check 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'published', 'retracted', 'returned'));

-- 2. Add publishing columns
ALTER TABLE report_card_submissions 
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. Add retraction columns
ALTER TABLE report_card_submissions 
  ADD COLUMN IF NOT EXISTS retracted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retraction_reason TEXT;

-- 4. Create bulk download tracking table
CREATE TABLE IF NOT EXISTS report_card_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  downloaded_by UUID NOT NULL REFERENCES profiles(id),
  student_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_card_downloads ENABLE ROW LEVEL SECURITY;
