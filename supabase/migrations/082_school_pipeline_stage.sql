-- 082_school_pipeline_stage.sql
--
-- WHY
-- ---
-- The seven-step partnership (apply → assess → discovery → proposal → setup &
-- migration → training & go-live → continuous improvement) was only in people's
-- heads and in the marketing page. The super-admin dashboard could not show where
-- a school actually was, so it fell back to guessing from staff/student counts.
--
-- This adds the stage itself, plus who owns it and when it last moved. Stage is
-- NULLABLE on purpose: "not set" is a real, honest state, and the dashboard shows
-- it as such rather than inventing a default for schools nobody has triaged.
--
-- FORWARD-ONLY and additive: no existing column is altered or dropped.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS pipeline_stage_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_owner text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_pipeline_stage_check'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_pipeline_stage_check
      CHECK (
        pipeline_stage IS NULL
        OR pipeline_stage IN (
          'applied',
          'assessed',
          'discovery',
          'proposal',
          'setup',
          'training',
          'live',
          'first_term'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_schools_pipeline_stage
  ON public.schools (pipeline_stage);

-- CONSERVATIVE BACKFILL. Only schools that already have staff or students are
-- marked 'live': that is a fact the database can prove. Everything else stays
-- NULL ("not set") so a human triages it, rather than the migration guessing.
UPDATE public.schools s
SET pipeline_stage = 'live',
    pipeline_stage_changed_at = now()
WHERE s.pipeline_stage IS NULL
  AND s.is_archived = false
  AND (
    EXISTS (SELECT 1 FROM public.students st WHERE st.school_id = s.id)
    OR EXISTS (SELECT 1 FROM public.teachers t WHERE t.school_id = s.id)
  );

COMMENT ON COLUMN public.schools.pipeline_stage IS
  'Partnership stage: applied | assessed | discovery | proposal | setup | training | live | first_term. NULL = not yet triaged.';
