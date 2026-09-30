-- ============================================================================
-- 061 — CBT assessment sections
-- ============================================================================
-- Adds an optional ordered list of sections to a CBT assessment, so a paper can
-- carry "Section A — Objective" with its own instruction above the questions
-- that belong to it.
--
-- Additive and nullable: existing assessments keep sections = NULL and render
-- exactly as before. The attempt snapshot engine is NOT touched — sections are
-- paper structure, not per-attempt data.
--
-- Shape (JSONB array):
--   [ { "label": "Section A", "instruction": "Answer all questions..." } ]

ALTER TABLE public.cbt_assessments
  ADD COLUMN IF NOT EXISTS sections JSONB;
