-- ============================================================
-- 020_copilot_fix — make school_id nullable for super-admin ops
-- ============================================================

-- Allow conversations and operations at super-admin level (no school)
ALTER TABLE copilot_conversations 
  ALTER COLUMN school_id DROP NOT NULL;

ALTER TABLE copilot_operations 
  ALTER COLUMN school_id DROP NOT NULL;
