-- Add archived state to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add 'archived' to subscription_status check
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_subscription_status_check;
ALTER TABLE schools ADD CONSTRAINT schools_subscription_status_check
  CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'archived'));
