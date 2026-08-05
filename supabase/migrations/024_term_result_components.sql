-- ============================================================================
-- SchoolAid — Migration 024: term_result_components
-- Snapshot of individual assessment component scores per student per term.
-- Used by the report card to display CA1, CA2, Exam breakdown.
-- Created because the table was referenced in code but never migrated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.term_result_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id         UUID NOT NULL REFERENCES public.academic_terms(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  component_id    UUID NOT NULL,
  component_name  TEXT NOT NULL,
  component_order INT  NOT NULL DEFAULT 0,
  max_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one snapshot row per student/term/subject/component
  UNIQUE (student_id, term_id, subject_id, component_id)
);

-- Indexes for fast look-up
CREATE INDEX IF NOT EXISTS idx_trc_student  ON public.term_result_components (student_id);
CREATE INDEX IF NOT EXISTS idx_trc_term     ON public.term_result_components (term_id);
CREATE INDEX IF NOT EXISTS idx_trc_school   ON public.term_result_components (school_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_trc_updated_at ON public.term_result_components;
CREATE TRIGGER update_trc_updated_at
  BEFORE UPDATE ON public.term_result_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.term_result_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trc_select ON public.term_result_components;
CREATE POLICY trc_select ON public.term_result_components
  FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_insert ON public.term_result_components;
CREATE POLICY trc_insert ON public.term_result_components
  FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_update ON public.term_result_components;
CREATE POLICY trc_update ON public.term_result_components
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_delete ON public.term_result_components;
CREATE POLICY trc_delete ON public.term_result_components
  FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- Permissions
GRANT ALL ON public.term_result_components TO anon, authenticated, service_role;
