-- ============================================================================
-- SchoolAid — Phase 2: Super Admin Core
-- Adds tables for school admin accounts, subscriptions, and support logs.
-- ============================================================================

-- 1. Add subscription fields to schools (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_status') THEN
    ALTER TABLE schools ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_plan') THEN
    ALTER TABLE schools ADD COLUMN subscription_plan TEXT DEFAULT 'free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_expiry') THEN
    ALTER TABLE schools ADD COLUMN subscription_expiry TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'motto') THEN
    ALTER TABLE schools ADD COLUMN motto TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'website') THEN
    ALTER TABLE schools ADD COLUMN website TEXT;
  END IF;
END;
$$;

-- 2. School Admins table (links auth user to school as admin)
CREATE TABLE IF NOT EXISTS school_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  generated_password TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id),
  UNIQUE(school_id, profile_id)
);

-- 3. Subscriptions table (billing history)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'suspended', 'cancelled')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  amount DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Support Logs (impersonation audit trail)
CREATE TABLE IF NOT EXISTS support_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  super_admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  impersonation_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS for new tables

-- School Admins: only super_admin and the school's own admins can see
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_admins_select ON school_admins;
CREATE POLICY school_admins_select ON school_admins
  FOR SELECT USING (
    is_super_admin()
    OR school_id = (auth.jwt() ->> 'school_id')::UUID
  );

DROP POLICY IF EXISTS school_admins_insert ON school_admins;
CREATE POLICY school_admins_insert ON school_admins
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS school_admins_update ON school_admins;
CREATE POLICY school_admins_update ON school_admins
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Subscriptions: super_admin only (billing is sensitive)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (
    is_super_admin()
    OR school_id = (auth.jwt() ->> 'school_id')::UUID
  );

DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
CREATE POLICY subscriptions_update ON subscriptions
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Support Logs: super_admin only
ALTER TABLE support_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_logs_select ON support_logs;
CREATE POLICY support_logs_select ON support_logs
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS support_logs_insert ON support_logs;
CREATE POLICY support_logs_insert ON support_logs
  FOR INSERT WITH CHECK (is_super_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_admins_school ON school_admins (school_id);
CREATE INDEX IF NOT EXISTS idx_school_admins_profile ON school_admins (profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school ON subscriptions (school_id);
CREATE INDEX IF NOT EXISTS idx_support_logs_school ON support_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_support_logs_created ON support_logs (created_at DESC);

-- Trigger for school_admins updated_at
DROP TRIGGER IF EXISTS update_school_admins_updated_at ON school_admins;
CREATE TRIGGER update_school_admins_updated_at
  BEFORE UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
