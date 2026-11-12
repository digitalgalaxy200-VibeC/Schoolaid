-- ============================================================================
-- 081 — CBT Question Bank: publication lifecycle
-- ============================================================================
-- Forward-only and additive. No row is deleted, no column is dropped.
--
-- WHY THIS EXISTS
--   The Question Bank is the school's HISTORICAL library. Until now a question
--   appeared there the moment it existed, which is wrong: a question being
--   written for a paper nobody has published yet is not history.
--
--   Visibility is therefore driven by a historical EVENT — "this question was
--   published on a paper" — not by the current status of the paper it happens to
--   sit on. `cbt_questions.status` cannot express that: every saved question is
--   `approved` (56 of 56 on staging), because saving is the approval step.
--
-- WHY NOT USE `cbt_assessments.published_at`
--   `unpublishAssessment` deliberately clears that column ("the column answers
--   'when is this published'"). Using it would make history disappear when a
--   teacher unpublishes a paper to fix a typo — including papers students have
--   already sat. A question's publication date is stamped once and kept.
--
-- WHAT IT ADDS
--   1. `cbt_questions.published_at` — null until the question first appears on a
--      published paper.
--   2. An index for the "published history" filter.
--   3. A backfill from the assessments that are published RIGHT NOW.
--
-- WHAT IT DOES NOT DO
--   - Nothing is deleted. The questions that are not yet published (37 on
--     staging) remain exactly where they are, visible in "In preparation".
--   - `cbt_assessment_questions` is untouched, so no paper or attempt changes.
--   - No content, option, answer key or media row is modified.
--
-- BACKFILL RULE
--   First publication wins: `min(a.published_at)` across the published papers
--   that use the question. Verified on staging before writing this file:
--   Maths (4 questions) and BScience (14) are published; that is 18 questions.
--   The single question on the draft paper and the 37 never added to a paper
--   stay null and appear under "In preparation".
--
-- VERIFY AFTER APPLYING
--   select count(*) filter (where published_at is not null) as published,
--          count(*) filter (where published_at is null)     as in_preparation,
--          count(*)                                         as total
--   from public.cbt_questions;
-- ============================================================================

-- NOTE: no BEGIN/COMMIT. scripts/db-migrate.js wraps each file in a transaction.

alter table public.cbt_questions
  add column if not exists published_at timestamptz;

create index if not exists idx_cbt_questions_published
  on public.cbt_questions (published_at)
  where published_at is not null;

-- First publication is the one that counts.
with first_published as (
  select l.question_id,
         min(a.published_at) as published_at
  from public.cbt_assessment_questions l
  join public.cbt_assessments a on a.id = l.assessment_id
  where a.published_at is not null
  group by l.question_id
)
update public.cbt_questions q
set published_at = f.published_at
from first_published f
where q.id = f.question_id
  and q.published_at is null;
