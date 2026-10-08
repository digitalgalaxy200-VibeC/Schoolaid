-- ============================================================
-- 075_copilot_idempotency — a retried write must not double-apply.
--
-- Stores the original StepResult keyed by the idempotency key the
-- engine derives for a write step, so a retry (after an UNKNOWN
-- outcome, say) returns the FIRST result instead of mutating again.
--
-- Idempotent; safe to re-run. No foreign key to copilot_operations
-- on purpose: the key is the contract, and an operation record may
-- be pruned independently.
-- ============================================================

CREATE TABLE IF NOT EXISTS copilot_idempotency (
  key           TEXT PRIMARY KEY,
  operation_id  UUID,
  step_order    INTEGER,
  result        JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_idempotency_created
  ON copilot_idempotency (created_at DESC);
