-- ============================================================================
-- Reset Still Waters School Admin Password
-- Run this in Supabase SQL Editor (production project)
-- ============================================================================

DO $$
DECLARE
  _school_id UUID;
  _admin_profile_id UUID;
  _admin_email TEXT;
  _admin_name TEXT;
  _new_password TEXT;
BEGIN
  -- Find the Still Waters school
  SELECT id INTO _school_id FROM schools WHERE name ILIKE '%Still%Waters%' OR slug ILIKE '%still%waters%';
  
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'School "Still Waters" not found. Check the school name exactly.';
  END IF;

  -- Find the school admin's profile
  SELECT sa.profile_id, p.email, CONCAT(sa.first_name, ' ', sa.last_name)
  INTO _admin_profile_id, _admin_email, _admin_name
  FROM school_admins sa
  JOIN profiles p ON p.id = sa.profile_id
  WHERE sa.school_id = _school_id
  LIMIT 1;

  IF _admin_profile_id IS NULL THEN
    RAISE EXCEPTION 'No school admin found for school: %', _school_id;
  END IF;

  -- Generate a readable password
  _new_password := 'SA-' || LEFT(REPLACE(_school_id::TEXT, '-', ''), 6) || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);

  -- Update auth.users password
  UPDATE auth.users
  SET encrypted_password = crypt(_new_password, gen_salt('bf')),
      updated_at = NOW()
  WHERE id = _admin_profile_id;

  -- Update school_admins record
  UPDATE school_admins
  SET generated_password = _new_password,
      must_change_password = TRUE
  WHERE profile_id = _admin_profile_id;

  -- Show the credentials
  RAISE NOTICE '========================================';
  RAISE NOTICE 'CREDENTIALS FOR: %', _admin_name;
  RAISE NOTICE 'Email:    %', _admin_email;
  RAISE NOTICE 'Password: %', _new_password;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Admin will be forced to change password on first login.';
END $$;
