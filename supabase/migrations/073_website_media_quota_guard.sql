-- ============================================================================
-- 073 — Website media: the database enforces the per-school quota too
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY THIS EXISTS
--   The upload route counts a school's used bytes, then uploads the object and
--   inserts the row. That count is a read: two simultaneous uploads can both
--   read the same total, both decide there is room, and together cross the
--   250 MB ceiling. The route's own check stays — it fails fast, before any
--   bytes are stored, and gives a friendly message — but the FINAL word lives
--   here, where the count and the insert happen inside one transaction.
--
-- HOW
--   A BEFORE INSERT trigger takes a transaction-scoped advisory lock per
--   school (so concurrent inserts for the same school queue instead of
--   racing), re-reads the ACTIVE total, and raises `media_quota_exceeded` when
--   the incoming row would cross the ceiling. The route recognises that
--   marker, removes the already-uploaded object, and answers 413.
--
--   Tombstoned rows are excluded — they stop counting the moment they are
--   deleted, matching the route and the library screen; the object itself
--   still clears after the 7-day grace via scripts/site-media-gc.cjs.
--
-- VERIFY after applying:
--   select tgname from pg_trigger
--    where tgrelid = 'public.website_media'::regclass
--      and tgname = 'enforce_website_media_quota';
--   Expect: one row.
-- ============================================================================

-- Mirrors MEDIA_LIMITS.schoolBytes in src/lib/site/media.ts. Duplicated on
-- purpose: the route validates before the upload, and this is the net that
-- catches any caller which forgets — a second net, not a second opinion.
CREATE OR REPLACE FUNCTION public.enforce_website_media_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_used  BIGINT;
  v_quota CONSTANT BIGINT := 250 * 1024 * 1024;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Serialise per school: without this, two inserts can both read the same
  -- total before either commits, and the ceiling is crossed anyway.
  PERFORM pg_advisory_xact_lock(hashtext('website_media_quota:' || NEW.school_id::text)::bigint);

  SELECT COALESCE(SUM(bytes), 0)
    INTO v_used
    FROM public.website_media
   WHERE school_id = NEW.school_id
     AND status = 'active';

  IF v_used + NEW.bytes > v_quota THEN
    RAISE EXCEPTION 'media_quota_exceeded'
      USING DETAIL = format('used %s of %s bytes; incoming %s', v_used, v_quota, NEW.bytes);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_website_media_quota ON public.website_media;
CREATE TRIGGER enforce_website_media_quota
  BEFORE INSERT ON public.website_media
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_website_media_quota();
