-- ============================================================================
-- SchoolAid — Migration 079: Manual Promotion & Graduation
-- ============================================================================
-- ADDITIVE ONLY. Nothing is dropped, renamed, or rewritten.
--
-- WHAT THIS ADDS
--   1. promotion_mappings      — the administrator's saved class→class mapping
--                                (or class→“Graduate”) configuration.
--   2. promotion_runs          — one row per executed promotion exercise.
--   3. promotion_run_items     — the frozen per-student plan and its outcome.
--   4. students.graduation_*   — graduation year/class/date, alongside the
--                                existing `students.status = 'graduated'`.
--
-- WHY A SEPARATE CONFIGURATION TABLE
--   The existing `classes.grade_level` is free text and classes are ordered by
--   `grade_level` then `name`; that is not a progression model and must never be
--   used to infer a destination. The destination is an explicit administrator
--   decision, so it is stored here.
--
-- IDEMPOTENCY / DOUBLE-PROMOTION SAFETY
--   `promotion_runs.idempotency_key` is derived by the server from
--   (school, target term, sorted mappings). A completed run with the same key is
--   returned instead of executed again. Independently, every `promotion_run_item`
--   records the student's frozen `from_class_id`, and execution only applies an
--   item while the student is STILL in that class — so a retry can never promote
--   the same student twice.
--
-- HISTORY
--   Promotion updates `students.class_id` in place and inserts an `enrollments`
--   row for the target term; it never rewrites scores, report cards, attendance
--   or finance rows. Graduation sets `students.status = 'graduated'`, records the
--   graduation class name as a snapshot, and deactivates the profile (the
--   existing 078 trigger mirrors that into `students.is_active`). No row is
--   deleted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Promotion configuration (source class → destination class | graduate)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_mappings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source_class_id       UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  destination_class_id  UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  action                TEXT NOT NULL DEFAULT 'promote'
                        CHECK (action IN ('promote', 'graduate')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One decision per source class: no duplicate / ambiguous mappings.
  CONSTRAINT promotion_mappings_school_source_unique
    UNIQUE (school_id, source_class_id),

  -- A promotion needs a different destination; graduation needs none.
  -- The destination ≠ source rule is enforced here, not just in the UI.
  CONSTRAINT promotion_mappings_action_shape CHECK (
    (action = 'promote'
      AND destination_class_id IS NOT NULL
      AND destination_class_id <> source_class_id)
    OR
    (action = 'graduate'
      AND destination_class_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_promotion_mappings_school
  ON public.promotion_mappings (school_id);

-- ----------------------------------------------------------------------------
-- 2. Executed promotion runs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  target_term_id     UUID REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'running'
                     CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  idempotency_key    TEXT,
  total_students     INTEGER NOT NULL DEFAULT 0,
  promoted_count     INTEGER NOT NULL DEFAULT 0,
  graduated_count    INTEGER NOT NULL DEFAULT 0,
  skipped_count      INTEGER NOT NULL DEFAULT 0,
  failed_count       INTEGER NOT NULL DEFAULT 0,
  summary            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

-- A completed run for the same configuration/target term is never executed twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_runs_idempotency
  ON public.promotion_runs (school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promotion_runs_school_created
  ON public.promotion_runs (school_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Frozen per-student plan + outcome
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_run_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID NOT NULL REFERENCES public.promotion_runs(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_class_id  UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  to_class_id    UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  action         TEXT NOT NULL CHECK (action IN ('promote', 'graduate')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A student appears at most once in a run.
  UNIQUE (run_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_run_items_run
  ON public.promotion_run_items (run_id, status);

-- ----------------------------------------------------------------------------
-- 4. Graduation facts on the student record
--    `students.status` already allows 'graduated' (migrations 017/018).
-- ----------------------------------------------------------------------------
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS graduation_year INTEGER;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS graduation_class_id UUID
  REFERENCES public.classes(id) ON DELETE SET NULL;

-- Snapshot of the class name at graduation time, so history survives later
-- class renames or deletions.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS graduation_class_name TEXT;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_students_school_status
  ON public.students (school_id, status);

CREATE INDEX IF NOT EXISTS idx_students_graduation_year
  ON public.students (school_id, graduation_year);

-- ----------------------------------------------------------------------------
-- 5. Access posture
--    The application reads/writes these through the service-role client (which
--    bypasses RLS). RLS is enabled as defence in depth: tenant SELECT is scoped
--    to the JWT's school claim (or super admin); no write policies exist, so a
--    tenant token can never forge a promotion run.
-- ----------------------------------------------------------------------------
ALTER TABLE public.promotion_mappings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_run_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_mappings_tenant_read ON public.promotion_mappings;
CREATE POLICY promotion_mappings_tenant_read ON public.promotion_mappings
  FOR SELECT USING (
    (school_id = ((auth.jwt() ->> 'school_id')::uuid))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS promotion_runs_tenant_read ON public.promotion_runs;
CREATE POLICY promotion_runs_tenant_read ON public.promotion_runs
  FOR SELECT USING (
    (school_id = ((auth.jwt() ->> 'school_id')::uuid))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS promotion_run_items_tenant_read ON public.promotion_run_items;
CREATE POLICY promotion_run_items_tenant_read ON public.promotion_run_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.promotion_runs r
      WHERE r.id = promotion_run_items.run_id
        AND (
          (r.school_id = ((auth.jwt() ->> 'school_id')::uuid))
          OR is_super_admin()
        )
    )
  );

GRANT SELECT ON public.promotion_mappings  TO authenticated;
GRANT SELECT ON public.promotion_runs      TO authenticated;
GRANT SELECT ON public.promotion_run_items TO authenticated;

GRANT ALL ON public.promotion_mappings  TO service_role;
GRANT ALL ON public.promotion_runs      TO service_role;
GRANT ALL ON public.promotion_run_items TO service_role;

-- ============================================================================
-- END 079
-- ============================================================================
