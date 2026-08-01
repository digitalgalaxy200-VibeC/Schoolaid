-- ============================================================
-- SchoolAid Staging Setup — Test School + Basic 1
-- Run this ENTIRE script in your Supabase SQL Editor (staging)
-- Safe to re-run: uses IF NOT EXISTS / DO blocks
-- ============================================================

DO $$
DECLARE
  v_school_id UUID;
  v_session_id UUID;
  v_term_id UUID;
  v_class_id UUID;
  v_teacher_id UUID;
  v_template_id UUID;
  v_user_id UUID;
  v_sub_id UUID;
  v_student_id UUID;
  rec RECORD;
BEGIN
  -- ─── 1. SCHOOL ───────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM schools WHERE slug = 'test-staging') THEN
    INSERT INTO schools (name, slug, abbreviation, address, phone, email, motto, subscription_status, subscription_plan)
    VALUES ('Test', 'test-staging', 'tst', '123 Test Street', '08000000000', 'admin@test.com', 'Testing Excellence', 'active', 'free')
    RETURNING id INTO v_school_id;
    RAISE NOTICE '✅ School created: %', v_school_id;
  ELSE
    SELECT id INTO v_school_id FROM schools WHERE slug = 'test-staging';
    RAISE NOTICE '⏭️ School exists: %', v_school_id;
  END IF;

  -- ─── 2. ACADEMIC SESSION ─────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM academic_sessions WHERE school_id = v_school_id AND name = '2025/2026') THEN
    INSERT INTO academic_sessions (school_id, name, start_date, end_date, is_active)
    VALUES (v_school_id, '2025/2026', '2025-09-01', '2026-07-31', true)
    RETURNING id INTO v_session_id;
    RAISE NOTICE '✅ Session created: 2025/2026';
  ELSE
    SELECT id INTO v_session_id FROM academic_sessions WHERE school_id = v_school_id AND name = '2025/2026';
  END IF;

  -- ─── 3. TERM ─────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM academic_terms WHERE school_id = v_school_id AND name = 'Second Term') THEN
    INSERT INTO academic_terms (school_id, session_id, name, start_date, end_date, is_active)
    VALUES (v_school_id, v_session_id, 'Second Term', '2026-01-12', '2026-04-10', true)
    RETURNING id INTO v_term_id;
    RAISE NOTICE '✅ Term created: Second Term';
  ELSE
    SELECT id INTO v_term_id FROM academic_terms WHERE school_id = v_school_id AND name = 'Second Term';
  END IF;

  -- ─── 4. CLASS ────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM classes WHERE school_id = v_school_id AND name = 'Basic 1') THEN
    INSERT INTO classes (school_id, name, grade_level)
    VALUES (v_school_id, 'Basic 1', 'Basic')
    RETURNING id INTO v_class_id;
    RAISE NOTICE '✅ Class created: Basic 1';
  ELSE
    SELECT id INTO v_class_id FROM classes WHERE school_id = v_school_id AND name = 'Basic 1';
  END IF;

  -- ─── 5. TEACHER ──────────────────────────────────────────
  -- Create auth user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'teacher@tst.com') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
    VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
      'teacher@tst.com',
      crypt('tsttsttst123', gen_salt('bf')),
      now(),
      '{"full_name":"Test Teacher","role":"teacher"}'::jsonb,
      'authenticated', 'authenticated'
    )
    RETURNING id INTO v_user_id;

    -- Profile (trigger should handle this, but be explicit)
    UPDATE profiles SET school_id = v_school_id, role = 'teacher', is_active = true
    WHERE id = v_user_id;

    RAISE NOTICE '✅ Teacher auth user created';
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'teacher@tst.com';
    UPDATE profiles SET school_id = v_school_id, role = 'teacher', is_active = true WHERE id = v_user_id;
  END IF;

  -- Create teacher record (base columns only)
  IF NOT EXISTS (SELECT 1 FROM teachers WHERE profile_id = v_user_id) THEN
    INSERT INTO teachers (school_id, profile_id, staff_role)
    VALUES (v_school_id, v_user_id, 'Class Teacher')
    RETURNING id INTO v_teacher_id;
    RAISE NOTICE '✅ Teacher record created';
  ELSE
    SELECT id INTO v_teacher_id FROM teachers WHERE profile_id = v_user_id;
  END IF;

  -- Assign teacher to class as primary
  INSERT INTO class_teachers (school_id, class_id, teacher_id, role, is_active)
  VALUES (v_school_id, v_class_id, v_teacher_id, 'primary', true)
  ON CONFLICT (school_id, class_id, teacher_id) DO UPDATE SET role = 'primary', is_active = true;

  RAISE NOTICE '✅ Teacher assigned to Basic 1 as primary';

  -- ─── 6. STUDENTS (5) ─────────────────────────────────────
  -- Create each student
  FOR rec IN 
    SELECT * FROM (VALUES
      ('Amina', 'Bello', 'aminabello@tst.com', 'TST/2025/0001', 'Female', '2015-01-01'),
      ('Chidi', 'Okafor', 'chidiokafor@tst.com', 'TST/2025/0002', 'Male', '2015-02-01'),
      ('Fatima', 'Yusuf', 'fatimayusuf@tst.com', 'TST/2025/0003', 'Female', '2015-03-01'),
      ('John', 'Musa', 'johnmusa@tst.com', 'TST/2025/0004', 'Male', '2015-04-01'),
      ('Ngozi', 'Eze', 'ngozieze@tst.com', 'TST/2025/0005', 'Female', '2015-05-01')
    ) AS t(first_name, last_name, email, student_no, gender, dob)
  LOOP
    -- Create auth user
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = rec.email) THEN
      INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, aud, role)
      VALUES (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
        rec.email,
        crypt('tsttsttst123', gen_salt('bf')),
        now(),
        jsonb_build_object('full_name', rec.first_name || ' ' || rec.last_name, 'role', 'student'),
        'authenticated', 'authenticated'
      )
      RETURNING id INTO v_user_id;

      UPDATE profiles SET school_id = v_school_id, full_name = rec.first_name || ' ' || rec.last_name, role = 'student', is_active = true
      WHERE id = v_user_id;

      RAISE NOTICE '✅ Auth user created: %', rec.email;
    ELSE
      SELECT id INTO v_user_id FROM auth.users WHERE email = rec.email;
      UPDATE profiles SET school_id = v_school_id, role = 'student', is_active = true WHERE id = v_user_id;
    END IF;

    -- Create student record (base columns only for staging compatibility)
    IF NOT EXISTS (SELECT 1 FROM students WHERE profile_id = v_user_id) THEN
      INSERT INTO students (school_id, profile_id, student_id, class_id, date_of_birth, gender)
      VALUES (v_school_id, v_user_id, rec.student_no, v_class_id, rec.dob::date, rec.gender)
      RETURNING id INTO v_student_id;
      RAISE NOTICE '   Student record: % % (%)', rec.first_name, rec.last_name, rec.student_no;
    END IF;
  END LOOP;

  -- ─── 7. SUBJECTS (5) ─────────────────────────────────────
  FOR rec IN 
    SELECT * FROM (VALUES
      ('English Studies', 'ES'),
      ('Mathematics', 'M'),
      ('Basic Science', 'BS'),
      ('Social Studies', 'SS'),
      ('Creative Arts', 'CA')
    ) AS t(name, code)
  LOOP
    -- Create subject if not exists
    IF NOT EXISTS (SELECT 1 FROM subjects WHERE school_id = v_school_id AND name = rec.name) THEN
      INSERT INTO subjects (school_id, name, code, is_active)
      VALUES (v_school_id, rec.name, rec.code, true)
      RETURNING id INTO v_sub_id;
      RAISE NOTICE '✅ Subject: %', rec.name;
    ELSE
      SELECT id INTO v_sub_id FROM subjects WHERE school_id = v_school_id AND name = rec.name;
    END IF;

    -- Assign to class
    INSERT INTO class_subjects (school_id, class_id, subject_id, is_active)
    VALUES (v_school_id, v_class_id, v_sub_id, true)
    ON CONFLICT (school_id, class_id, subject_id) DO UPDATE SET is_active = true;

    -- Assign teacher to subject
    INSERT INTO teacher_subjects (school_id, teacher_id, subject_id, class_id, academic_term_id, role, is_active)
    VALUES (v_school_id, v_teacher_id, v_sub_id, v_class_id, v_term_id, 'primary', true)
    ON CONFLICT (teacher_id, subject_id, class_id, academic_term_id) DO UPDATE SET is_active = true, teacher_id = v_teacher_id;
  END LOOP;
  RAISE NOTICE '✅ 5 subjects assigned to Basic 1 + teacher';

  -- ─── 8. ASSESSMENT COMPONENTS ─────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM class_components_templates WHERE class_id = v_class_id) THEN
    -- Create template
    INSERT INTO components_templates (school_id, name)
    VALUES (v_school_id, 'Basic Assessment Components')
    RETURNING id INTO v_template_id;

    -- Create component rows
    INSERT INTO components_rows (template_id, name, maximum_score, display_order) VALUES
      (v_template_id, 'First Test', 20, 1),
      (v_template_id, 'Second Test', 20, 2),
      (v_template_id, 'Exam', 60, 3);

    -- Link to class
    INSERT INTO class_components_templates (school_id, class_id, template_id)
    VALUES (v_school_id, v_class_id, v_template_id);

    RAISE NOTICE '✅ Assessment template: First Test(20) + Second Test(20) + Exam(60)';
  ELSE
    RAISE NOTICE '⏭️ Assessment template already exists';
  END IF;

  -- ─── 9. ENABLE AI IMPORT FEATURE FLAG ────────────────────
  INSERT INTO school_features (school_id, feature_key, is_enabled)
  VALUES (v_school_id, 'ai_import', true)
  ON CONFLICT (school_id, feature_key) DO UPDATE SET is_enabled = true;

  RAISE NOTICE '✅ AI Import feature ENABLED for Test school';

  -- ─── 10. FINAL SUMMARY ───────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════';
  RAISE NOTICE '  SETUP COMPLETE';
  RAISE NOTICE '═══════════════════════════════════════';
  RAISE NOTICE 'School:    Test (% )', v_school_id;
  RAISE NOTICE 'Class:     Basic 1';
  RAISE NOTICE 'Teacher:   teacher@tst.com / tsttsttst123';
  RAISE NOTICE 'Students:  5 (all: tsttsttst123)';
  RAISE NOTICE 'Subjects:  5';
  RAISE NOTICE 'AI Import: ENABLED';
  RAISE NOTICE '═══════════════════════════════════════';
END $$;
