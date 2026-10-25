-- ============================================================================
-- SchoolAid — Migration 078: keep the student archive flags in step
-- ============================================================================
--
-- There are two student "active" columns:
--
--   profiles.is_active  — the canonical archive flag every roster, report-card
--                         and teacher screen reads, and the one the school
--                         admin's Archive/Restore action has always toggled.
--   students.is_active  — a finance-side mirror added by the finance
--                         migrations and used when bills are generated.
--
-- Archiving through the profile only left the mirror at true, so an archived
-- student could still be billed. This migration aligns the existing rows and
-- adds an AFTER UPDATE trigger that keeps the mirror in step for every future
-- write — from the school admin, a class teacher, or any future code path.

-- 1. One-time backfill: the profile is the source of truth.
UPDATE public.students AS s
SET is_active = COALESCE(p.is_active, true)
FROM public.profiles AS p
WHERE s.profile_id = p.id
  AND s.is_active IS DISTINCT FROM COALESCE(p.is_active, true);

-- 2. Keep them aligned from now on.
CREATE OR REPLACE FUNCTION public.sync_student_archive_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    UPDATE public.students
       SET is_active = NEW.is_active
     WHERE profile_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_archive_flag ON public.profiles;
CREATE TRIGGER trg_sync_student_archive_flag
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_student_archive_flag();

-- 3. Roster queries filter on both school and archive state.
CREATE INDEX IF NOT EXISTS idx_students_school_is_active
  ON public.students (school_id, is_active);
