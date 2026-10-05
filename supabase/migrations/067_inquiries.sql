-- ============================================================================
-- 067 — Public inquiries (the landing-page "Waitlist")
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds ONE table. No existing table, column, policy, index or row is touched.
--
-- WHY THE NAME IS `inquiries`, NOT `waitlist`
--   "Waitlist" is a working label that product may change ("School Inquiry",
--   "Get Started", ...). The table, API routes and super-admin route are named
--   for what the row IS — a prospect asking about the platform — and the
--   user-facing wording lives in src/lib/inquiries/config.ts. `kind` records
--   which form produced the row, so a second form later needs no new table.
--
-- WRITES: public visitors never touch this table directly. The landing page
--   posts to /api/public/inquiries, which validates, rate-limits and inserts
--   with the service role. RLS is enabled and the only policy is super admin,
--   so the anon and authenticated roles cannot read or write a single row.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inquiries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which public form produced this row. Free text on purpose: adding a form
  -- must not need a migration.
  kind              TEXT NOT NULL DEFAULT 'waitlist',

  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  school_name       TEXT,
  role              TEXT,
  school_size       TEXT,
  message           TEXT,

  -- Super-admin workflow.
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  admin_notes       TEXT,

  -- Where on the site it came from, and how many times this email has asked.
  source            TEXT,
  submit_count      INTEGER NOT NULL DEFAULT 1,
  last_submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per person per form: a repeat submission updates the row instead of
-- filling the inbox with duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiries_kind_email
  ON public.inquiries (kind, lower(email));

CREATE INDEX IF NOT EXISTS idx_inquiries_status_created
  ON public.inquiries (status, created_at DESC);

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_all_inquiries ON public.inquiries;
CREATE POLICY super_admin_all_inquiries ON public.inquiries
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

REVOKE ALL ON public.inquiries FROM anon;

DROP TRIGGER IF EXISTS update_inquiries_updated_at ON public.inquiries;
CREATE TRIGGER update_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
