-- Link terms to their parent session
ALTER TABLE academic_terms ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES academic_sessions(id) ON DELETE CASCADE;
