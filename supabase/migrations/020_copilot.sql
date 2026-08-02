-- ============================================================
-- 020_copilot — AI Operations Copilot tables
-- Supports conversation history, execution plans, operation
-- journaling, and audit logging for Phase 1–3 delivery.
-- ============================================================

-- 1. Conversations (one per school, scoped to super_admin)
CREATE TABLE IF NOT EXISTS copilot_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  super_admin_id  UUID NOT NULL,
  title           TEXT,                          -- auto-generated from first prompt
  mode            TEXT NOT NULL DEFAULT 'read_only' CHECK (mode IN ('read_only', 'operations')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_conversations_school
  ON copilot_conversations (school_id, created_at DESC);

-- 2. Messages within a conversation
CREATE TABLE IF NOT EXISTS copilot_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  has_plan          BOOLEAN NOT NULL DEFAULT false,
  plan_status       TEXT CHECK (plan_status IN ('pending', 'approved', 'cancelled', 'executing', 'completed', 'failed')),
  plan_summary      JSONB,                       -- structured plan data
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_conv
  ON copilot_messages (conversation_id, created_at ASC);

-- 3. Operations (an approved execution plan that ran or will run)
CREATE TABLE IF NOT EXISTS copilot_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  message_id        UUID REFERENCES copilot_messages(id),
  school_id         UUID NOT NULL REFERENCES schools(id),
  super_admin_id    UUID NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'executing', 'completed', 'failed', 'rolled_back')),
  plan_summary      TEXT,
  total_steps       INTEGER NOT NULL DEFAULT 0,
  completed_steps   INTEGER NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_operations_school
  ON copilot_operations (school_id, created_at DESC);

-- 4. Individual steps within an operation
CREATE TABLE IF NOT EXISTS copilot_operation_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id    UUID NOT NULL REFERENCES copilot_operations(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  capability      TEXT NOT NULL,
  description     TEXT NOT NULL,
  input_params    JSONB,
  api_endpoint    TEXT,
  api_method      TEXT,
  response_data   JSONB,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back', 'skipped')),
  error_message   TEXT,
  rollback_info   JSONB,                       -- IDs of created resources for undo
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_op_steps_op
  ON copilot_operation_steps (operation_id, step_order);

-- 5. Audit log for every copilot action
CREATE TABLE IF NOT EXISTS copilot_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL,
  super_admin_id  UUID NOT NULL,
  operation_id    UUID REFERENCES copilot_operations(id),
  step_id         UUID REFERENCES copilot_operation_steps(id),
  action          TEXT NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_audit_school
  ON copilot_audit_log (school_id, created_at DESC);
