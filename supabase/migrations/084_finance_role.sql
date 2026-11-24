-- ============================================================================
-- 084 — Finance role for school-admin accounts (admin vs bursar)
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- WHY A COLUMN, NOT A NEW `profiles.role` VALUE
--   `profiles.role` is an authentication role: it decides which portal you get
--   (middleware's role→route map), what the JWT carries, and what every RLS
--   policy names. Adding a fifth value there would mean touching the login route,
--   the middleware, `verifySchoolAdmin`, and six policies — a lot of surface for
--   what is really an AUTHORISATION choice inside one portal.
--
--   A bursar is a school administrator who may take money and read reports, but
--   may not void a payment, recalculate bills, or rewrite the fee setup. That is
--   a capability, so it gets its own column and is enforced in the routes that
--   move money. Authentication is untouched.
--
-- WHAT IT CHANGES
--   Nothing for existing accounts: every school admin is `admin` by default, so
--   behaviour is identical until somebody is deliberately set to `bursar`.
--
-- HOW TO SET IT (until the super-admin screen offers it)
--   UPDATE public.profiles SET finance_role = 'bursar' WHERE id = '<profile id>';
--
-- ROLLOUT SAFETY
--   The application reads this column defensively: if the column does not exist
--   yet (migration not applied), every account is treated as `admin`, which is
--   exactly today's behaviour. So the code can ship before this runs.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS finance_role TEXT NOT NULL DEFAULT 'admin';

-- A CHECK added separately so re-running this file is harmless.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_finance_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_finance_role_check
      CHECK (finance_role IN ('admin', 'bursar'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.finance_role IS
  'Finance authorisation for school-admin accounts: admin (full) or bursar (record payments and read reports; cannot void, recalculate or change fee setup).';

-- ============================================================================
-- End of 084.
-- ============================================================================
