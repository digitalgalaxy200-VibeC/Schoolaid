-- Prevent duplicate terms within the same session
ALTER TABLE academic_terms ADD CONSTRAINT IF NOT EXISTS uq_terms_session_name UNIQUE(school_id, session_id, name);
