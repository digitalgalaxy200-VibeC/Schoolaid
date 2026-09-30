-- ============================================================================
-- 045 — CBT schema foundation (Phase 14)
-- ============================================================================
-- Forward-only, purely additive. Creates the `cbt_*` namespace only; no
-- existing table, column or row is touched.
--
-- DESIGN RULES ENFORCED HERE
--
-- 1. NAMESPACE. `assessment`, `assessment_components` and `assessment_templates`
--    already mean *gradebook score columns*. CBT never reuses that vocabulary.
--
-- 2. TENANCY. Every table carries `school_id` directly, so tenancy policies need
--    no subqueries. The single deliberate exception is the student result
--    policy, which checks the owning attempt has been marked (a one-level EXISTS
--    on cbt_attempts, which itself has RLS, so no recursion).
--
-- 3. ATTEMPT SNAPSHOTS (PD-4). Editing a question must never change what a past
--    student saw. `cbt_attempt_questions` holds the frozen copy of the text,
--    options, correct-option identity and marks as presented at attempt start.
--
-- 4. STABLE OPTION IDENTITY (spec §8). Grading compares option UUIDs, never
--    display letters, so randomised option order cannot change the answer key.
--
-- 5. ANSWER KEYS ARE NOT STUDENT-READABLE. `is_correct` is deliberately NOT a
--    column on `cbt_question_options`; the key lives in its own table. Both are
--    staff-only at the RLS layer.
--
-- 6. RLS IS A MATRIX, NOT A BLANKET. Permissive policies OR together, so a
--    plain tenant SELECT on every table would hand students the question bank
--    and the answer keys. Each table therefore gets the narrowest policy that
--    actually works:
--
--      staff-only content   : staff role, same school
--      student-readable     : the student's OWN rows, or staff
--      assessments          : staff, or a student reading a PUBLISHED one
--      results              : staff, or the student's own MARKED attempt
--
-- 7. ATTEMPTS ARE APPEND-ONLY HISTORY (PD-4). attempt_number is unique per
--    (assessment, student); a later attempt never overwrites an earlier one.
--
-- 8. ALIGNMENT. A CBT assessment binds School -> Session -> Term -> Class ->
--    Subject -> Teacher, plus the report-card component it feeds (PD-1/PD-2).
--
-- ROLES. The tenant-scoped client mints its own token, so it carries an
-- application role in `app_role` — distinct from `role`, which PostgREST uses to
-- choose the database role.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Question bank
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbt_questions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id         UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  class_id           UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  academic_level_id  UUID REFERENCES public.academic_levels(id) ON DELETE SET NULL,
  topic              TEXT,
  question_type      TEXT NOT NULL CHECK (question_type IN ('mcq','true_false','theory')),
  question_text      TEXT NOT NULL,
  section            TEXT,
  marks              NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (marks > 0),
  difficulty         TEXT,
  explanation        TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','review','approved','archived')),
  ai_provenance      JSONB,
  metadata           JSONB,
  created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cbt_question_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  label         TEXT,                                  -- display only: A, B, C ...
  option_text   TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- Correct answers live here, never on the options table (rule 5).
CREATE TABLE IF NOT EXISTS public.cbt_question_answer_keys (
  question_id       UUID PRIMARY KEY REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  school_id         UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  correct_option_id UUID REFERENCES public.cbt_question_options(id) ON DELETE CASCADE,
  model_answer      TEXT,                              -- for 'theory'
  marking_rubric    TEXT
);

-- Media lives in the PRIVATE `assessment-media` bucket, referenced by path.
CREATE TABLE IF NOT EXISTS public.cbt_question_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id   UUID NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  content_type  TEXT,
  caption       TEXT,
  display_order INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ----------------------------------------------------------------------------
-- 2. Assessments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbt_assessments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id            UUID REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  term_id               UUID REFERENCES public.academic_terms(id) ON DELETE SET NULL,
  class_id              UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id            UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  teacher_id            UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  -- The report-card component this assessment feeds (PD-1).
  component_id          UUID,
  title                 TEXT NOT NULL,
  instructions          TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','review','published','archived')),
  max_attempts          INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  time_limit_minutes    INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
  official_attempt_rule TEXT NOT NULL DEFAULT 'latest'
                        CHECK (official_attempt_rule IN ('latest','best','first','manual')),
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active assessment per (class, term, subject, component) slot. This is the
-- database-level enforcement behind PD-2: a component has ONE source at a time.
CREATE UNIQUE INDEX IF NOT EXISTS cbt_one_assessment_per_component_slot
  ON public.cbt_assessments (school_id, class_id, term_id, subject_id, component_id)
  WHERE component_id IS NOT NULL AND status <> 'archived';

CREATE TABLE IF NOT EXISTS public.cbt_assessment_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id  UUID NOT NULL REFERENCES public.cbt_assessments(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES public.cbt_questions(id) ON DELETE CASCADE,
  display_order  INT NOT NULL DEFAULT 0,
  marks_override NUMERIC(8,2),
  UNIQUE (assessment_id, question_id)
);


-- ----------------------------------------------------------------------------
-- 3. Attempts and frozen snapshots
-- ----------------------------------------------------------------------------
-- `student_profile_id` is denormalised onto every attempt-scoped table so each
-- policy is a single-table predicate (rule 2).
CREATE TABLE IF NOT EXISTS public.cbt_attempts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assessment_id      UUID NOT NULL REFERENCES public.cbt_assessments(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempt_number     INTEGER NOT NULL CHECK (attempt_number > 0),
  status             TEXT NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','submitted','marked','invalidated')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ,          -- server-authoritative, never a client timer
  submitted_at       TIMESTAMPTZ,
  marked_at          TIMESTAMPTZ,
  UNIQUE (assessment_id, student_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.cbt_attempt_questions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attempt_id         UUID NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  student_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  question_id        UUID,                          -- provenance only, may dangle
  display_order      INT NOT NULL DEFAULT 0,
  question_type      TEXT NOT NULL,
  question_text      TEXT NOT NULL,
  options_snapshot   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{option_id,label,option_text}]
  correct_option_id  UUID,                          -- frozen answer key
  model_answer       TEXT,
  marking_rubric     TEXT,
  marks              NUMERIC(8,2) NOT NULL DEFAULT 0,
  UNIQUE (attempt_id, display_order)
);

CREATE TABLE IF NOT EXISTS public.cbt_attempt_answers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attempt_id          UUID NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  student_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  attempt_question_id UUID NOT NULL REFERENCES public.cbt_attempt_questions(id) ON DELETE CASCADE,
  selected_option_id  UUID,                       -- stable option identity, never a letter
  answer_text         TEXT,                       -- theory responses
  awarded_marks       NUMERIC(8,2),
  marked_by           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  marked_at           TIMESTAMPTZ,
  answered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, attempt_question_id)
);


-- ----------------------------------------------------------------------------
-- 4. Results, corrections, report-card linkage
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cbt_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attempt_id       UUID NOT NULL UNIQUE REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  student_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  objective_score  NUMERIC(10,2) NOT NULL DEFAULT 0,
  subjective_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_score      NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_score        NUMERIC(10,2) NOT NULL DEFAULT 0,
  percentage       NUMERIC(6,2),
  -- PD-4: attempt history / official attempt / official score are distinct.
  is_official      BOOLEAN NOT NULL DEFAULT FALSE,
  official_set_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  official_set_at  TIMESTAMPTZ,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cbt_correction_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attempt_id    UUID REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES public.cbt_assessments(id) ON DELETE SET NULL,
  student_id    UUID REFERENCES public.students(id) ON DELETE SET NULL,
  question_id   UUID,
  actor_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  previous_value JSONB,
  new_value     JSONB,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provenance: report-card score -> component -> CBT assessment -> attempt.
CREATE TABLE IF NOT EXISTS public.cbt_score_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  attempt_id       UUID NOT NULL REFERENCES public.cbt_attempts(id) ON DELETE CASCADE,
  student_score_id UUID NOT NULL,
  component_id     UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id)
);


-- ----------------------------------------------------------------------------
-- 5. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cbt_questions_school_subject   ON public.cbt_questions (school_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_cbt_question_options_question  ON public.cbt_question_options (question_id);
CREATE INDEX IF NOT EXISTS idx_cbt_question_media_question    ON public.cbt_question_media (question_id);
CREATE INDEX IF NOT EXISTS idx_cbt_assessments_school         ON public.cbt_assessments (school_id, class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_cbt_assessments_teacher        ON public.cbt_assessments (school_id, teacher_id);
CREATE INDEX IF NOT EXISTS idx_cbt_aq_assessment              ON public.cbt_assessment_questions (assessment_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_school_assessment ON public.cbt_attempts (school_id, assessment_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempts_student           ON public.cbt_attempts (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempt_questions_attempt  ON public.cbt_attempt_questions (attempt_id);
CREATE INDEX IF NOT EXISTS idx_cbt_attempt_answers_attempt    ON public.cbt_attempt_answers (attempt_id);
CREATE INDEX IF NOT EXISTS idx_cbt_results_school             ON public.cbt_results (school_id);
CREATE INDEX IF NOT EXISTS idx_cbt_corrections_school_attempt ON public.cbt_correction_events (school_id, attempt_id);


-- ----------------------------------------------------------------------------
-- 6. RLS — lock everything down, then grant the narrowest policy that works
-- ----------------------------------------------------------------------------
ALTER TABLE public.cbt_questions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_question_options     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_question_answer_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_question_media       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_assessments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_assessment_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_attempts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_attempt_questions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_attempt_answers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_results              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_correction_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_score_links          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;

  -- Same school, any role in it (staff or student).
  same_school TEXT := '(school_id = ((auth.jwt() ->> ''school_id''::text))::uuid)';

  -- Same school AND a staff role.
  staff TEXT := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) '
             || 'AND ((auth.jwt() ->> ''app_role''::text) = ANY (ARRAY[''teacher'',''school_admin''])))';

  -- The student's own rows.
  own TEXT := '((school_id = ((auth.jwt() ->> ''school_id''::text))::uuid) '
           || 'AND ((auth.jwt() ->> ''app_role''::text) = ''student'') '
           || 'AND (student_profile_id = ((auth.jwt() ->> ''sub''::text))::uuid))';

  -- Staff may do anything in their school; the platform may do anything.
  staff_or_super TEXT;

  -- --- staff-only content: students get NO policy, so RLS denies them -------
  content_tables TEXT[] := ARRAY[
    'cbt_questions','cbt_question_options','cbt_question_answer_keys',
    'cbt_question_media','cbt_assessment_questions'
  ];

  -- --- staff write, student reads own ---------------------------------------
  own_read_tables TEXT[] := ARRAY[
    'cbt_attempts','cbt_attempt_questions','cbt_attempt_answers'
  ];

  -- --- staff only -----------------------------------------------------------
  staff_only_tables TEXT[] := ARRAY[
    'cbt_correction_events','cbt_score_links'
  ];
BEGIN
  staff_or_super := staff || ' OR is_super_admin()';

  -- 1. Staff-only content. No student policy is created, so students are denied
  --    by RLS rather than by an exclusion inside a permissive policy.
  FOREACH t IN ARRAY content_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS cbt_staff_all_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY cbt_staff_all_%1$s ON public.%1$I FOR ALL USING (%2$s) WITH CHECK (%2$s)',
                   t, staff_or_super);
  END LOOP;

  -- 2. Attempt-scoped tables: staff OR the student's own rows.
  FOREACH t IN ARRAY own_read_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS cbt_owner_all_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY cbt_owner_all_%1$s ON public.%1$I FOR ALL USING (%2$s) WITH CHECK (%2$s)',
                   t, own || ' OR ' || staff_or_super);
  END LOOP;

  -- 3. Staff-only bookkeeping.
  FOREACH t IN ARRAY staff_only_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS cbt_staff_all_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE POLICY cbt_staff_all_%1$s ON public.%1$I FOR ALL USING (%2$s) WITH CHECK (%2$s)',
                   t, staff_or_super);
  END LOOP;
END $$;

-- 4. Assessments: staff see all of their school's; a student sees only a
--    PUBLISHED assessment in their school. Staff keep write access.
DROP POLICY IF EXISTS cbt_assessment_staff_all ON public.cbt_assessments;
CREATE POLICY cbt_assessment_staff_all ON public.cbt_assessments
  FOR ALL
  USING (((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
          AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['teacher','school_admin'])))
         OR is_super_admin())
  WITH CHECK (((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
          AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['teacher','school_admin'])))
         OR is_super_admin());

DROP POLICY IF EXISTS cbt_assessment_student_select ON public.cbt_assessments;
CREATE POLICY cbt_assessment_student_select ON public.cbt_assessments
  FOR SELECT
  USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
         AND ((auth.jwt() ->> 'app_role'::text) = 'student')
         AND status = 'published');

-- 5. Results: staff see all in their school; a student sees only their own, and
--    only once the attempt has been marked. Students never write results.
DROP POLICY IF EXISTS cbt_results_staff_all ON public.cbt_results;
CREATE POLICY cbt_results_staff_all ON public.cbt_results
  FOR ALL
  USING (((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
          AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['teacher','school_admin'])))
         OR is_super_admin())
  WITH CHECK (((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
          AND ((auth.jwt() ->> 'app_role'::text) = ANY (ARRAY['teacher','school_admin'])))
         OR is_super_admin());

DROP POLICY IF EXISTS cbt_results_student_select ON public.cbt_results;
CREATE POLICY cbt_results_student_select ON public.cbt_results
  FOR SELECT
  USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
         AND ((auth.jwt() ->> 'app_role'::text) = 'student')
         AND (student_profile_id = ((auth.jwt() ->> 'sub'::text))::uuid)
         AND EXISTS (
               SELECT 1 FROM public.cbt_attempts a
               WHERE a.id = cbt_results.attempt_id AND a.status = 'marked'
             ));
