-- ============================================================================
-- SchoolAid — Add abbreviation column to schools and backfill
-- ============================================================================

-- Add column if not exists
ALTER TABLE schools ADD COLUMN IF NOT EXISTS abbreviation TEXT;

-- Create a temporary function to generate initials
CREATE OR REPLACE FUNCTION generate_initials(school_name TEXT) 
RETURNS TEXT AS $$
DECLARE
  words TEXT[];
  initials TEXT := '';
  w TEXT;
BEGIN
  -- Split by space
  words := string_to_array(trim(school_name), ' ');
  
  -- If only one word, use first 3 letters or whole word if shorter
  IF array_length(words, 1) = 1 THEN
    RETURN lower(substring(words[1] from 1 for 3));
  END IF;

  -- Otherwise, grab first letter of each word
  FOREACH w IN ARRAY words LOOP
    IF length(w) > 0 THEN
      initials := initials || lower(substring(w from 1 for 1));
    END IF;
  END LOOP;
  
  RETURN initials;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing schools
UPDATE schools SET abbreviation = generate_initials(name) WHERE abbreviation IS NULL;

-- Make abbreviation NOT NULL now that it's backfilled
ALTER TABLE schools ALTER COLUMN abbreviation SET NOT NULL;

-- Drop the temp function
DROP FUNCTION generate_initials(TEXT);
