-- Password history table for uniqueness tracking
CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password TEXT NOT NULL,
  school_prefix TEXT NOT NULL,
  role TEXT NOT NULL,
  used_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_history_used ON password_history(password);
