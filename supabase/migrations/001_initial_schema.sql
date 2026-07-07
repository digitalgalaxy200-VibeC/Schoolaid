-- ============================================================================
-- SchoolAid — Phase 1: Complete Foundation
-- Migration 001: Initial Schema + RLS + JWT Claims + Indexes
-- ============================================================================
-- This migration is idempotent: safe to run multiple times on a fresh DB.
-- Schools in this file: "Super Admin" tables omit school_id; all tenant
-- tables include it for Row-Level Security enforcement.
-- ============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- 1a. Schools (tenant root — no school_id here)
CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
