-- ============================================================
-- 022_copilot_fix — fix nullable constraints
-- ============================================================

-- Allow operations without a conversation (direct execution)
ALTER TABLE copilot_operations 
  ALTER COLUMN conversation_id DROP NOT NULL;
