-- ============================================================
-- 076_copilot_read_snapshots — carry a turn's reads into the next turn.
--
-- Read results used to live only inside one reply. On the following
-- turn the model had no memory of them, re-read the same data, and
-- re-planned — producing repeated approval requests. This table keeps
-- the latest snapshot per conversation so the next turn can start from
-- the data it already fetched. The snapshot is supplied to the model
-- as fenced, untrusted data and is never rendered in the panel.
--
-- Idempotent; safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS copilot_read_snapshots (
  conversation_id UUID PRIMARY KEY REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  school_id       UUID NOT NULL,
  snapshot        JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
