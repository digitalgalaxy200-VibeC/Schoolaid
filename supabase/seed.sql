-- ============================================================================
-- SchoolAid — Multi-School Seed Script (Ticket 1.6)
-- Idempotent: safe to run multiple times (deletes first).
-- Creates auth users + profiles + 2 schools with distinct configurations.
-- Trigger `on_auth_user_created` auto-creates basic profiles on insert.
-- We UPDATE school_id on those profiles afterward.
-- ============================================================================

-- Clean existing data (in dependency order)
DELETE FROM attendance;
DELETE FROM student_grades;
DELETE FROM assessments;
DELETE FROM enrollments;
DELETE FROM teacher_subjects;
DELETE FROM students;
DELETE FROM teachers;
DELETE FROM classes;
DELETE FROM subjects;
DELETE FROM academic_terms;
DELETE FROM academic_sessions;
DELETE FROM schools;
DELETE FROM auth.users WHERE email LIKE '%@greenvalley.edu'
   OR email LIKE '%@brightfuture.edu'
   OR email = 'superadmin@schoolaid.com';

-- ============================================================================
-- Helper: Create an auth user and return the ID
-- Uses pgcrypto for password hashing
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  _uid UUID;
  _now TIMESTAMPTZ := NOW();
BEGIN
  -- ==========================================================================
  -- SUPER ADMIN (school_id = NULL)
  -- ==========================================================================
  _uid := '00000000-0000-0000-0000-000000000000';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
  VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'superadmin@schoolaid.com',
    crypt('admin123', gen_salt('bf')), _now, '{"full_name":"Super Admin","role":"super_admin"}', _now, _now, false);

  -- ==========================================================================
  -- SCHOOL 1: Green Valley Academy
  -- ==========================================================================
  INSERT INTO schools (id, name, slug, address, phone, email, grading_scale)
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Green Valley Academy',
    'green-valley-academy',
    '123 Education Lane, Springfield, IL',
    '+1 (555) 010-1000',
    'admin@greenvalley.edu',
    '{"A": 90, "B": 75, "C": 60, "D": 50, "F": 0}'::JSONB
  );

  -- School Admin
  _uid := '00000000-0000-0000-0000-000000000400';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
  VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@greenvalley.edu',
    crypt('admin123', gen_salt('bf')), _now, '{"full_name":"Green Valley Admin","role":"school_admin"}', _now, _now, false);

  -- Academic Session
  INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_active)
  VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', '2024–2025', '2024-09-01', '2025-06-30', true);

  -- Academic Term
  INSERT INTO academic_terms (id, school_id, name, start_date, end_date, is_active)
  VALUES ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000001', 'Spring 2025', '2025-01-06', '2025-06-20', true);

  -- Classes
  INSERT INTO classes (id, school_id, name, description, grade_level, academic_session_id) VALUES
    ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Grade 10A', 'Grade 10 – Section A', '10', '00000000-0000-0000-0000-000000000101'),
    ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'Grade 10B', 'Grade 10 – Section B', '10', '00000000-0000-0000-0000-000000000101'),
    ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001', 'Grade 11A', 'Grade 11 – Section A', '11', '00000000-0000-0000-0000-000000000101');

  -- Subjects
  INSERT INTO subjects (id, school_id, name, code, description) VALUES
    ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Mathematics', 'MATH', 'Advanced Mathematics'),
    ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'English Literature', 'ENG', 'English Language & Literature'),
    ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 'Physics', 'PHY', 'Physics'),
    ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001', 'Chemistry', 'CHM', 'Chemistry');

  -- Teachers (3 teachers)
  FOR _uid IN SELECT unnest(ARRAY[
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000403'
  ]) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
    VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000401' THEN 'sarah.johnson@greenvalley.edu'
        WHEN '00000000-0000-0000-0000-000000000402' THEN 'michael.chen@greenvalley.edu'
        ELSE 'emily.rodriguez@greenvalley.edu'
      END,
      crypt('password123', gen_salt('bf')), _now,
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000401' THEN '{"full_name":"Sarah Johnson","role":"teacher"}'
        WHEN '00000000-0000-0000-0000-000000000402' THEN '{"full_name":"Michael Chen","role":"teacher"}'
        ELSE '{"full_name":"Emily Rodriguez","role":"teacher"}'
      END::JSONB, _now, _now, false);
  END LOOP;

  INSERT INTO teachers (id, school_id, profile_id, employee_id, qualification, specialization) VALUES
    ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000401', 'T-001', 'M.Sc. Mathematics', 'Algebra & Calculus'),
    ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000402', 'T-002', 'M.A. English', 'Shakespeare & Poetry'),
    ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000403', 'T-003', 'M.Sc. Physics', 'Quantum Mechanics');

  -- Teacher ↔ Subject ↔ Class assignments
  INSERT INTO teacher_subjects (id, school_id, teacher_id, subject_id, class_id, academic_term_id) VALUES
    ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000604', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000111');

  -- Students (5 students)
  FOR _uid IN SELECT unnest(ARRAY[
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000000703',
    '00000000-0000-0000-0000-000000000704',
    '00000000-0000-0000-0000-000000000705'
  ]) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
    VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000701' THEN 'alex.thompson@greenvalley.edu'
        WHEN '00000000-0000-0000-0000-000000000702' THEN 'maria.garcia@greenvalley.edu'
        WHEN '00000000-0000-0000-0000-000000000703' THEN 'james.wilson@greenvalley.edu'
        WHEN '00000000-0000-0000-0000-000000000704' THEN 'sophia.lee@greenvalley.edu'
        ELSE 'daniel.brown@greenvalley.edu'
      END,
      crypt('password123', gen_salt('bf')), _now,
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000701' THEN '{"full_name":"Alex Thompson","role":"student"}'
        WHEN '00000000-0000-0000-0000-000000000702' THEN '{"full_name":"Maria Garcia","role":"student"}'
        WHEN '00000000-0000-0000-0000-000000000703' THEN '{"full_name":"James Wilson","role":"student"}'
        WHEN '00000000-0000-0000-0000-000000000704' THEN '{"full_name":"Sophia Lee","role":"student"}'
        ELSE '{"full_name":"Daniel Brown","role":"student"}'
      END::JSONB, _now, _now, false);
  END LOOP;

  INSERT INTO students (id, school_id, profile_id, student_id, class_id, enrollment_date) VALUES
    ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000701', 'S-001', '00000000-0000-0000-0000-000000000201', '2024-09-01'),
    ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000702', 'S-002', '00000000-0000-0000-0000-000000000201', '2024-09-01'),
    ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000703', 'S-003', '00000000-0000-0000-0000-000000000202', '2024-09-01'),
    ('00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000704', 'S-004', '00000000-0000-0000-0000-000000000202', '2024-09-01'),
    ('00000000-0000-0000-0000-000000000805', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000705', 'S-005', '00000000-0000-0000-0000-000000000203', '2024-09-01');

  -- Enrollments
  INSERT INTO enrollments (id, school_id, student_id, class_id, academic_term_id) VALUES
    ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000111'),
    ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000805', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000111');

  -- ==========================================================================
  -- SCHOOL 2: Bright Future College
  -- ==========================================================================
  INSERT INTO schools (id, name, slug, address, phone, email, grading_scale)
  VALUES (
    '00000000-0000-0000-0000-000000000002',
    'Bright Future College',
    'bright-future-college',
    '456 Knowledge Blvd, Oakwood, CA',
    '+1 (555) 020-2000',
    'admin@brightfuture.edu',
    '{"A": 85, "B": 70, "C": 55, "D": 40, "F": 0}'::JSONB
  );

  -- School Admin
  _uid := '00000000-0000-0000-0000-000000000410';
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
  VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@brightfuture.edu',
    crypt('admin123', gen_salt('bf')), _now, '{"full_name":"Bright Future Admin","role":"school_admin"}', _now, _now, false);

  -- Academic Session
  INSERT INTO academic_sessions (id, school_id, name, start_date, end_date, is_active)
  VALUES ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002', '2024–2025', '2024-08-15', '2025-06-15', true);

  -- Academic Term
  INSERT INTO academic_terms (id, school_id, name, start_date, end_date, is_active)
  VALUES ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-000000000002', 'Spring 2025', '2025-01-13', '2025-06-15', true);

  -- Classes
  INSERT INTO classes (id, school_id, name, description, grade_level, academic_session_id) VALUES
    ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000002', 'Grade 9A', 'Grade 9 – Section A', '9', '00000000-0000-0000-0000-000000000102'),
    ('00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000002', 'Grade 9B', 'Grade 9 – Section B', '9', '00000000-0000-0000-0000-000000000102');

  -- Subjects
  INSERT INTO subjects (id, school_id, name, code, description) VALUES
    ('00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000002', 'Mathematics', 'MATH', 'Foundational Mathematics'),
    ('00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000002', 'English', 'ENG', 'English Language Arts'),
    ('00000000-0000-0000-0000-000000000313', '00000000-0000-0000-0000-000000000002', 'Science', 'SCI', 'General Science');

  -- Teachers
  FOR _uid IN SELECT unnest(ARRAY[
    '00000000-0000-0000-0000-000000000411',
    '00000000-0000-0000-0000-000000000412',
    '00000000-0000-0000-0000-000000000413'
  ]) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
    VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000411' THEN 'david.kim@brightfuture.edu'
        WHEN '00000000-0000-0000-0000-000000000412' THEN 'lisa.patel@brightfuture.edu'
        ELSE 'robert.turner@brightfuture.edu'
      END,
      crypt('password123', gen_salt('bf')), _now,
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000411' THEN '{"full_name":"David Kim","role":"teacher"}'
        WHEN '00000000-0000-0000-0000-000000000412' THEN '{"full_name":"Lisa Patel","role":"teacher"}'
        ELSE '{"full_name":"Robert Turner","role":"teacher"}'
      END::JSONB, _now, _now, false);
  END LOOP;

  INSERT INTO teachers (id, school_id, profile_id, employee_id, qualification, specialization) VALUES
    ('00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000411', 'T-101', 'B.Sc. Mathematics', 'Algebra'),
    ('00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000412', 'T-102', 'M.A. English', 'Creative Writing'),
    ('00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000413', 'T-103', 'M.Sc. Biology', 'Life Sciences');

  -- Teacher ↔ Subject ↔ Class assignments
  INSERT INTO teacher_subjects (id, school_id, teacher_id, subject_id, class_id, academic_term_id) VALUES
    ('00000000-0000-0000-0000-000000000611', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000511', '00000000-0000-0000-0000-000000000311', '00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000613', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000512', '00000000-0000-0000-0000-000000000312', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000614', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000513', '00000000-0000-0000-0000-000000000313', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000112');

  -- Students (4 students)
  FOR _uid IN SELECT unnest(ARRAY[
    '00000000-0000-0000-0000-000000000711',
    '00000000-0000-0000-0000-000000000712',
    '00000000-0000-0000-0000-000000000713',
    '00000000-0000-0000-0000-000000000714'
  ]) LOOP
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, is_sso_user)
    VALUES (_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000711' THEN 'olivia.martinez@brightfuture.edu'
        WHEN '00000000-0000-0000-0000-000000000712' THEN 'ethan.davis@brightfuture.edu'
        WHEN '00000000-0000-0000-0000-000000000713' THEN 'ava.white@brightfuture.edu'
        ELSE 'noah.taylor@brightfuture.edu'
      END,
      crypt('password123', gen_salt('bf')), _now,
      CASE _uid
        WHEN '00000000-0000-0000-0000-000000000711' THEN '{"full_name":"Olivia Martinez","role":"student"}'
        WHEN '00000000-0000-0000-0000-000000000712' THEN '{"full_name":"Ethan Davis","role":"student"}'
        WHEN '00000000-0000-0000-0000-000000000713' THEN '{"full_name":"Ava White","role":"student"}'
        ELSE '{"full_name":"Noah Taylor","role":"student"}'
      END::JSONB, _now, _now, false);
  END LOOP;

  INSERT INTO students (id, school_id, profile_id, student_id, class_id, enrollment_date) VALUES
    ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000711', 'S-101', '00000000-0000-0000-0000-000000000211', '2024-08-15'),
    ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000712', 'S-102', '00000000-0000-0000-0000-000000000211', '2024-08-15'),
    ('00000000-0000-0000-0000-000000000813', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000713', 'S-103', '00000000-0000-0000-0000-000000000212', '2024-08-15'),
    ('00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000714', 'S-104', '00000000-0000-0000-0000-000000000212', '2024-08-15');

  -- Enrollments
  INSERT INTO enrollments (id, school_id, student_id, class_id, academic_term_id) VALUES
    ('00000000-0000-0000-0000-000000000911', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000912', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000913', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000813', '00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000112'),
    ('00000000-0000-0000-0000-000000000914', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000814', '00000000-0000-0000-0000-000000000212', '00000000-0000-0000-0000-000000000112');

  -- ==========================================================================
  -- Update auto-created profiles with school_id
  -- The trigger `on_auth_user_created` created basic profiles; now we set
  -- their school_id so RLS works correctly.
  -- ==========================================================================
  UPDATE profiles SET school_id = '00000000-0000-0000-0000-000000000001'
  WHERE email LIKE '%@greenvalley.edu';

  UPDATE profiles SET school_id = '00000000-0000-0000-0000-000000000002'
  WHERE email LIKE '%@brightfuture.edu';

  -- super_admin stays school_id = NULL

  RAISE NOTICE '✅ Seed complete: 2 schools, 1 super admin, 2 school admins, 6 teachers, 9 students';
END;
$$;
