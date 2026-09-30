-- ============================================================================
-- 063 — Question media frozen into attempts
-- ============================================================================
-- Questions may carry ONE accompanying image (typically a diagram). The image
-- lives in the private `assessment-media` bucket and is referenced from
-- `cbt_question_media` (migration 045).
--
-- Attempts freeze their paper, so they must freeze the media reference too: a
-- teacher replacing or removing a question's image must never change what a
-- past student saw. The frozen value is the STORAGE PATH (not a signed URL);
-- URLs are generated dynamically at read time.
--
--   media = { "storage_path": "<school>/cbt/<question-id>/<file>", "content_type": "image/jpeg" }
--
-- Additive and nullable:
--   * existing attempts keep NULL and render exactly as before;
--   * attempts started on a database that has not run this migration still
--     start — the writer omits the column when there is no media
--     (see delivery.ts, same pattern as migration 062);
--   * the existing before-update trigger on cbt_attempt_questions still
--     forbids changing a snapshot afterwards.
--
-- No RLS/policy changes: the column lives on a table already covered by the
-- existing staff/student policies.

ALTER TABLE public.cbt_attempt_questions
  ADD COLUMN IF NOT EXISTS media JSONB;
