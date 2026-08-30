-- ============================================================================
-- SchoolAid - STAGING COMPLETE SCHEMA (regenerated)
-- Generated: 2026-08-30
-- Source: All migration files concatenated in order (001 -> 027)
-- 
-- This file is IDEMPOTENT - safe to run repeatedly on a fresh database.
-- All CREATE TABLE use IF NOT EXISTS.
-- All ALTER TABLE ADD COLUMN use IF NOT EXISTS.
-- All DROP use IF EXISTS.
-- ============================================================================

-- ============================================================================
-- SchoolAid — Phase 1: Complete Foundation
-- Migration 001: Initial Schema + RLS + JWT Claims + Indexes
-- ============================================================================
-- This migration is idempotent: safe to run multiple times on a fresh DB.
-- Schools in this file: "Super Admin" tables omit school_id; all tenant
-- tables include it for Row-Level Security enforcement.
-- ============================================================================

-- 0. Extensions (gen_random_uuid() is used instead of uuid_generate_v4)

-- ============================================================================
-- 1. TABLES
-- ============================================================================

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

-- ============================================================================
-- 2. AUTO-UPDATE updated_at TRIGGER (all tables with updated_at)
-- ============================================================================
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

-- ============================================================================
-- 3. AUTO-PROFILE CREATION TRIGGER (on auth.users insert)
-- ============================================================================
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

-- ============================================================================
-- 4. CUSTOM JWT CLAIMS HOOK (Ticket 1.3)
-- Injects school_id, role, teacher_id/student_id into the JWT at issuance.
-- ============================================================================
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

-- ============================================================================
-- 5. ROW-LEVEL SECURITY POLICIES (Ticket 1.4)
-- Pattern: school_id = (auth.jwt() ->> 'school_id')::uuid
-- Super Admin (school_id IS NULL) sees all rows in their domain.
-- ============================================================================

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

-- Teacher-scoped tables additionally restrict by assigned class/subject:
-- teacher_subjects is already scoped by school_id + teacher_id via JWT
-- For assessments: a teacher can only see their own assessments
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

-- ============================================================================
-- 6. PARTIAL UNIQUE INDEXES — Active Term/Session (Ticket 1.5)
-- Only one active term and one active session allowed per school.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_term_per_school
  ON academic_terms (school_id) WHERE is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_per_school
  ON academic_sessions (school_id) WHERE is_active = true;

-- ============================================================================
-- 7. PERFORMANCE INDEXES
-- ============================================================================
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
-- SchoolAid — Phase 2: Super Admin Core
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
-- Fix: custom_jwt_claims — simplified, handles edge cases
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
-- Add archived state to schools
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- Add 'archived' to subscription_status check
ALTER TABLE schools DROP CONSTRAINT IF EXISTS schools_subscription_status_check;
ALTER TABLE schools ADD CONSTRAINT schools_subscription_status_check
  CHECK (subscription_status IN ('active', 'inactive', 'suspended', 'archived'));
-- Phase 4: Assessment Configuration Tables
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

-- Phase 5: Score Tables
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

-- Phase 6: Publish & Snapshot
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
-- SchoolAid — Phase 7 Prep: Student & Teacher Password Management
-- Adds must_change_password and generated_password to students and teachers.
-- ============================================================================

-- Students: add password columns for first-login onboarding flow
ALTER TABLE students ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Teachers: add password columns (same pattern as school_admins)
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS generated_password TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;
-- ============================================================================
-- SchoolAid — Add gender column to students table
-- ============================================================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
-- ============================================================================
-- SchoolAid — Migration 008: Class-Teacher & Subject Assignment Enhancement
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
-- Create a table to track all generated passwords to ensure global uniqueness
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    password_string TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Service role can read/write, others cannot)
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
-- Link terms to their parent session
ALTER TABLE academic_terms ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES academic_sessions(id) ON DELETE CASCADE;
-- Audit logs table for authentication events
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  school_id UUID,
  event TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event);
-- ============================================================================
-- SchoolAid — Migration 009: Subject-to-Class Assignments
-- Allows a single subject (e.g. "English") to be assigned to many classes.
-- This is the prerequisite for the teacher→subject→class workflow.
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
-- SchoolAid — Migration 010: Master Assessment Templates
-- Replaces individual config tables with unified Assessment Templates.
-- WARNING: Drops old assessment tables and scores to start fresh.
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
-- Migration: Preserve historical subject names in term_results
-- 1. Add snapshot columns
ALTER TABLE term_results ADD COLUMN IF NOT EXISTS subject_name TEXT;
ALTER TABLE term_results ADD COLUMN IF NOT EXISTS subject_code TEXT;

-- 2. Backfill existing records from current subjects table
UPDATE term_results tr
SET subject_name = s.name, subject_code = s.code
FROM subjects s
WHERE tr.subject_id = s.id AND tr.subject_name IS NULL;

-- 3. Drop the CASCADE constraint and recreate without it
ALTER TABLE term_results DROP CONSTRAINT IF EXISTS term_results_subject_id_fkey;
ALTER TABLE term_results ADD CONSTRAINT term_results_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL;

-- 4. Add indexes
CREATE INDEX IF NOT EXISTS idx_term_results_subject ON term_results(subject_id);
-- ============================================================================
-- SchoolAid — Migration 011: Separated Assessment Templates
-- Drops unified master template and creates 4 independent template systems.
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

-- ============================================================================
-- SYSTEM 1: COMPONENTS
-- ============================================================================
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

-- ============================================================================
-- SYSTEM 2: GRADING SCALES
-- ============================================================================
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

-- ============================================================================
-- SYSTEM 3: PSYCHOMOTOR TRAITS
-- ============================================================================
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

-- ============================================================================
-- SYSTEM 4: AFFECTIVE TRAITS
-- ============================================================================
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

-- ============================================================================
-- RECREATE SCORE TABLES
-- ============================================================================
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

-- ============================================================================
-- RLS & GRANTS
-- ============================================================================
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
-- Add subject_id to student_scores for per-subject score tracking
ALTER TABLE student_scores ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_student_scores_subject ON student_scores(subject_id);
-- ============================================================================
-- SchoolAid — Add archiving support (is_active on profiles already exists)
-- Add parent_phone to students, add phone to teachers (if not already in profiles)
-- ============================================================================

-- parent_phone may not exist on students yet
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_phone TEXT;

-- Ensure profiles.is_active is available (already defined in 001 but guard)
ALTER TABLE profiles ALTER COLUMN is_active SET DEFAULT true;

-- Index for fast active/inactive filtering on students and teachers
CREATE INDEX IF NOT EXISTS idx_students_school_active ON students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
-- Migration 012: Report Card Template System (MVP)
-- Super Admin manages templates. Schools assign per grade_level.

-- 1. Report card templates (Super Admin managed)
CREATE TABLE IF NOT EXISTS report_card_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  page_size     TEXT NOT NULL DEFAULT 'A4',
  orientation   TEXT NOT NULL DEFAULT 'portrait',
  colors        JSONB DEFAULT '{"primary":"#2A4B8D","accent":"#F0A63A","text":"#16202E"}',
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version       INT NOT NULL DEFAULT 1,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Sections within a template
CREATE TABLE IF NOT EXISTS report_card_template_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,  -- 'header','student_info','attendance','academic', etc.
  label         TEXT NOT NULL,  -- Default display label
  display_order INT NOT NULL DEFAULT 0,
  config        JSONB DEFAULT '{}',
  is_enabled    BOOLEAN DEFAULT true,
  UNIQUE(template_id, section_key)
);

-- 3. Immutable snapshots on publish
CREATE TABLE IF NOT EXISTS report_card_template_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  version       INT NOT NULL,
  frozen_config JSONB NOT NULL,  -- Full template + sections at publish time
  published_by  UUID REFERENCES profiles(id),
  published_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. School assigns template per grade_level
CREATE TABLE IF NOT EXISTS school_template_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  grade_level   TEXT NOT NULL,  -- Matches classes.grade_level
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  assigned_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, grade_level)
);

-- 5. Per-school section toggles + renames
CREATE TABLE IF NOT EXISTS school_template_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id),
  template_id   UUID NOT NULL REFERENCES report_card_templates(id),
  section_key   TEXT NOT NULL,
  is_enabled    BOOLEAN DEFAULT true,
  custom_label  TEXT,
  UNIQUE(school_id, template_id, section_key)
);

-- Add template snapshot reference to term_results for historical integrity
ALTER TABLE term_results 
ADD COLUMN IF NOT EXISTS template_snapshot_id UUID REFERENCES report_card_template_versions(id);

-- RLS: Super Admin full access to templates
ALTER TABLE report_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_template_versions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published templates
CREATE POLICY "Anyone can read published templates" ON report_card_templates
  FOR SELECT USING (status = 'published');

-- Super Admin full access
CREATE POLICY "Super admin full access templates" ON report_card_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Super admin full access sections" ON report_card_template_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "Anyone can read template sections" ON report_card_template_sections
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM report_card_templates t WHERE t.id = template_id AND t.status = 'published')
  );

-- School template assignments: school admin manages, anyone reads
ALTER TABLE school_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_template_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admin manages own assignments" ON school_template_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

CREATE POLICY "Anyone can read assignments" ON school_template_assignments FOR SELECT USING (true);

CREATE POLICY "School admin manages own configs" ON school_template_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'school_admin')
  );

CREATE POLICY "Anyone can read configs" ON school_template_configs FOR SELECT USING (true);
-- Migration 013: Finance Module
-- Fee Heads, Templates, Section Defaults, Class Overrides, Student Billing, Payments, Receipts, Discounts, Payment Plans

-- 1. Fee Heads
CREATE TABLE IF NOT EXISTS fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  is_optional BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Fee Templates
CREATE TABLE IF NOT EXISTS fee_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Fee Template Items
CREATE TABLE IF NOT EXISTS fee_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES fee_templates(id) ON DELETE CASCADE,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  default_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  UNIQUE(template_id, fee_head_id)
);

-- 4. Section Fee Defaults (inheritance layer)
CREATE TABLE IF NOT EXISTS section_fee_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  template_id UUID REFERENCES fee_templates(id),
  grade_level TEXT NOT NULL,
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  UNIQUE(school_id, grade_level, fee_head_id)
);

-- 5. Class Fee Overrides
CREATE TABLE IF NOT EXISTS class_fee_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL,
  UNIQUE(school_id, class_id, fee_head_id)
);

-- 6. Student Fees (per-term billing)
CREATE TABLE IF NOT EXISTS student_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - COALESCE(discount_amount, 0)) STORED,
  is_optional BOOLEAN DEFAULT false,
  is_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, term_id, fee_head_id)
);

-- 7. Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID REFERENCES academic_terms(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number TEXT,
  recorded_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  payment_id UUID REFERENCES payments(id),
  student_id UUID NOT NULL REFERENCES students(id),
  receipt_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  is_void BOOLEAN DEFAULT false,
  void_reason TEXT,
  reprint_count INT DEFAULT 0,
  generated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Discounts
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  value DECIMAL(12,2) NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('scholarship', 'staff_child', 'sibling', 'early_payment', 'promotional', 'welfare', 'general')),
  effective_date DATE,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Student Discounts
CREATE TABLE IF NOT EXISTS student_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  discount_id UUID NOT NULL REFERENCES discounts(id),
  term_id UUID REFERENCES academic_terms(id),
  reason TEXT,
  applied_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Payment Plans
CREATE TABLE IF NOT EXISTS payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_id UUID NOT NULL REFERENCES students(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  total_amount DECIMAL(12,2) NOT NULL,
  installment_count INT NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Payment Plan Installments
CREATE TABLE IF NOT EXISTS payment_plan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  installment_number INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  payment_id UUID REFERENCES payments(id),
  UNIQUE(plan_id, installment_number)
);

-- RLS
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_fee_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_fee_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_installments ENABLE ROW LEVEL SECURITY;
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
-- Migration 014: AI Assessment Import Module
-- Feature flags, audit logs, import details

-- 1. Feature flags per school
CREATE TABLE IF NOT EXISTS school_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  enabled_by UUID REFERENCES profiles(id),
  enabled_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, feature_key)
);

-- 2. AI import audit log
CREATE TABLE IF NOT EXISTS ai_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  teacher_id UUID NOT NULL REFERENCES profiles(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID REFERENCES subjects(id),
  term_id UUID NOT NULL REFERENCES academic_terms(id),
  images_processed INT DEFAULT 0,
  rows_extracted INT DEFAULT 0,
  rows_imported INT DEFAULT 0,
  rows_skipped INT DEFAULT 0,
  rows_needing_review INT DEFAULT 0,
  processing_duration_ms INT,
  confidence_avg DECIMAL(3,2),
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Per-cell audit detail
CREATE TABLE IF NOT EXISTS ai_import_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES ai_import_logs(id) ON DELETE CASCADE,
  student_name_raw TEXT,
  student_id UUID REFERENCES students(id),
  component_name_raw TEXT,
  component_id UUID REFERENCES components_rows(id),
  score_raw TEXT,
  score_parsed DECIMAL(10,2),
  confidence DECIMAL(3,2),
  match_status TEXT DEFAULT 'unmatched',
  action TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE school_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_import_details ENABLE ROW LEVEL SECURITY;
-- ============================================================================
-- SchoolAid — Add recovery_email to profiles
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS recovery_email TEXT;
-- ============================================================================
-- SchoolAid — Migration 015: Add class_id to student_scores
-- Enables fast, direct filtering of scores by class without a student ID join.
-- ============================================================================

-- 1. Add the class_id column (nullable so existing rows aren't broken)
ALTER TABLE student_scores
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

-- 2. Backfill existing scores with the student's current class
--    (joins student_scores → students to get class_id)
UPDATE student_scores ss
SET class_id = s.class_id
FROM students s
WHERE ss.student_id = s.id
  AND ss.class_id IS NULL
  AND s.class_id IS NOT NULL;

-- 3. Performance index — the key query is school + term + class + subject
CREATE INDEX IF NOT EXISTS idx_student_scores_class
  ON student_scores(school_id, term_id, class_id, subject_id);

-- Done. class_id is now populated for all existing records.
-- Prevent duplicate terms within the same session
ALTER TABLE academic_terms ADD CONSTRAINT IF NOT EXISTS uq_terms_session_name UNIQUE(school_id, session_id, name);
-- ============================================================================
-- SchoolAid — Migration 016: Fix student_scores Unique Constraint
-- Adds subject_id to the unique constraint so per-subject scores can be stored.
-- Previously the constraint was (student_id, component_id, term_id) which
-- prevented storing the same component (e.g. CA1) for different subjects.
-- Now allows (student_id, component_id, term_id, subject_id).
-- ============================================================================

-- 1. Drop the old constraint (student_id + component_id + term_id only)
ALTER TABLE student_scores 
  DROP CONSTRAINT IF EXISTS student_scores_student_id_component_id_term_id_key;

-- 2. Create the new constraint (includes subject_id)
ALTER TABLE student_scores 
  ADD UNIQUE(student_id, component_id, term_id, subject_id);
-- ============================================================================
-- SchoolAid — Migration 017: Enhanced Student Profile Fields
-- ============================================================================

-- Add first_name, middle_name, last_name to profiles (backward compatible)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Populate first/last from existing full_name where possible
UPDATE profiles SET
  first_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' 
    THEN split_part(full_name, ' ', 1)
    ELSE NULL
  END,
  last_name = CASE 
    WHEN full_name IS NOT NULL AND full_name != '' 
    THEN reverse(split_part(reverse(full_name), ' ', 1))
    ELSE NULL
  END
WHERE first_name IS NULL;

-- Add personal info fields to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;

-- Add parent/guardian info
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_occupation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_location TEXT;

-- Emergency contact
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

-- Medical info
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS health_notes TEXT;

-- Enrollment status
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'graduated', 'withdrawn', 'suspended', 'alumni'));

-- Profile completion tracking
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_token TEXT;

-- Index for status
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
-- ============================================================================
-- SchoolAid — Migration 017: Report Card Submission Workflow + Audit Trail
-- ============================================================================

-- 1. Per-class, per-term submission state
CREATE TABLE IF NOT EXISTS report_card_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'returned')),
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, term_id)
);

-- 2. Audit trail for report card preparation
CREATE TABLE IF NOT EXISTS report_card_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL, -- 'save_attendance' | 'save_traits' | 'save_remark' | 'submit'
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_rcs_class_term ON report_card_submissions(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_rcs_school ON report_card_submissions(school_id);
CREATE INDEX IF NOT EXISTS idx_rcal_class_term ON report_card_audit_logs(class_id, term_id);

-- 4. updated_at trigger
DROP TRIGGER IF EXISTS update_rcs_updated_at ON report_card_submissions;
CREATE TRIGGER update_rcs_updated_at
  BEFORE UPDATE ON report_card_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. RLS (service_role bypasses; policies mirror class_subjects pattern)
ALTER TABLE report_card_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON report_card_submissions TO anon, authenticated, service_role;
GRANT ALL ON report_card_audit_logs TO anon, authenticated, service_role;

DROP POLICY IF EXISTS tenant_all_rcs ON report_card_submissions;
CREATE POLICY tenant_all_rcs ON report_card_submissions
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_all_rcal ON report_card_audit_logs;
CREATE POLICY tenant_all_rcal ON report_card_audit_logs
  FOR ALL USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());
-- ============================================================================
-- SchoolAid — Migration 018: Enhanced Student & Teacher Profile Fields
-- ============================================================================

-- ── STUDENTS ──────────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS religion TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_occupation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_location TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS health_notes TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('pending', 'active', 'graduated', 'withdrawn', 'suspended', 'alumni'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_token TEXT;
CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);

-- ── TEACHERS ──────────────────────────────────────────────────────────
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS marital_status TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT false;

-- ── PROFILES ──────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Backfill first_name / last_name from full_name where NULL
UPDATE profiles SET
  first_name = split_part(full_name, ' ', 1),
  last_name = reverse(split_part(reverse(full_name), ' ', 1))
WHERE first_name IS NULL AND full_name IS NOT NULL AND full_name != '';
-- ============================================================================
-- SchoolAid — Migration 018: class_id on term_results
-- Lets the student-facing gate check which CLASS's report-card submission
-- was approved, independent of the student's current class_id (avoids a
-- false-negative if the student is later promoted to a new class).
-- ============================================================================

ALTER TABLE term_results ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_term_results_class_term ON term_results(class_id, term_id);
-- ============================================================================
-- SchoolAid — Migration 019: Academic Levels & Template Inheritance
-- ============================================================================

-- 1. Academic Levels
CREATE TABLE IF NOT EXISTS academic_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, name)
);

-- 2. Level → Template junction tables
CREATE TABLE IF NOT EXISTS level_components_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES components_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_grading_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES grading_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_psychomotor_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES psychomotor_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

CREATE TABLE IF NOT EXISTS level_affective_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  level_id UUID NOT NULL REFERENCES academic_levels(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES affective_templates(id) ON DELETE CASCADE,
  UNIQUE(level_id)
);

-- 3. Add academic_level_id to classes
ALTER TABLE classes ADD COLUMN IF NOT EXISTS academic_level_id UUID REFERENCES academic_levels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_classes_level ON classes(academic_level_id);

-- 4. Grants
GRANT ALL ON academic_levels TO anon, authenticated, service_role;
GRANT ALL ON level_components_templates TO anon, authenticated, service_role;
GRANT ALL ON level_grading_templates TO anon, authenticated, service_role;
GRANT ALL ON level_psychomotor_templates TO anon, authenticated, service_role;
GRANT ALL ON level_affective_templates TO anon, authenticated, service_role;
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
-- Migration 020: Report Card Publishing & Retraction Workflow
-- Adds published/retracted statuses, publishing metadata, and retraction support

-- 1. Update status CHECK constraint to include published and retracted
ALTER TABLE report_card_submissions 
  DROP CONSTRAINT IF EXISTS report_card_submissions_status_check;

ALTER TABLE report_card_submissions 
  ADD CONSTRAINT report_card_submissions_status_check 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'published', 'retracted', 'returned'));

-- 2. Add publishing columns
ALTER TABLE report_card_submissions 
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. Add retraction columns
ALTER TABLE report_card_submissions 
  ADD COLUMN IF NOT EXISTS retracted_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS retracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retraction_reason TEXT;

-- 4. Create bulk download tracking table
CREATE TABLE IF NOT EXISTS report_card_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
  downloaded_by UUID NOT NULL REFERENCES profiles(id),
  student_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_card_downloads ENABLE ROW LEVEL SECURITY;
-- ============================================================
-- 020_copilot_fix — make school_id nullable for super-admin ops
-- ============================================================

-- Allow conversations and operations at super-admin level (no school)
ALTER TABLE copilot_conversations 
  ALTER COLUMN school_id DROP NOT NULL;

ALTER TABLE copilot_operations 
  ALTER COLUMN school_id DROP NOT NULL;
-- ============================================================
-- 022_copilot_fix — fix nullable constraints
-- ============================================================

-- Allow operations without a conversation (direct execution)
ALTER TABLE copilot_operations 
  ALTER COLUMN conversation_id DROP NOT NULL;
-- ============================================================================
-- SchoolAid — Migration 023: Principal Remarks & Manual Override Flag
--
-- 1. Adds `principal_remark` column to grading_rows (the current active table)
-- 2. Adds `is_manual` flag to school_admin_comments so manual edits are never
--    overwritten by the automated remark engine
-- ============================================================================

-- 1. Add principal_remark to grading_rows (template-based grading system)
ALTER TABLE grading_rows ADD COLUMN IF NOT EXISTS principal_remark TEXT;

-- 2. Add is_manual flag to school_admin_comments
--    When TRUE the automated remark engine will not overwrite this comment.
ALTER TABLE school_admin_comments ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT false;

-- 3. Grants
GRANT ALL ON grading_rows TO anon, authenticated, service_role;
GRANT ALL ON school_admin_comments TO anon, authenticated, service_role;
-- ============================================================================
-- SchoolAid — Migration 024: term_result_components
-- Snapshot of individual assessment component scores per student per term.
-- Used by the report card to display CA1, CA2, Exam breakdown.
-- Created because the table was referenced in code but never migrated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.term_result_components (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id         UUID NOT NULL REFERENCES public.academic_terms(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  component_id    UUID NOT NULL,
  component_name  TEXT NOT NULL,
  component_order INT  NOT NULL DEFAULT 0,
  max_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  score           NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one snapshot row per student/term/subject/component
  UNIQUE (student_id, term_id, subject_id, component_id)
);

-- Indexes for fast look-up
CREATE INDEX IF NOT EXISTS idx_trc_student  ON public.term_result_components (student_id);
CREATE INDEX IF NOT EXISTS idx_trc_term     ON public.term_result_components (term_id);
CREATE INDEX IF NOT EXISTS idx_trc_school   ON public.term_result_components (school_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_trc_updated_at ON public.term_result_components;
CREATE TRIGGER update_trc_updated_at
  BEFORE UPDATE ON public.term_result_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.term_result_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trc_select ON public.term_result_components;
CREATE POLICY trc_select ON public.term_result_components
  FOR SELECT USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_insert ON public.term_result_components;
CREATE POLICY trc_insert ON public.term_result_components
  FOR INSERT WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_update ON public.term_result_components;
CREATE POLICY trc_update ON public.term_result_components
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS trc_delete ON public.term_result_components;
CREATE POLICY trc_delete ON public.term_result_components
  FOR DELETE USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- Permissions
GRANT ALL ON public.term_result_components TO anon, authenticated, service_role;
-- ============================================================================
-- SchoolAid — Migration 025: Auto-seed defaults for existing schools
-- Ensures every school has assessment templates. Safe to run repeatedly.
-- ============================================================================

DO $$
DECLARE
  sch RECORD;
  cls RECORD;
  tmpl_id UUID;
  gt_id UUID;
  pt_id UUID;
  at_id UUID;
BEGIN
  FOR sch IN SELECT id FROM schools LOOP

    -- ── 1. Components Template (CA1 20, CA2 20, Exam 60) ──
    IF NOT EXISTS (SELECT 1 FROM components_templates WHERE school_id = sch.id) THEN
      INSERT INTO components_templates (school_id, name) VALUES (sch.id, 'Standard Assessment') RETURNING id INTO tmpl_id;
      INSERT INTO components_rows (template_id, name, maximum_score, display_order) VALUES
        (tmpl_id, 'CA1', 20, 1),
        (tmpl_id, 'CA2', 20, 2),
        (tmpl_id, 'Exam', 60, 3);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_components_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, tmpl_id);
      END LOOP;
    END IF;

    -- ── 2. Grading Template (A-F) ──
    IF NOT EXISTS (SELECT 1 FROM grading_templates WHERE school_id = sch.id) THEN
      INSERT INTO grading_templates (school_id, name) VALUES (sch.id, 'Standard Grading') RETURNING id INTO gt_id;
      INSERT INTO grading_rows (template_id, grade, minimum_score, maximum_score, remark) VALUES
        (gt_id, 'A', 70, 100, 'Excellent'),
        (gt_id, 'B', 60, 69, 'Very Good'),
        (gt_id, 'C', 50, 59, 'Good'),
        (gt_id, 'D', 40, 49, 'Fair'),
        (gt_id, 'F', 0, 39, 'Fail');
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_grading_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, gt_id);
      END LOOP;
    END IF;

    -- ── 3. Psychomotor Template ──
    IF NOT EXISTS (SELECT 1 FROM psychomotor_templates WHERE school_id = sch.id) THEN
      INSERT INTO psychomotor_templates (school_id, name) VALUES (sch.id, 'Standard Psychomotor') RETURNING id INTO pt_id;
      INSERT INTO psychomotor_rows (template_id, name, display_order) VALUES
        (pt_id, 'Attitude to School Works', 0),
        (pt_id, 'Attentiveness', 1),
        (pt_id, 'Good Habit Formations', 2),
        (pt_id, 'Overall Lifestyle', 3),
        (pt_id, 'Interpersonal Relationship', 4);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_psychomotor_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, pt_id);
      END LOOP;
    END IF;

    -- ── 4. Affective Template ──
    IF NOT EXISTS (SELECT 1 FROM affective_templates WHERE school_id = sch.id) THEN
      INSERT INTO affective_templates (school_id, name) VALUES (sch.id, 'Standard Affective') RETURNING id INTO at_id;
      INSERT INTO affective_rows (template_id, name, display_order) VALUES
        (at_id, 'Good Value System', 0),
        (at_id, 'Positive Interest', 1),
        (at_id, 'Emotional Stability', 2),
        (at_id, 'Punctuality', 3);
      
      FOR cls IN SELECT id FROM classes WHERE school_id = sch.id LOOP
        INSERT INTO class_affective_templates (school_id, class_id, template_id) VALUES (sch.id, cls.id, at_id);
      END LOOP;
    END IF;

  END LOOP;
END;
$$;
-- ============================================================================
-- SchoolAid — Migration 026: Finance module hardening
-- Adds what 013_finance_module.sql was missing:
--   1. RLS policies (013 enabled RLS but defined NO policies, so every
--      non-service-role access to the finance tables was denied)
--   2. Indexes on all foreign keys + the dashboard's hot query path
--   3. updated_at triggers on fee_heads / fee_templates
--   4. CHECK constraints so money can never go negative and discounts stay sane
-- Idempotent: safe to run repeatedly. Every statement is guarded, so it is
-- also safe to run on a database where 013 has NOT been applied yet
-- (missing tables are skipped with a NOTICE).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS POLICIES — mirror the tenant policy style used in migration 001
--    (school_id must match the caller's JWT school_id, or caller is super_admin)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  finance_tables TEXT[] := ARRAY[
    'fee_heads', 'fee_templates', 'fee_template_items',
    'section_fee_defaults', 'class_fee_overrides', 'student_fees',
    'payments', 'receipts', 'discounts', 'student_discounts',
    'payment_plans', 'payment_plan_installments'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY finance_tables
  LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE; -- table doesn't exist (013 not applied yet); skip
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_select_%I ON %I;
       CREATE POLICY tenant_select_%I ON %I
         FOR SELECT
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_insert_%I ON %I;
       CREATE POLICY tenant_insert_%I ON %I
         FOR INSERT
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_update_%I ON %I;
       CREATE POLICY tenant_update_%I ON %I
         FOR UPDATE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin())
         WITH CHECK (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_delete_%I ON %I;
       CREATE POLICY tenant_delete_%I ON %I
         FOR DELETE
         USING (school_id = (auth.jwt() ->> ''school_id'')::UUID OR is_super_admin());',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. INDEXES + TRIGGERS — every FK + the dashboard query path
--    (guarded: skipped with a NOTICE if 013 has not been applied)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.fee_heads') IS NULL THEN
    RAISE NOTICE '026: finance tables missing (migration 013 not applied); skipping indexes and triggers.';
    RETURN;
  END IF;

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_fee_heads_school ON fee_heads (school_id);
  CREATE INDEX IF NOT EXISTS idx_fee_templates_school ON fee_templates (school_id);
  CREATE INDEX IF NOT EXISTS idx_fee_template_items_template ON fee_template_items (template_id);
  CREATE INDEX IF NOT EXISTS idx_fee_template_items_head ON fee_template_items (fee_head_id);
  CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_school ON section_fee_defaults (school_id);
  CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_template ON section_fee_defaults (template_id);
  CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_head ON section_fee_defaults (fee_head_id);
  CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_school ON class_fee_overrides (school_id);
  CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_class ON class_fee_overrides (class_id);
  CREATE INDEX IF NOT EXISTS idx_class_fee_overrides_head ON class_fee_overrides (fee_head_id);
  CREATE INDEX IF NOT EXISTS idx_student_fees_school ON student_fees (school_id);
  CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees (student_id);
  CREATE INDEX IF NOT EXISTS idx_student_fees_term ON student_fees (term_id);
  CREATE INDEX IF NOT EXISTS idx_student_fees_head ON student_fees (fee_head_id);
  CREATE INDEX IF NOT EXISTS idx_student_fees_school_term_paid ON student_fees (school_id, term_id, is_paid);
  CREATE INDEX IF NOT EXISTS idx_payments_school ON payments (school_id);
  CREATE INDEX IF NOT EXISTS idx_payments_student ON payments (student_id);
  CREATE INDEX IF NOT EXISTS idx_payments_term ON payments (term_id);
  CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON payments (recorded_by);
  CREATE INDEX IF NOT EXISTS idx_receipts_school ON receipts (school_id);
  CREATE INDEX IF NOT EXISTS idx_receipts_payment ON receipts (payment_id);
  CREATE INDEX IF NOT EXISTS idx_receipts_student ON receipts (student_id);
  CREATE INDEX IF NOT EXISTS idx_discounts_school ON discounts (school_id);
  CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts (school_id, is_active);
  CREATE INDEX IF NOT EXISTS idx_student_discounts_school ON student_discounts (school_id);
  CREATE INDEX IF NOT EXISTS idx_student_discounts_student ON student_discounts (student_id);
  CREATE INDEX IF NOT EXISTS idx_student_discounts_discount ON student_discounts (discount_id);
  CREATE INDEX IF NOT EXISTS idx_payment_plans_school ON payment_plans (school_id);
  CREATE INDEX IF NOT EXISTS idx_payment_plans_student ON payment_plans (student_id);
  CREATE INDEX IF NOT EXISTS idx_payment_plans_term ON payment_plans (term_id);
  CREATE INDEX IF NOT EXISTS idx_plan_installments_plan ON payment_plan_installments (plan_id);
  CREATE INDEX IF NOT EXISTS idx_plan_installments_payment ON payment_plan_installments (payment_id);

  -- updated_at triggers (fee_heads / fee_templates are the only finance
  -- tables with an updated_at column)
  DROP TRIGGER IF EXISTS update_fee_heads_updated_at ON fee_heads;
  CREATE TRIGGER update_fee_heads_updated_at
    BEFORE UPDATE ON fee_heads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_fee_templates_updated_at ON fee_templates;
  CREATE TRIGGER update_fee_templates_updated_at
    BEFORE UPDATE ON fee_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. CHECK CONSTRAINTS — money must never be negative; discounts stay sane
--    Each is guarded (table existence + constraint absence) so re-runs and
--    fresh-DB ordering never matter.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.fee_heads') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_heads_school_name_key') THEN
    BEGIN
      ALTER TABLE fee_heads ADD CONSTRAINT fee_heads_school_name_key UNIQUE (school_id, name);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'fee_heads already contains duplicate (school_id, name) rows; unique constraint NOT added. Deduplicate rows before enabling.';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.fee_template_items') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_template_items_amount_check') THEN
    ALTER TABLE fee_template_items ADD CONSTRAINT fee_template_items_amount_check CHECK (default_amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.section_fee_defaults') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'section_fee_defaults_amount_check') THEN
    ALTER TABLE section_fee_defaults ADD CONSTRAINT section_fee_defaults_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.class_fee_overrides') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'class_fee_overrides_amount_check') THEN
    ALTER TABLE class_fee_overrides ADD CONSTRAINT class_fee_overrides_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.student_fees') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_fees_amount_check') THEN
    ALTER TABLE student_fees ADD CONSTRAINT student_fees_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.student_fees') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_fees_discount_check') THEN
    ALTER TABLE student_fees ADD CONSTRAINT student_fees_discount_check CHECK (discount_amount >= 0 AND discount_amount <= amount);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_amount_check') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_reprint_count_check') THEN
    ALTER TABLE receipts ADD CONSTRAINT receipts_reprint_count_check CHECK (reprint_count >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.discounts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_value_check') THEN
    ALTER TABLE discounts ADD CONSTRAINT discounts_value_check CHECK (value >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.discounts') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discounts_percentage_range_check') THEN
    ALTER TABLE discounts ADD CONSTRAINT discounts_percentage_range_check CHECK (discount_type <> 'percentage' OR value <= 100);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_plans') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_total_amount_check') THEN
    ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_total_amount_check CHECK (total_amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_plans') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_plans_installment_count_check') THEN
    ALTER TABLE payment_plans ADD CONSTRAINT payment_plans_installment_count_check CHECK (installment_count >= 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_plan_installments') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plan_installments_amount_check') THEN
    ALTER TABLE payment_plan_installments ADD CONSTRAINT plan_installments_amount_check CHECK (amount >= 0);
  END IF;
END;
$$;
-- ============================================================================
-- SchoolAid — Migration 027: Finance Phase 1 — allocation & integrity
-- Additive + idempotent. Requires migrations 013 and 026 to be applied first
-- (guarded with to_regclass so it is also safe on a DB without them).
--
-- Contents:
--   1. fee_allocations — payment ↔ bill-line allocation (partial payments).
--      A student_fee is "paid" when SUM(fee_allocations.amount) >= net_amount;
--      balances are derived from allocations, NOT from student_fees.is_paid.
--   2. Receipt numbering scoped per school (receipt_number unique per school,
--      not globally) — generation happens in the app with a per-school counter.
--   3. class_id snapshot on student_fees — a bill keeps the class (and thus
--      pricing context) the student was in when the bill was generated, so
--      promotions never rewrite historical bills.
--   4. [PENDING DECISION] section binding — academic_level_id on
--      section_fee_defaults (Option A, recommended). If Option B (stay on
--      grade_level TEXT) is chosen, delete section 4 before applying.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FEE ALLOCATIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id),
  payment_id     UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  student_fee_id UUID NOT NULL REFERENCES student_fees(id),
  amount         DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (payment_id, student_fee_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_alloc_school  ON fee_allocations (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_fee     ON fee_allocations (student_fee_id);
CREATE INDEX IF NOT EXISTS idx_fee_alloc_payment ON fee_allocations (payment_id);

-- RLS + tenant policies (same style as 001/026)
ALTER TABLE fee_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_fee_allocations ON fee_allocations;
CREATE POLICY tenant_select_fee_allocations ON fee_allocations
  FOR SELECT
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_fee_allocations ON fee_allocations;
CREATE POLICY tenant_insert_fee_allocations ON fee_allocations
  FOR INSERT
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_fee_allocations ON fee_allocations;
CREATE POLICY tenant_update_fee_allocations ON fee_allocations
  FOR UPDATE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin())
  WITH CHECK (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_fee_allocations ON fee_allocations;
CREATE POLICY tenant_delete_fee_allocations ON fee_allocations
  FOR DELETE
  USING (school_id = (auth.jwt() ->> 'school_id')::UUID OR is_super_admin());

-- ----------------------------------------------------------------------------
-- 2. RECEIPTS — per-school receipt numbering
--    (receipt_number unique within a school instead of globally; the app
--     generates numbers via a per-school counter, the constraint is the
--     safety net)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.receipts') IS NOT NULL THEN
    ALTER TABLE receipts DROP CONSTRAINT IF EXISTS receipts_receipt_number_key;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_receipt_number_school_key') THEN
      ALTER TABLE receipts ADD CONSTRAINT receipts_receipt_number_school_key UNIQUE (school_id, receipt_number);
    END IF;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. STUDENT FEES — class snapshot column
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.student_fees') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'student_fees' AND column_name = 'class_id') THEN
    ALTER TABLE student_fees ADD COLUMN class_id UUID REFERENCES classes(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_student_fees_class ON student_fees (class_id);
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. [PENDING DECISION — Option A] SECTION BINDING
--    Binds section_fee_defaults to academic_levels (the canonical section
--    model from migration 019). Resolution at billing time:
--      class → classes.academic_level_id → section default
--      class → class_fee_overrides (exception wins)
--    If Option B (keep grade_level TEXT) is chosen, DELETE this section.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.section_fee_defaults') IS NOT NULL
     AND to_regclass('public.academic_levels') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name = 'section_fee_defaults' AND column_name = 'academic_level_id') THEN
    ALTER TABLE section_fee_defaults ADD COLUMN academic_level_id UUID REFERENCES academic_levels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_section_fee_defaults_level ON section_fee_defaults (academic_level_id);
  END IF;
END;
$$;
