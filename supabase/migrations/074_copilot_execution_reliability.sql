-- ============================================================
-- 074_copilot_execution_reliability — P0 hardening for the
-- Copilot execution layer.
--
-- Adds:
--   * `request_id` on operations and steps, so every dispatch is
--     traceable to its result and its audit record;
--   * `result` on steps — the canonical StepResult contract;
--   * `unknown` as an allowed terminal state on operations, steps
--     and message plan_status.
--
-- `unknown` means: dispatched, but no authoritative result was
-- received. It is NOT a synonym for `completed` and is never
-- auto-promoted. Idempotent; safe to re-run.
-- ============================================================

-- ── request id + canonical result ───────────────────────────
ALTER TABLE copilot_operations      ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE copilot_operation_steps ADD COLUMN IF NOT EXISTS request_id TEXT;
ALTER TABLE copilot_operation_steps ADD COLUMN IF NOT EXISTS result JSONB;

-- ── allow 'unknown' as a terminal state ─────────────────────
-- Constraint names follow Postgres' default for an inline column CHECK:
-- <table>_<column>_check. Dropped and re-added so the new value is accepted.
ALTER TABLE copilot_operations DROP CONSTRAINT IF EXISTS copilot_operations_status_check;
ALTER TABLE copilot_operations ADD CONSTRAINT copilot_operations_status_check
  CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rolled_back', 'unknown'));

ALTER TABLE copilot_operation_steps DROP CONSTRAINT IF EXISTS copilot_operation_steps_status_check;
ALTER TABLE copilot_operation_steps ADD CONSTRAINT copilot_operation_steps_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back', 'skipped', 'unknown'));

ALTER TABLE copilot_messages DROP CONSTRAINT IF EXISTS copilot_messages_plan_status_check;
ALTER TABLE copilot_messages ADD CONSTRAINT copilot_messages_plan_status_check
  CHECK (plan_status IN ('pending', 'approved', 'cancelled', 'executing', 'completed', 'failed', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_copilot_op_steps_request
  ON copilot_operation_steps (request_id);
