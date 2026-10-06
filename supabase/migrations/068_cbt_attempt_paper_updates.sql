-- ============================================================================
-- 068 — CBT: a notice that a republished paper replaced an in-progress attempt
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds ONE nullable column. No existing table, column, policy, index or row is
-- touched, and no backfill is needed: NULL means "the paper this attempt was
-- started on has not been replaced".
--
-- WHY
--   A published paper can be taken back, corrected and published again. A
--   SUBMITTED attempt is untouched by that (its snapshot is what the student
--   sat). An attempt still IN PROGRESS is re-pointed at the corrected paper at
--   republish, so without this flag it would change silently, mid-exam — the one
--   place a student must never be surprised. This timestamp lets the attempt
--   screen say "your teacher updated this test; go through your questions and
--   answers again", and it is never set on a submitted or marked attempt.
-- ============================================================================

ALTER TABLE public.cbt_attempts
  ADD COLUMN IF NOT EXISTS paper_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.cbt_attempts.paper_changed_at IS
  'When a republished paper replaced this IN-PROGRESS attempt''s questions. NULL = never. Never set on submitted/marked attempts.';

-- ============================================================================
