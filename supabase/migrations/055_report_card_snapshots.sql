-- ============================================================================
-- 055 — Published report-card configuration snapshots (Phase 11)
-- ============================================================================
-- Additive: two nullable columns. No table created, no column dropped, no row
-- rewritten, no backfill. Existing rows keep `configuration_snapshot = NULL` and
-- therefore keep rendering exactly as they do today.
--
-- THE GAP THIS CLOSES
-- -------------------
-- Publishing already freezes the RESULT: `term_results` holds the total, the
-- grade letter and the subject remark; `term_result_components` holds each
-- component's name, order, maximum and score; `school_admin_comments` holds the
-- principal's remark. All written at publish time.
--
-- What was still read LIVE, at every page view, was the CONFIGURATION around
-- those frozen numbers:
--
--   * the assessment component list (`components_rows`)
--   * the grading scale / bands (`grading_rows`)
--   * psychomotor and affective trait NAMES (`psychomotor_rows`, `affective_rows`)
--   * the display toggles (`report_card_settings`)
--   * the student's position and class size, recomputed from the CURRENT roster
--
-- So a school that moved its "A" band from 70 to 75, or renamed a component, or
-- gained a student, changed what an already-published report card SAID — without
-- editing any score, and with nothing in any audit log to explain it. That
-- contradicts the rule this project has already committed to: published = locked.
--
-- WHY THESE TWO COLUMNS AND NOT A NEW TABLE
-- -----------------------------------------
-- `report_card_submissions` is already the publication record for exactly one
-- class + term (UNIQUE (class_id, term_id)), and it already carries
-- `published_at`, `published_by`, `correction_cycle_id` and the retraction fields.
-- A separate table would duplicate that key and add a join for no gain.
--
-- WHY TWO COLUMNS RATHER THAN ONE
-- -------------------------------
-- The same unique constraint means there is only ever ONE row per class + term, so
-- a single column could only ever hold the LATEST publication — republishing would
-- destroy the configuration of the publication it replaced. The agreed lifecycle
-- is:
--
--   publish   -> V1 becomes `configuration_snapshot`
--   retract   -> nothing is touched; V1 stays readable
--   republish -> V1 is APPENDED to `publication_history`, V2 becomes the snapshot
--
-- so the previous publication survives as a record, which is the whole point of a
-- published report card being immutable.
--
-- IMMUTABILITY OF A HISTORY ENTRY
-- -------------------------------
-- `publication_history` is append-only BY CONVENTION IN THE APPLICATION: entries
-- are only ever pushed, never edited. This migration deliberately does NOT add a
-- trigger to enforce it, because a trigger cannot distinguish "appending a new
-- entry" from "rewriting an old one" — both are an UPDATE to the column. The
-- project's precedent for append-only (`046`, `050`) is a BEFORE UPDATE trigger
-- that blocks the operation outright; that would block legitimate republishing
-- here. Recorded so the next reader knows this was a decision, not an oversight.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The two columns
-- ----------------------------------------------------------------------------
ALTER TABLE public.report_card_submissions
  ADD COLUMN IF NOT EXISTS configuration_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS publication_history    JSONB;


-- ----------------------------------------------------------------------------
-- 2. Shape guards
-- ----------------------------------------------------------------------------
-- Cheap, and they catch a class of bug that is otherwise invisible until a
-- report card renders blank: a snapshot written as a JSON array, a string, or a
-- number. `jsonb_typeof` is the check; `NULL` stays valid, because NULL is the
-- documented state for "published before this feature".
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'report_card_submissions_snapshot_is_object'
       AND conrelid = 'public.report_card_submissions'::regclass
  ) THEN
    ALTER TABLE public.report_card_submissions
      ADD CONSTRAINT report_card_submissions_snapshot_is_object
      CHECK (configuration_snapshot IS NULL OR jsonb_typeof(configuration_snapshot) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'report_card_submissions_history_is_array'
       AND conrelid = 'public.report_card_submissions'::regclass
  ) THEN
    ALTER TABLE public.report_card_submissions
      ADD CONSTRAINT report_card_submissions_history_is_array
      CHECK (publication_history IS NULL OR jsonb_typeof(publication_history) = 'array');
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 3. What is deliberately NOT here
-- ----------------------------------------------------------------------------
--   * No index. Both lookups are by (class_id, term_id), which the existing
--     unique index already serves.
--   * No backfill. Inventing a configuration for a card published months ago
--     would be fabricating history. NULL means "render it the old way".
--   * No change to `status`, the lifecycle, or any existing column.
-- ============================================================================
