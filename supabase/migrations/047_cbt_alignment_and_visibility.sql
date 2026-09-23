-- ============================================================================
-- 047 — CBT structural alignment and student visibility (Phase 16)
-- ============================================================================
-- Forward-only and additive. Introduces no column, changes no row, and leaves
-- every existing referential action exactly as it was.
--
-- THE PROBLEM
-- Phase 14 gave every CBT table a `school_id`, and RLS enforces that a request
-- only ever *reads* its own school's rows. But RLS says nothing about whether a
-- row's FOREIGN KEYS are internally consistent. Nothing, for example, stopped a
-- row in school A from pointing at an assessment, class, student or question
-- belonging to school B:
--
--     cbt_attempts (school_id = A, assessment_id = <an assessment in B>)
--
-- Such a row is reachable by school A (its own school_id) while carrying a
-- reference that belongs to school B — a confused-deputy shape. Server-side
-- checks should never create it, but "should never" is not a guarantee, and the
-- service-role client bypasses RLS entirely.
--
-- THE FIX — two independent layers
--
-- 1. STRUCTURAL (this file, part 1). Composite foreign keys of the form
--    (fk, school_id) -> parent(id, school_id). Cross-school linkage stops being
--    a policy question and becomes a schema impossibility, enforced for every
--    role, including the service role. This is the alignment requirement
--    "School -> Session -> Term -> Class -> Subject -> Teacher -> Student" made
--    mechanical at the point where it can actually be guaranteed.
--
-- 2. VISIBILITY (this file, part 2). Tightens the student SELECT policy on
--    cbt_assessments so a student sees only assessments for THEIR class, not
--    every published assessment in their school.
--
-- WHY MATCH SIMPLE IS SAFE HERE — read this before "fixing" it
-- A composite FK is not checked when any of its referencing columns is NULL
-- (the default MATCH SIMPLE). That would normally be a hole: NULL out the
-- school and the check disappears. It is safe here for a specific reason:
--
--   * `school_id` is NOT NULL on every CBT table, so it can never be the NULL
--     that disables the check.
--   * The only nullable half is the optional relation (`subject_id`,
--     `term_id`, `teacher_id`, `session_id`, `class_id` on cbt_questions,
--     `correct_option_id`, `assessment_id`/`student_id` on correction events).
--   * Those columns can only become NULL through the existing single-column
--     FK's own ON DELETE SET NULL, i.e. because the parent was deleted — never
--     by choosing a different school's row.
--
-- Consequently every referential action is left untouched: no ON DELETE
-- behaviour in this schema changes. The composite keys add a consistency check
-- and nothing else.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1a. Unique keys a composite FK can reference.
-- ----------------------------------------------------------------------------
-- `id` alone is already unique, so (id, school_id) is trivially unique and the
-- constraint cannot fail on existing data. It exists purely to give the
-- composite foreign keys below something to point at.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  cname TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classes', 'subjects', 'academic_terms', 'academic_sessions', 'teachers',
    'students', 'cbt_questions', 'cbt_question_options', 'cbt_assessments',
    'cbt_attempts', 'cbt_attempt_questions'
  ]
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


-- ----------------------------------------------------------------------------
-- 1b. Composite foreign keys: every CBT reference must stay inside its school.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  spec RECORD;
  cname TEXT;
  parent_has_school BOOLEAN;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- child table              referencing column     parent table
      ('cbt_questions',           'subject_id',          'subjects'),
      ('cbt_questions',           'class_id',            'classes'),
      ('cbt_question_options',    'question_id',         'cbt_questions'),
      ('cbt_question_answer_keys','question_id',         'cbt_questions'),
      ('cbt_question_answer_keys','correct_option_id',   'cbt_question_options'),
      ('cbt_question_media',      'question_id',         'cbt_questions'),
      ('cbt_assessments',         'session_id',          'academic_sessions'),
      ('cbt_assessments',         'term_id',             'academic_terms'),
      ('cbt_assessments',         'class_id',            'classes'),
      ('cbt_assessments',         'subject_id',          'subjects'),
      ('cbt_assessments',         'teacher_id',          'teachers'),
      ('cbt_assessment_questions','assessment_id',       'cbt_assessments'),
      ('cbt_assessment_questions','question_id',         'cbt_questions'),
      ('cbt_attempts',            'assessment_id',       'cbt_assessments'),
      ('cbt_attempts',            'student_id',          'students'),
      ('cbt_attempt_questions',   'attempt_id',          'cbt_attempts'),
      ('cbt_attempt_answers',     'attempt_id',          'cbt_attempts'),
      ('cbt_attempt_answers',     'attempt_question_id', 'cbt_attempt_questions'),
      ('cbt_results',             'attempt_id',          'cbt_attempts'),
      ('cbt_correction_events',   'attempt_id',          'cbt_attempts'),
      ('cbt_correction_events',   'assessment_id',       'cbt_assessments'),
      ('cbt_correction_events',   'student_id',          'students'),
      ('cbt_score_links',         'attempt_id',          'cbt_attempts')
    ) AS v(child, col, parent)
  LOOP
    cname := spec.child || '_' || spec.col || '_school_fkey';

    -- Guard the whole thing on the parent actually being tenant-scoped. A parent
    -- without school_id (e.g. a platform-level lookup table) cannot take part in
    -- a tenant-consistency key, and silently skipping it is better than failing
    -- the migration on a table this phase does not own.
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = spec.parent
         AND column_name = 'school_id'
    ) INTO parent_has_school;

    IF NOT parent_has_school THEN
      RAISE NOTICE '047: skipping % — %.% has no school_id',
        cname, 'public', spec.parent;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = cname
         AND conrelid = format('public.%I', spec.child)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I '
        'FOREIGN KEY (%I, school_id) REFERENCES public.%I (id, school_id)',
        spec.child, cname, spec.col, spec.parent);
    END IF;
  END LOOP;
END $$;


-- ----------------------------------------------------------------------------
-- 2. A student sees only their own class's published assessments.
-- ----------------------------------------------------------------------------
-- Phase 14's student policy required only same-school + published, so a student
-- in JSS 1 could read the published assessment (title, instructions, timing) for
-- JSS 3. Reading is not taking — starting an attempt is guarded separately — but
-- the row was never theirs to see.
--
-- Membership is resolved two ways, and deliberately tolerant:
--   * `students.class_id`      — the primary signal, populated for enrolled
--                                students;
--   * `enrollments` (status='active') — the term-scoped signal, used when a
--                                school records enrolment that way.
--
-- Both are checked because `enrollments` is currently EMPTY in staging while
-- `students.class_id` is populated. Requiring an enrollment row would deny every
-- student in every school; requiring only class_id would ignore term-scoped
-- enrolment where it exists. Either satisfies the check.
--
-- No policy recursion: this reads `students` and `enrollments`, and neither of
-- those policies reads a cbt_* table.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS cbt_assessment_student_select ON public.cbt_assessments;
CREATE POLICY cbt_assessment_student_select ON public.cbt_assessments
  FOR SELECT
  USING (
    (school_id = ((auth.jwt() ->> 'school_id'::text))::uuid)
    AND ((auth.jwt() ->> 'app_role'::text) = 'student')
    AND status = 'published'
    AND (
      EXISTS (
        SELECT 1
          FROM public.students s
         WHERE s.profile_id = ((auth.jwt() ->> 'sub'::text))::uuid
           AND s.class_id = cbt_assessments.class_id
      )
      OR EXISTS (
        SELECT 1
          FROM public.enrollments e
          JOIN public.students s2 ON s2.id = e.student_id
         WHERE s2.profile_id = ((auth.jwt() ->> 'sub'::text))::uuid
           AND e.class_id = cbt_assessments.class_id
           AND e.status = 'active'
      )
    )
  );
