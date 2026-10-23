-- ============================================================================
-- 077 — A second phone line on a school
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY A COLUMN AND NOT PROSE
-- --------------------------
-- `schools.phone` is the number every surface publishes: the contact card, the
-- `tel:` links, the "Call Admissions Office" button, and the WhatsApp link the
-- resolver builds from it. A school with a second line therefore had only one
-- honest option — bury the number inside a paragraph — where no parent can tap
-- it, and where it is the first thing to drift out of date.
--
-- This column carries it as data. It is deliberately separate from `phone`:
-- the first number stays the one used for the WhatsApp link and for any
-- "call us" action, so a mobile line typed here can never silently take over
-- the primary call path.
--
-- NULL means "there is no second line", which is the state of every existing
-- row, so no backfill is needed and no reader has to change its defaults.
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS phone_secondary TEXT;

COMMENT ON COLUMN public.schools.phone_secondary IS
  E'Optional second phone line shown next to phone. Not used for the WhatsApp link — that stays on phone.';
