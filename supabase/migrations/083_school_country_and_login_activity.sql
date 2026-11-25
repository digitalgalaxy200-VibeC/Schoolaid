-- 083_school_country_and_login_activity.sql
--
-- WHY
-- ---
-- Two questions the super-admin dashboard could not answer honestly:
--
--   1. Which countries are we live in? Nigeria is the market; Benin and
--      Francophone Africa are pilots. `schools.address` is free text and cannot be
--      counted, so the split was unanswerable.
--   2. Which schools are actually being used? Without a sign-in timestamp, any
--      "health" score would have been invented. `profiles.last_login_at` records
--      the fact, and the dashboard can count it instead of guessing.
--
-- FORWARD-ONLY and additive.

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'NG';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_country_check'
  ) THEN
    ALTER TABLE public.schools
      ADD CONSTRAINT schools_country_check
      CHECK (country IN ('NG', 'BJ', 'CI', 'SN', 'TG', 'BF', 'ML', 'NE', 'GN'));
  END IF;
END $$;

COMMENT ON COLUMN public.schools.country IS
  'ISO 3166-1 alpha-2 market code. NG is the main market; BJ and the Francophone codes are pilots.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN public.profiles.last_login_at IS
  'Last successful sign-in. Written by /api/auth/login; NULL means the account has never been used.';

-- Counting "active in the last 7 days" per school is the first query this column
-- exists for, so it gets the index that query needs.
CREATE INDEX IF NOT EXISTS idx_profiles_last_login
  ON public.profiles (school_id, last_login_at DESC);
