-- ============================================================================
-- 033 — Phase 1: term-aware fee configuration + fee change history foundation
-- ADDITIVE ONLY. No existing table/data is altered or removed.
-- ============================================================================

-- Fee change history (evidence of who changed fee configuration, when, and the
-- before/after per class). Phase 1 records matrix writes; Phase 2 expands this
-- into full recalc events (totals, apply scope, affected students).
CREATE TABLE IF NOT EXISTS fee_change_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id),
  term_id     UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  actor_id    UUID,
  action      TEXT NOT NULL, -- set_classes | clear_classes | set_default | set_compulsory | copy_config
  scope       TEXT NOT NULL DEFAULT 'term', -- phase 1: always term-scoped
  reason      TEXT,
  changes     JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{class_id, before, after}]
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_change_events_school ON fee_change_events (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_change_events_term   ON fee_change_events (term_id);
CREATE INDEX IF NOT EXISTS idx_fee_change_events_head   ON fee_change_events (fee_head_id);

-- RLS: same tenant-scoped protection as every other finance table
-- (inline JWT check — no helper functions required)
ALTER TABLE fee_change_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fee_change_events') THEN
    CREATE POLICY tenant_select_fee_change_events ON fee_change_events
      FOR SELECT USING (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_insert_fee_change_events ON fee_change_events
      FOR INSERT WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_update_fee_change_events ON fee_change_events
      FOR UPDATE USING (school_id::text = auth.jwt() ->> 'school_id')
      WITH CHECK (school_id::text = auth.jwt() ->> 'school_id');
    CREATE POLICY tenant_delete_fee_change_events ON fee_change_events
      FOR DELETE USING (school_id::text = auth.jwt() ->> 'school_id');
  END IF;
END;
$$;

-- Ownership: service role owns writes through the API; the RLS policies above
-- are defence-in-depth for any future client-side access. No grant is made to
-- anon/authenticated roles beyond standard table defaults.
