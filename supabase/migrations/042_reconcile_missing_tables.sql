-- ============================================================================
-- 042 — Reconcile tables referenced by application code but absent from the schema
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Two tables are referenced by application code but exist in NO migration and
-- in NO environment (verified against live staging, 2026-09-18):
--
--   report_card_settings — 3 routes query it; was a latent runtime error
--   rate_limits          — login throttling silently fell back to per-instance
--                          memory, so brute-force protection did not work at all
--
-- NOT created here, deliberately:
--   assessment_scores          — duplicate of the canonical student_scores;
--                                the caller is fixed to use student_scores
--   subject_class_assignments  — duplicate of class_subjects; caller fixed
--   users                      — duplicate of profiles; dead branch removed
--
-- RLS follows the existing platform convention:
--   (school_id = (auth.jwt() ->> 'school_id')::uuid) OR is_super_admin()
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. report_card_settings — per-school report card display configuration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_card_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,

  show_position         BOOLEAN NOT NULL DEFAULT TRUE,
  show_average          BOOLEAN NOT NULL DEFAULT TRUE,
  show_attendance       BOOLEAN NOT NULL DEFAULT TRUE,
  show_psychomotor      BOOLEAN NOT NULL DEFAULT TRUE,
  show_affective        BOOLEAN NOT NULL DEFAULT TRUE,
  show_teacher_remark   BOOLEAN NOT NULL DEFAULT TRUE,
  show_admin_remark     BOOLEAN NOT NULL DEFAULT TRUE,
  show_grading_key      BOOLEAN NOT NULL DEFAULT TRUE,
  show_photo            BOOLEAN NOT NULL DEFAULT TRUE,
  show_gender           BOOLEAN NOT NULL DEFAULT TRUE,
  show_dob              BOOLEAN NOT NULL DEFAULT TRUE,
  show_component_scores BOOLEAN NOT NULL DEFAULT TRUE,

  updated_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.report_card_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_report_card_settings ON public.report_card_settings;
CREATE POLICY tenant_select_report_card_settings ON public.report_card_settings
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_report_card_settings ON public.report_card_settings;
CREATE POLICY tenant_insert_report_card_settings ON public.report_card_settings
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_report_card_settings ON public.report_card_settings;
CREATE POLICY tenant_update_report_card_settings ON public.report_card_settings
  FOR UPDATE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin())
  WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_report_card_settings ON public.report_card_settings;
CREATE POLICY tenant_delete_report_card_settings ON public.report_card_settings
  FOR DELETE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());


-- ----------------------------------------------------------------------------
-- 2. rate_limits — shared throttling state
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip         TEXT NOT NULL UNIQUE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: this table is intentionally NOT tenant-scoped, so it carries no
-- school_id and no RLS policies. It is written only by the SECURITY DEFINER
-- function below, which is executable by service_role only.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limits_expires_at ON public.rate_limits (expires_at);


-- ----------------------------------------------------------------------------
-- 3. bump_rate_limit() — atomic increment-and-check
-- ----------------------------------------------------------------------------
-- Replaces the previous read-modify-write in application code, which raced
-- under concurrent requests and had to fall back to in-memory state (useless
-- on serverless, where every instance has its own memory).
--
-- Returns TRUE when the caller is still within the limit.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_rate_limit(
  p_ip        TEXT,
  p_limit     INTEGER,
  p_window_ms INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now      TIMESTAMPTZ := NOW();
  v_attempts INTEGER;
BEGIN
  INSERT INTO public.rate_limits (ip, attempts, expires_at, updated_at)
  VALUES (p_ip, 1, v_now + (p_window_ms * INTERVAL '1 millisecond'), v_now)
  ON CONFLICT (ip) DO UPDATE
    SET attempts = CASE
                     WHEN public.rate_limits.expires_at <= v_now THEN 1
                     ELSE public.rate_limits.attempts + 1
                   END,
        expires_at = CASE
                       WHEN public.rate_limits.expires_at <= v_now
                         THEN v_now + (p_window_ms * INTERVAL '1 millisecond')
                       ELSE public.rate_limits.expires_at
                     END,
        updated_at = v_now
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
