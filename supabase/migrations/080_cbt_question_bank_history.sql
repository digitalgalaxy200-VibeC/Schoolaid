-- ============================================================================
-- 080 — CBT question bank: academic context and derivation link
-- ============================================================================
-- Forward-only and additive. See supabase/migrations/README.md.
--
-- WHY THIS EXISTS
--   The Question Bank is becoming a historical library: every question keeps the
--   session, term, class and subject it was written for, so a teacher can browse
--   last year's questions and reuse them. Today a question stores only class and
--   subject, so browsing by session/term is impossible, and there is no way to
--   derive an editable copy without changing the original.
--
-- WHAT IT CHANGES
--   1. `cbt_questions.session_id` / `term_id` become real uuid columns.
--      Staging already has them as TEXT, unused and empty (0 of 56 populated).
--      Production does not have them at all. Both paths are handled below.
--   2. `derived_from_id` records that a question is a copy of an earlier one.
--      "Reuse and Edit" writes this; "Reuse" leaves the original untouched.
--   3. A browse index for (school, session, term, class, subject).
--   4. A one-time backfill of existing questions.
--
-- WHAT IT DOES NOT DO
--   - No column is dropped or renamed.
--   - No examination, attempt or answer is touched.
--   - Nothing becomes NOT NULL: a question is still valid with no context.
--
-- BACKFILL RULE (checked against staging before writing this file)
--   A question takes the term of the EARLIEST assessment that used it, because
--   that is the closest record of when it was written. A question never used on
--   an assessment falls back to its school's active term. The session is then
--   read from that term, since `cbt_assessments.session_id` is null throughout.
--   Verified on staging: 19 questions resolve from an assessment, 37 from the
--   active term; all 56 land in 2026/2027 First Term, whose date range
--   (2026-09-14 .. 2027-07-27) contains every question's created_at.
--   Production has 0 cbt_questions, so the backfill is a no-op there.
--
-- ============================================================================
-- VERIFY AFTER APPLYING
--   select count(*) filter (where term_id is null) as unfiled,
--          count(*) filter (where session_id is null) as no_session,
--          count(*) as total
--   from public.cbt_questions;
-- ============================================================================

-- NOTE: no BEGIN/COMMIT here. scripts/db-migrate.js wraps every file in a
-- transaction (COMMIT on apply, ROLLBACK on --dry-run). A COMMIT inside the
-- file would end that wrapper early and make a dry-run commit for real.

-- ----------------------------------------------------------------------------
-- 1. session_id / term_id as uuid
--    `add column if not exists` creates them on production; on staging it is a
--    no-op and the block below converts the legacy TEXT columns in place.
-- ----------------------------------------------------------------------------
alter table public.cbt_questions add column if not exists session_id uuid;
alter table public.cbt_questions add column if not exists term_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cbt_questions'
      and column_name = 'session_id'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.cbt_questions alter column session_id type uuid using nullif(session_id::text, '''')::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cbt_questions'
      and column_name = 'term_id'
      and data_type <> 'uuid'
  ) then
    execute 'alter table public.cbt_questions alter column term_id type uuid using nullif(term_id::text, '''')::uuid';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Provenance for "Reuse and Edit"
--    ON DELETE SET NULL: removing a copy never removes the original, and
--    removing an original leaves its copies intact but unlinked.
-- ----------------------------------------------------------------------------
alter table public.cbt_questions
  add column if not exists derived_from_id uuid
  references public.cbt_questions(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 3. Indexes for the historical browse and for "what was copied from this?"
-- ----------------------------------------------------------------------------
create index if not exists idx_cbt_questions_bank
  on public.cbt_questions (school_id, session_id, term_id, class_id, subject_id);

create index if not exists idx_cbt_questions_derived_from
  on public.cbt_questions (derived_from_id)
  where derived_from_id is not null;

-- ----------------------------------------------------------------------------
-- 4. Backfill — only rows with no term are touched, so this is re-runnable.
-- ----------------------------------------------------------------------------
with first_assessment as (
  select l.question_id,
         a.term_id,
         row_number() over (
           partition by l.question_id
           order by a.created_at asc, a.id asc
         ) as rn
  from public.cbt_assessment_questions l
  join public.cbt_assessments a on a.id = l.assessment_id
  where a.term_id is not null
),
resolved as (
  select q.id as question_id,
         coalesce(fa.term_id, active.id) as term_id
  from public.cbt_questions q
  left join first_assessment fa
         on fa.question_id = q.id and fa.rn = 1
  left join public.academic_terms active
         on active.school_id = q.school_id and active.is_active
  where q.term_id is null
)
update public.cbt_questions q
set term_id    = r.term_id,
    session_id = t.session_id,
    updated_at = now()
from resolved r
join public.academic_terms t on t.id = r.term_id
where q.id = r.question_id
  and q.term_id is null;
