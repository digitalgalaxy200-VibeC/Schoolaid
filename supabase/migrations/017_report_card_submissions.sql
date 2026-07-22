-- ============================================================================
-- SchoolAid — Migration 017: Report Card Submission Workflow + Audit Trail
-- ============================================================================

-- 1. Per-class, per-term submission state
CREATE TABLE IF NOT EXISTS report_card_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'returned')),
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, term_id)
);

-- 2. Audit trail for report card preparation
CREATE TABLE IF NOT EXISTS report_card_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'save_attendance' | 'save_traits' | 'save_remark' | 'submit'
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_rcs_class_term ON report_card_submissions(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_rcs_school ON report_card_submissions(school_id);
CREATE INDEX IF NOT EXISTS idx_rcal_class_term ON report_card_audit_logs(class_id, term_id);

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS update_rcs_updated_at ON report_card_submissions;
CREATE TRIGGER update_rcs_updated_at
  BEFORE UPDATE ON report_card_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS (service_role bypasses; policies mirror class_subjects pattern)
ALTER TABLE report_card_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON report_card_submissions TO anon, authenticated, service_role;
GRANT ALL ON report_card_audit_logs TO anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_all_rcs ON report_card_submissions;
CREATE POLICY tenant_all_rcs ON report_card_submissions
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_all_rcal ON report_card_audit_logs;
CREATE POLICY tenant_all_rcal ON report_card_audit_logs
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
