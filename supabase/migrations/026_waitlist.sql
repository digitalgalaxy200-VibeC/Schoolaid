-- Waitlist / lead submissions from the public landing page.
-- Public inserts happen through the service-role client in
-- /api/public/waitlist, never directly from the browser — RLS below
-- only governs what an authenticated Super Admin session can do.

CREATE TABLE waitlist_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  school_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  city TEXT,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'landing_page',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

CREATE INDEX waitlist_submissions_status_idx ON waitlist_submissions (status);
CREATE INDEX waitlist_submissions_created_at_idx ON waitlist_submissions (created_at DESC);

ALTER TABLE waitlist_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view waitlist submissions"
  ON waitlist_submissions FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can update waitlist submissions"
  ON waitlist_submissions FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Super admins can delete waitlist submissions"
  ON waitlist_submissions FOR DELETE
  USING (is_super_admin());
