-- ============================================================================
-- 062 — Section structure on attempts (frozen with the paper)
-- ============================================================================
-- The assessment stores its sections (heading + instruction) in
-- `cbt_assessments.sections` (migration 061). Until now the attempt snapshot did
-- not carry them, so a student never saw "SECTION A — Answer all questions".
--
-- These two columns let the attempt freeze the section structure at start,
-- exactly the way it already freezes question text and options:
--
--   cbt_attempts.sections            the paper's section list, as configured
--                                    [{ "label": "Section A", "instruction": "…" }]
--   cbt_attempt_questions.section    the section label each question sat under
--
-- Additive and nullable:
--   * existing attempts (if any) keep NULL and render exactly as before;
--   * attempts started on a database that has not run this migration still
--     start — the writer simply omits both columns (see delivery.ts);
--   * immutability is untouched: values are written once at attempt start, and
--     the existing before-update trigger on cbt_attempt_questions still forbids
--     changing a snapshot afterwards.
--
-- No RLS/policy changes: both columns live on tables already covered by the
-- existing staff/student policies.

ALTER TABLE public.cbt_attempts
  ADD COLUMN IF NOT EXISTS sections JSONB;

ALTER TABLE public.cbt_attempt_questions
  ADD COLUMN IF NOT EXISTS section TEXT;
