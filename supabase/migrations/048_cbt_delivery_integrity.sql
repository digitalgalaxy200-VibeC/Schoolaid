-- ============================================================================
-- 048 — CBT delivery and result integrity (Phases 18-19)
-- ============================================================================
-- Forward-only and additive. No new table, no dropped column, and no change to
-- any existing referential action.
--
-- Two invariants the delivery engine relies on are, at present, only enforced by
-- application code. Application code has bugs; the point of putting these in the
-- schema is that the failure mode stops being "a student got two live attempts"
-- or "a student has two official scores" and becomes "the write was rejected".
--
--
-- INVARIANT 1 — ONE LIVE ATTEMPT PER STUDENT PER ASSESSMENT
--
-- `cbt_attempts` is unique on (assessment_id, student_id, attempt_number), which
-- stops a number being reused but says nothing about STATE. Nothing prevented two
-- rows both being `in_progress` under different attempt numbers. A student
-- holding two open papers could answer both in parallel, and the engine had only
-- a server-side check (`decideStartAttempt`) standing between them and that.
--
-- INVARIANT 2 — ONE OFFICIAL RESULT PER STUDENT PER ASSESSMENT
--
-- PD-4 makes "official attempt" a property of a result (`cbt_results.is_official`),
-- but nothing limited how many results for one student could carry it. Two
-- `is_official` rows for the same student on the same assessment would make the
-- report-card push ambiguous — and `loadOfficialResults` would return both,
-- with whichever arrived last winning. Silent and unreproducible.
--
-- A partial unique index cannot span a join, and `cbt_results` did not record
-- which assessment or student a result belonged to (it reached them through
-- `attempt_id`). Those two columns are therefore added here, denormalised on
-- purpose and kept honest by composite foreign keys, so the invariant can be
-- expressed as an index the database enforces for every role.
--
-- NOTE ON BACKFILL: `cbt_results` and `cbt_attempts` were both verified EMPTY
-- (0 rows) on staging immediately before this migration, so the indexes cannot
-- fail on existing data. The backfill statements below are nevertheless written
-- so the migration is correct on a database that does hold rows.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Denormalise the (assessment, student) identity of a result
-- ----------------------------------------------------------------------------
ALTER TABLE public.cbt_results ADD COLUMN IF NOT EXISTS assessment_id UUID;
ALTER TABLE public.cbt_results ADD COLUMN IF NOT EXISTS student_id    UUID;

-- Backfill from the owning attempt. Idempotent: only fills rows still missing it.
UPDATE public.cbt_results r
   SET assessment_id = a.assessment_id,
       student_id    = a.student_id
  FROM public.cbt_attempts a
 WHERE a.id = r.attempt_id
   AND (r.assessment_id IS NULL OR r.student_id IS NULL);

-- Unique keys so the composite keys below have something to reference. `id` is
-- already the primary key, so (id, school_id) cannot fail on existing rows.
DO $$
DECLARE
  t TEXT;
  cname TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cbt_results']
  LOOP
    cname := t || '_id_school_id_key';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = cname AND conrelid = format('public.%I', t)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (id, school_id)', t, cname);
    END IF;
  END LOOP;
END $$;

-- Same idea as migration 047: a result can never point at another school's
-- assessment or student, for every role including the service role.
DO $$
DECLARE
  spec RECORD;
  cname TEXT;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('cbt_results', 'assessment_id', 'cbt_assessments'),
      ('cbt_results', 'student_id',    'students')
    ) AS v(child, col, parent)
  LOOP
    cname := spec.child || '_' || spec.col || '_school_fkey';

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = cname AND conrelid = format('public.%I', spec.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        'FOREIGN KEY (%I, school_id) REFERENCES public.%I (id, school_id)',
        spec.child, cname, spec.col, spec.parent);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 2. The two invariants
-- ----------------------------------------------------------------------------
-- Guarded by a partial predicate rather than by a trigger: a rejected INSERT is
-- a clearer failure than a trigger that silently rewrites the row, and the
-- engine already computes attempt numbers itself.

-- At most one live attempt per (assessment, student).
CREATE UNIQUE INDEX IF NOT EXISTS cbt_one_live_attempt_per_student
  ON public.cbt_attempts (assessment_id, student_id)
  WHERE status = 'in_progress';

-- At most one official result per (assessment, student). Rows predating the
-- denormalised columns are excluded rather than guessed at.
CREATE UNIQUE INDEX IF NOT EXISTS cbt_one_official_result_per_student
  ON public.cbt_results (assessment_id, student_id)
  WHERE is_official AND assessment_id IS NOT NULL AND student_id IS NOT NULL;

-- Supports "give me this student's attempts on this assessment", which the
-- delivery engine runs on every start and resume.
CREATE INDEX IF NOT EXISTS idx_cbt_results_attempt_lookup
  ON public.cbt_results (school_id, assessment_id, is_official);
