-- ============================================================================
-- SchoolAid — STAGING COMPLETE SCHEMA
-- Generated: 2026-07-13
-- Source: All migration files concatenated in order
--         (001 → 014, with 006/008/009/012 prefix variants)
--
-- This file is IDEMPOTENT — safe to run repeatedly on a fresh database.
-- All CREATE TABLE use IF NOT EXISTS.
-- All ALTER TABLE ADD COLUMN use IF NOT EXISTS.
-- All DROP use IF EXISTS.
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
-- gen_random_uuid() is used throughout instead of uuid_generate_v4

-- ============================================================================
-- MIGRATION 001: Initial Schema + RLS + JWT Claims + Indexes
-- ============================================================================
-- This migration is idempotent: safe to run multiple times on a fresh DB.
-- Schools in this file: "Super Admin" tables omit school_id; all tenant
-- tables include it for Row-Level Security enforcement.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. TABLES
-- --------------------------------------------------------------------------

-- 1a. Schools (tenant root — no school_id here)
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  grading_scale JSONB NOT NULL DEFAULT '{"A": 90, "B": 80, "C": 70, "D": 60, "F": 0}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1b. Profiles (extends auth.users — one row per auth user)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher', 'student')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- super_admin profiles have school_id = NULL

-- 1c. Academic Terms (e.g. "Spring 2025", "Fall 2025")
CREATE TABLE IF NOT EXISTS academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1d. Academic Sessions (e.g. "2024–2025")
CREATE TABLE IF NOT EXISTS academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1e. Classes
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  grade_level TEXT,
  academic_session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1f. Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1g. Teachers (extends profiles where role = 'teacher')
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id TEXT,
  qualification TEXT,
  specialization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

-- 1h. Students (extends profiles where role = 'student')
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id TEXT,
  date_of_birth DATE,
  enrollment_date DATE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

-- 1i. Teacher ↔ Subject ↔ Class assignments
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(teacher_id, subject_id, class_id, academic_term_id)
);

-- 1j. Enrollments (students in classes)
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  academic_term_id UUID REFERENCES academic_terms(id) ON DELETE SET NULL,
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, class_id, academic_term_id)
);

-- 1k. Assessments (exams, quizzes, assignments, projects)
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_subject_id UUID NOT NULL REFERENCES teacher_subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('exam', 'quiz', 'assignment', 'project', 'other')),
  max_score DECIMAL(10,2) NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1l. Student Grades
CREATE TABLE IF NOT EXISTS student_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, assessment_id)
);

-- 1m. Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, class_id, date)
);

-- --------------------------------------------------------------------------
-- 2. AUTO-UPDATE updated_at TRIGGER (all tables with updated_at)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply to all tables that have updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'schools', 'profiles', 'academic_terms', 'academic_sessions',
    'classes', 'subjects', 'teachers', 'students', 'assessments', 'student_grades'
  ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS update_%I_updated_at ON %I;
       CREATE TRIGGER update_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column()',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- 3. AUTO-PROFILE CREATION TRIGGER (on auth.users insert)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'student')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- --------------------------------------------------------------------------
-- 4. CUSTOM JWT CLAIMS HOOK (Ticket 1.3) — ORIGINAL VERSION FROM 001
--    NOTE: This function is replaced by the simplified version in Migration 003.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION custom_jwt_claims()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  user_profile public.profiles%ROWTYPE;
  teacher_record public.teachers%ROWTYPE;
  student_record public.students%ROWTYPE;
  claims JSONB;
BEGIN
  SELECT * INTO user_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN '{}'::JSONB;
  END IF;

  claims := jsonb_build_object(
    'role',          user_profile.role,
    'school_id',     user_profile.school_id,
    'is_active',     user_profile.is_active
  );

  IF user_profile.role = 'teacher' THEN
    SELECT * INTO teacher_record FROM public.teachers WHERE profile_id = auth.uid() LIMIT 1;
    IF FOUND THEN
      claims := claims || jsonb_build_object('teacher_id', teacher_record.id);
    END IF;
  ELSIF user_profile.role = 'student' THEN
    SELECT * INTO student_record FROM public.students WHERE profile_id = auth.uid() LIMIT 1;
    IF FOUND THEN
      claims := claims || jsonb_build_object('student_id', student_record.id);
    END IF;
  END IF;

  RETURN claims;
END;
$$;

-- Grant usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY POLICIES (Ticket 1.4)
--    Pattern: school_id = (auth.jwt() ->> 'school_id')::uuid
--    Super Admin (school_id IS NULL) sees all rows in their domain.
-- --------------------------------------------------------------------------

-- Helper: Returns the current user's school_id from JWT (nullable for super_admin)
CREATE OR REPLACE FUNCTION get_jwt_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT (auth.jwt() ->> 'school_id')::UUID;
$$;

-- Helper: Returns the current user's role from JWT
CREATE OR REPLACE FUNCTION get_jwt_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT auth.jwt() ->> 'role';
$$;

-- Helper: Returns true if current user is a super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT get_jwt_role() = 'super_admin';
$$;

-- Helper: Tenant isolation policy — row is visible if:
--   (a) user is super_admin, OR
--   (b) row's school_id matches the user's JWT school_id
CREATE OR REPLACE FUNCTION tenant_policy()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT 'school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin()';
$$;

-- Apply RLS + policies to every tenant table
DO $$
DECLARE
  tables_with_school_id TEXT[] := ARRAY[
    'profiles', 'academic_terms', 'academic_sessions', 'classes',
    'subjects', 'teachers', 'students', 'teacher_subjects',
    'enrollments', 'assessments', 'student_grades', 'attendance'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_with_school_id
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    -- SELECT policy
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_select_%I ON %I;', t, t
    );
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON %I
         FOR SELECT
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    -- INSERT policy: user can only insert rows for their own school
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_insert_%I ON %I;', t, t
    );
    EXECUTE format(
      'CREATE POLICY tenant_insert_%I ON %I
         FOR INSERT
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    -- UPDATE policy
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_update_%I ON %I;', t, t
    );
    EXECUTE format(
      'CREATE POLICY tenant_update_%I ON %I
         FOR UPDATE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin())
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );

    -- DELETE policy
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_delete_%I ON %I;', t, t
    );
    EXECUTE format(
      'CREATE POLICY tenant_delete_%I ON %I
         FOR DELETE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t
    );
  END LOOP;
END;
$$;

-- Special: schools table — all authenticated users can SELECT, only super_admin can mutate
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schools_select ON schools;
CREATE POLICY schools_select ON schools
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS schools_insert ON schools;
CREATE POLICY schools_insert ON schools
  FOR INSERT
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS schools_update ON schools;
CREATE POLICY schools_update ON schools
  FOR UPDATE
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS schools_delete ON schools;
CREATE POLICY schools_delete ON schools
  FOR DELETE
  USING (is_super_admin());

-- Teacher-scoped tables additionally restrict by assigned class/subject
DROP POLICY IF EXISTS teacher_assessments ON assessments;
CREATE POLICY teacher_assessments ON assessments
  FOR SELECT
  USING (
    school_id = (auth.jwt() ->> 'school_id')::UUID
    AND (
      is_super_admin()
      OR get_jwt_role() = 'school_admin'
      OR (
        get_jwt_role() = 'teacher'
        AND teacher_subject_id IN (
          SELECT id FROM teacher_subjects
          WHERE teacher_id = (auth.jwt() ->> 'teacher_id')::UUID
        )
      )
    )
  );

-- --------------------------------------------------------------------------
-- 6. PARTIAL UNIQUE INDEXES — Active Term/Session (Ticket 1.5)
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_term_per_school
  ON academic_terms (school_id) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_school
  ON academic_sessions (school_id) WHERE is_active = true;

-- --------------------------------------------------------------------------
-- 7. PERFORMANCE INDEXES
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles (school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles (role);
CREATE INDEX IF NOT EXISTS idx_teachers_school_id ON teachers (school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_profile_id ON teachers (profile_id);
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_profile_id ON students (profile_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students (class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON teacher_subjects (teacher_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments (class_id);
CREATE INDEX IF NOT EXISTS idx_assessments_teacher_subject ON assessments (teacher_subject_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_student ON student_grades (student_id);
CREATE INDEX IF NOT EXISTS idx_student_grades_assessment ON student_grades (assessment_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance (date);


-- ============================================================================
-- MIGRATION 002: Super Admin Core
-- Adds tables for school admin accounts, subscriptions, and support logs.
-- ============================================================================

-- 1. Add subscription fields to schools (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_status') THEN
    ALTER TABLE schools ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_plan') THEN
    ALTER TABLE schools ADD COLUMN subscription_plan TEXT DEFAULT 'free';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'subscription_expiry') THEN
    ALTER TABLE schools ADD COLUMN subscription_expiry TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'motto') THEN
    ALTER TABLE schools ADD COLUMN motto TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'website') THEN
    ALTER TABLE schools ADD COLUMN website TEXT;
  END IF;
END;
$$;

-- 2. School Admins table (links auth user to school as admin)
CREATE TABLE IF NOT EXISTS school_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'disabled')),
  generated_password TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id),
  UNIQUE(school_id, profile_id)
);

-- 3. Subscriptions table (billing history)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'suspended', 'cancelled')),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date TIMESTAMPTZ,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  amount DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Support Logs (impersonation audit trail)
CREATE TABLE IF NOT EXISTS support_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  super_admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  impersonation_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS for new tables

-- School Admins: only super_admin and the school's own admins can see
ALTER TABLE school_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_admins_select ON school_admins;
CREATE POLICY school_admins_select ON school_admins
  FOR SELECT USING (
    is_super_admin()
    OR school_id = (auth.jwt() ->> 'school_id')::UUID
  );

DROP POLICY IF EXISTS school_admins_insert ON school_admins;
CREATE POLICY school_admins_insert ON school_admins
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS school_admins_update ON school_admins;
CREATE POLICY school_admins_update ON school_admins
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Subscriptions: super_admin only (billing is sensitive)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT USING (
    is_super_admin()
    OR school_id = (auth.jwt() ->> 'school_id')::UUID
  );

DROP POLICY IF EXISTS subscriptions_insert ON subscriptions;
CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS subscriptions_update ON subscriptions;
CREATE POLICY subscriptions_update ON subscriptions
  FOR UPDATE USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Support Logs: super_admin only
ALTER TABLE support_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_logs_select ON support_logs;
CREATE POLICY support_logs_select ON support_logs
  FOR SELECT USING (is_super_admin());

DROP POLICY IF EXISTS support_logs_insert ON support_logs;
CREATE POLICY support_logs_insert ON support_logs
  FOR INSERT WITH CHECK (is_super_admin());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_admins_school ON school_admins (school_id);
CREATE INDEX IF NOT EXISTS idx_school_admins_profile ON school_admins (profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_school ON subscriptions (school_id);
CREATE INDEX IF NOT EXISTS idx_support_logs_school ON support_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_support_logs_created ON support_logs (created_at DESC);

-- Trigger for school_admins updated_at
DROP TRIGGER IF EXISTS update_school_admins_updated_at ON school_admins;
CREATE TRIGGER update_school_admins_updated_at
  BEFORE UPDATE ON school_admins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- MIGRATION 003: Simplify JWT Claims
-- Replaces the custom_jwt_claims() function with a simplified version
-- that handles edge cases (null uid, missing profile, etc.).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.custom_jwt_claims()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _uid UUID;
  _role TEXT;
  _school_id UUID;
  _is_active BOOLEAN;
BEGIN
  BEGIN
    _uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::JSONB;
  END;

  IF _uid IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  BEGIN
    SELECT p.role, p.school_id, p.is_active
    INTO _role, _school_id, _is_active
    FROM public.profiles p
    WHERE p.id = _uid;
  EXCEPTION WHEN OTHERS THEN
    RETURN '{}'::JSONB;
  END;

  IF _role IS NULL THEN
    RETURN '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'role', _role,
    'school_id', _school_id,
    'is_active', _is_active
  );
END;
$$;


-- ============================================================================
-- MIGRATION 004: Archive Schools
-- Adds is_archived flag and updates subscription_status constraint.
-- ============================================================================

-- Add archived state to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add 'archived' to subscription_status check
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_subscription_status_check;
ALTER TABLE schools ADD CONSTRAINT schools_subscription_status_check
  CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'archived'));


-- ============================================================================
-- MIGRATION 005: Assessment Tables
-- Assessment Components, Grading Scale, Psychomotor/Affective Definitions,
-- Score tables, Term Results, Edit Logs, Comments.
-- ============================================================================

-- Assessment Components (per school)
CREATE TABLE IF NOT EXISTS assessment_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grading Scale (school-wide or per-class override)
CREATE TABLE IF NOT EXISTS grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE, -- NULL = school-wide
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Psychomotor Trait Definitions
CREATE TABLE IF NOT EXISTS psychomotor_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affective Domain Definitions
CREATE TABLE IF NOT EXISTS affective_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add can_publish to teacher_subjects
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS can_publish BOOLEAN DEFAULT false;

-- Student Scores (raw scores per component)
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assessment_component_id UUID NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, assessment_component_id, term_id)
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  days_school_opened INT DEFAULT 0,
  days_present INT DEFAULT 0,
  days_absent INT DEFAULT 0,
  UNIQUE(student_id, term_id)
);

-- Psychomotor Scores
CREATE TABLE IF NOT EXISTS psychomotor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES psychomotor_definitions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- Affective Scores
CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES affective_definitions(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- Teacher Comments
CREATE TABLE IF NOT EXISTS teacher_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  comment TEXT,
  UNIQUE(student_id, term_id)
);

-- Term Results (frozen snapshot at publish time)
CREATE TABLE IF NOT EXISTS term_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  total_score DECIMAL(10,2) NOT NULL,
  grade TEXT NOT NULL,
  remark TEXT,
  published BOOLEAN DEFAULT false,
  published_by UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  last_edited_at TIMESTAMPTZ,
  UNIQUE(student_id, term_id, subject_id)
);

-- Result Edit Log (audit trail)
CREATE TABLE IF NOT EXISTS result_edit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ DEFAULT NOW(),
  previous_grade TEXT,
  new_grade TEXT,
  previous_total DECIMAL(10,2),
  new_total DECIMAL(10,2)
);

-- School Admin Comments
CREATE TABLE IF NOT EXISTS school_admin_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  comment TEXT,
  UNIQUE(student_id, term_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asmt_comp_school ON assessment_components(school_id);
CREATE INDEX IF NOT EXISTS idx_grading_school ON grading_scales(school_id);
CREATE INDEX IF NOT EXISTS idx_student_scores_student ON student_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_scores_term ON student_scores(term_id);
CREATE INDEX IF NOT EXISTS idx_term_results_student ON term_results(student_id);
CREATE INDEX IF NOT EXISTS idx_term_results_published ON term_results(published);


-- ============================================================================
-- MIGRATION 006_password_system: Password History Table
-- Tracks passwords by school, role, and user for uniqueness checking.
-- ============================================================================

-- Password history table for uniqueness tracking
CREATE TABLE IF NOT EXISTS password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  password TEXT NOT NULL,
  school_prefix TEXT NOT NULL,
  role TEXT NOT NULL,
  used_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_history_used ON password_history(password);


-- ============================================================================
-- MIGRATION 006_student_teacher_passwords: Student & Teacher Password Management
-- Adds must_change_password and generated_password to students and teachers.
-- ============================================================================

-- Students: add password columns for first-login onboarding flow
ALTER TABLE students ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Teachers: add password columns (same pattern as school_admins)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;


-- ============================================================================
-- MIGRATION 007: Add Gender to Students
-- ============================================================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;


-- ============================================================================
-- MIGRATION 008_class_teacher_assignments: Class-Teacher & Subject Assignment
-- Adds class_teachers table with primary/assistant roles, enhances
-- teacher_subjects, adds missing columns to students and teachers.
-- ============================================================================

-- 1. Class-Teacher Assignments (supports primary + assistant roles)
CREATE TABLE IF NOT EXISTS class_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('primary', 'assistant')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(school_id, class_id, teacher_id)
);

-- 2. Enhance teacher_subjects: role, is_active, and make teacher_id nullable (vacant)
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'assistant'));
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE teacher_subjects ALTER COLUMN teacher_id DROP NOT NULL;

-- 3. Add missing columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 4. Add missing columns to teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS staff_role TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS gender TEXT;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_class_teachers_class ON class_teachers(class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_school ON class_teachers(school_id);

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS update_class_teachers_updated_at ON class_teachers;
CREATE TRIGGER update_class_teachers_updated_at
  BEFORE UPDATE ON class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. Cascade: when a teacher is removed from a class, vacate their
--    subject assignments (set teacher_id = NULL). The school admin
--    reassigns them manually when ready.
CREATE OR REPLACE FUNCTION cleanup_subject_assignments_on_teacher_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE teacher_subjects
  SET teacher_id = NULL
  WHERE school_id = OLD.school_id
    AND class_id = OLD.class_id
    AND teacher_id = OLD.teacher_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_subjects_on_class_teacher_delete ON class_teachers;
CREATE TRIGGER trg_cleanup_subjects_on_class_teacher_delete
  AFTER DELETE ON class_teachers
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_subject_assignments_on_teacher_removal();


-- ============================================================================
-- MIGRATION 008_password_history: Global Password Uniqueness Table
-- NOTE: This is a different table from the one in 006_password_system.
--       It tracks raw password strings for global uniqueness.
--       Since the 006 version already exists, CREATE IF NOT EXISTS
--       will be a no-op. The 006 table persists.
-- ============================================================================

-- Create a table to track all generated passwords to ensure global uniqueness
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    password_string TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Service role can read/write, others cannot)
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- MIGRATION 009_add_session_id_to_terms: Link Terms to Sessions
-- ============================================================================
ALTER TABLE academic_terms ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES academic_sessions(id) ON DELETE CASCADE;


-- ============================================================================
-- MIGRATION 009_class_subjects: Subject-to-Class Assignments
-- Allows a single subject (e.g. "English") to be assigned to many classes.
-- ============================================================================

-- 1. class_subjects: which subjects a class is studying
CREATE TABLE IF NOT EXISTS class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- a subject can only be assigned to the same class once
  UNIQUE(school_id, class_id, subject_id)
);

-- 2. Indexes for fast look-up
CREATE INDEX IF NOT EXISTS idx_class_subjects_class   ON class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school  ON class_subjects(school_id);

-- 3. Auto-update updated_at
DROP TRIGGER IF EXISTS update_class_subjects_updated_at ON class_subjects;
CREATE TRIGGER update_class_subjects_updated_at
  BEFORE UPDATE ON class_subjects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_class_subjects ON class_subjects;
CREATE POLICY tenant_select_class_subjects ON class_subjects
  FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_class_subjects ON class_subjects;
CREATE POLICY tenant_insert_class_subjects ON class_subjects
  FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_class_subjects ON class_subjects;
CREATE POLICY tenant_update_class_subjects ON class_subjects
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_class_subjects ON class_subjects;
CREATE POLICY tenant_delete_class_subjects ON class_subjects
  FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- 5. Grant permissions
GRANT ALL ON class_subjects TO anon, authenticated, service_role;


-- ============================================================================
-- MIGRATION 010: Master Assessment Templates (Unified)
-- Replaces individual config tables from 005 with unified template tables.
-- Drops: student_scores, psychomotor_scores, affective_scores,
--        assessment_components, grading_scales, psychomotor_definitions,
--        affective_definitions
-- Creates: assessment_templates (unified), class_assessment_templates,
--          template_components, template_grading_scales, etc.
--          Then recreates score tables pointing to new templates.
-- ============================================================================

-- 1. Drop old score tables first (to avoid constraint errors)
DROP TABLE IF EXISTS student_scores CASCADE;
DROP TABLE IF EXISTS psychomotor_scores CASCADE;
DROP TABLE IF EXISTS affective_scores CASCADE;

-- 2. Drop old config tables
DROP TABLE IF EXISTS assessment_components CASCADE;
DROP TABLE IF EXISTS grading_scales CASCADE;
DROP TABLE IF EXISTS psychomotor_definitions CASCADE;
DROP TABLE IF EXISTS affective_definitions CASCADE;

-- 3. Create Template Core Table
CREATE TABLE IF NOT EXISTS assessment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Template to Class junction (1 class can only have 1 active template)
CREATE TABLE IF NOT EXISTS class_assessment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

-- 5. Template Components (Tests/Exams)
CREATE TABLE IF NOT EXISTS template_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 6. Template Grading Scales (A, B, C...)
CREATE TABLE IF NOT EXISTS template_grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT
);

-- 7. Template Psychomotor Traits
CREATE TABLE IF NOT EXISTS template_psychomotor_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 8. Template Affective Traits
CREATE TABLE IF NOT EXISTS template_affective_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 9. Recreate Score Tables mapping to new templates
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES template_components(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, component_id, term_id)
);

CREATE TABLE IF NOT EXISTS psychomotor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES template_psychomotor_traits(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES template_affective_traits(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- 10. Enable RLS
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_assessment_templates ENABLE ROW LEVEL SECURITY;

-- 11. Policies
CREATE POLICY tenant_select_templates ON assessment_templates FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_insert_templates ON assessment_templates FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_update_templates ON assessment_templates FOR UPDATE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_delete_templates ON assessment_templates FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

CREATE POLICY tenant_select_class_templates ON class_assessment_templates FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_insert_class_templates ON class_assessment_templates FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
CREATE POLICY tenant_delete_class_templates ON class_assessment_templates FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- For sub-tables, we bypass RLS mostly since they are manipulated along with the template via API (using service_role)
-- But we can add basic read access for authenticated users.
GRANT ALL ON assessment_templates TO anon, authenticated, service_role;
GRANT ALL ON class_assessment_templates TO anon, authenticated, service_role;
GRANT ALL ON template_components TO anon, authenticated, service_role;
GRANT ALL ON template_grading_scales TO anon, authenticated, service_role;
GRANT ALL ON template_psychomotor_traits TO anon, authenticated, service_role;
GRANT ALL ON template_affective_traits TO anon, authenticated, service_role;
GRANT ALL ON student_scores TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_scores TO anon, authenticated, service_role;
GRANT ALL ON affective_scores TO anon, authenticated, service_role;


-- ============================================================================
-- MIGRATION 011: Separated Assessment Templates
-- Drops the unified template system from 010 and creates 4 independent
-- template systems (Components, Grading, Psychomotor, Affective).
-- Each system has its own template table, class-junction table, and rows table.
-- Also recreates the score tables to reference the new row tables.
-- ============================================================================

-- 1. Drop old unified score tables
DROP TABLE IF EXISTS student_scores CASCADE;
DROP TABLE IF EXISTS psychomotor_scores CASCADE;
DROP TABLE IF EXISTS affective_scores CASCADE;

-- 2. Drop old unified config tables (from Migration 010)
DROP TABLE IF EXISTS class_assessment_templates CASCADE;
DROP TABLE IF EXISTS template_components CASCADE;
DROP TABLE IF EXISTS template_grading_scales CASCADE;
DROP TABLE IF EXISTS template_psychomotor_traits CASCADE;
DROP TABLE IF EXISTS template_affective_traits CASCADE;
DROP TABLE IF EXISTS assessment_templates CASCADE;

-- ========================================================================
-- SYSTEM 1: COMPONENTS
-- ========================================================================
CREATE TABLE IF NOT EXISTS components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS components_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ========================================================================
-- SYSTEM 2: GRADING SCALES
-- ========================================================================
CREATE TABLE IF NOT EXISTS grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS grading_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  minimum_score DECIMAL(10,2) NOT NULL,
  maximum_score DECIMAL(10,2) NOT NULL,
  remark TEXT
);

-- ========================================================================
-- SYSTEM 3: PSYCHOMOTOR TRAITS
-- ========================================================================
CREATE TABLE IF NOT EXISTS psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS psychomotor_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ========================================================================
-- SYSTEM 4: AFFECTIVE TRAITS
-- ========================================================================
CREATE TABLE IF NOT EXISTS affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS class_affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  UNIQUE(class_id)
);

CREATE TABLE IF NOT EXISTS affective_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- ========================================================================
-- RECREATE SCORE TABLES (final version — references separated row tables)
-- ========================================================================
CREATE TABLE IF NOT EXISTS student_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES components_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, component_id, term_id)
);

CREATE TABLE IF NOT EXISTS psychomotor_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES psychomotor_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

CREATE TABLE IF NOT EXISTS affective_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  trait_id UUID NOT NULL REFERENCES affective_rows(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  UNIQUE(student_id, trait_id, term_id)
);

-- ========================================================================
-- RLS & GRANTS
-- ========================================================================
GRANT ALL ON components_templates TO anon, authenticated, service_role;
GRANT ALL ON class_components_templates TO anon, authenticated, service_role;
GRANT ALL ON components_rows TO anon, authenticated, service_role;

GRANT ALL ON grading_templates TO anon, authenticated, service_role;
GRANT ALL ON class_grading_templates TO anon, authenticated, service_role;
GRANT ALL ON grading_rows TO anon, authenticated, service_role;

GRANT ALL ON psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON class_psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_rows TO anon, authenticated, service_role;

GRANT ALL ON affective_templates TO anon, authenticated, service_role;
GRANT ALL ON class_affective_templates TO anon, authenticated, service_role;
GRANT ALL ON affective_rows TO anon, authenticated, service_role;

GRANT ALL ON student_scores TO anon, authenticated, service_role;
GRANT ALL ON psychomotor_scores TO anon, authenticated, service_role;
GRANT ALL ON affective_scores TO anon, authenticated, service_role;


-- ============================================================================
-- MIGRATION 012_add_subject_id_to_scores: Add subject_id to student_scores
-- ============================================================================
ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_student_scores_subject ON student_scores(subject_id);


-- ============================================================================
-- MIGRATION 012_archiving_and_indexes: Archiving Support & Performance Indexes
-- ============================================================================

-- parent_phone may not exist on students yet
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;

-- Ensure profiles.is_active is available (already defined in 001 but guard)
ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT true;

-- Index for fast active/inactive filtering on students and teachers
CREATE INDEX IF NOT EXISTS idx_students_school_active ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);


-- ============================================================================
-- MIGRATION 013: School Abbreviations
-- Adds abbreviation column to schools, generates initials from school name,
-- backfills existing rows, then sets NOT NULL.
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


-- ============================================================================
-- MIGRATION 014: Recovery Email
-- Adds recovery_email column to profiles for account recovery.
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recovery_email TEXT;


-- ============================================================================
-- END OF COMPLETE STAGING SCHEMA
-- Total migration files concatenated: 18
-- ============================================================================
