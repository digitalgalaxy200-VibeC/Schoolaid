#!/usr/bin/env node
/**
 * Generates the SQL import + rollback files from creamsville-students.tsv.
 *
 *   node scripts/generate-import-sql.mjs
 *
 * Outputs (gitignored, they contain student PII):
 *   scripts/out/creamsville-import.sql
 *   scripts/out/creamsville-rollback.sql
 */

import fs from "node:fs";
import path from "node:path";

const TSV = path.resolve("creamsville-students.tsv");
const OUT = path.resolve("scripts/out");

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function sqlText(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseDob(raw) {
  const m = String(raw || "").match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) throw new Error(`unparseable date "${raw}"`);
  let day = Number(m[1]);
  let month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year <= 30 ? 2000 : 1900;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    throw new Error(`invalid date "${raw}"`);
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function driveId(url) {
  if (!url) return "";
  const m =
    String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
    String(url).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : "";
}

// ── Read roster ──────────────────────────────────────────────────────────────

const lines = fs
  .readFileSync(TSV, "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0);
const header = lines.shift().split("\t").map((h) => h.trim().toLowerCase());
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const rows = lines.map((line) => {
  const c = line.split("\t");
  const get = (k) => (idx[k] === undefined ? "" : collapse(c[idx[k]] ?? ""));
  return {
    code: get("code").toUpperCase(),
    name: get("name"),
    gender: get("gender"),
    dob: parseDob(get("dob")),
    className: get("class"),
    guardian: get("guardian"),
    address: get("address"),
    phone: get("phone"),
    photoId: driveId(get("photo_url")),
  };
});

if (rows.length !== 90) throw new Error(`expected 90 rows, found ${rows.length}`);
if (rows.some((r) => !r.code || !r.name || !r.className)) {
  throw new Error("a row is missing its code, name or class");
}
const duplicateCodes = rows.filter((r, i) => rows.findIndex((x) => x.code === r.code) !== i);
if (duplicateCodes.length) throw new Error(`duplicate codes: ${duplicateCodes.map((r) => r.code).join(", ")}`);

const PREFERRED = ["RECEPTION", "YEAR 1", "YEAR 2", "YEAR 3", "YEAR 4", "YEAR 5", "STARS", "SPRING GARDEN", "HEADSTART"];
const classNames = [...new Set(rows.map((r) => r.className))].sort((a, b) => {
  const ai = PREFERRED.indexOf(a.toUpperCase());
  const bi = PREFERRED.indexOf(b.toUpperCase());
  if (ai === -1 && bi === -1) return a.localeCompare(b);
  if (ai === -1) return 1;
  if (bi === -1) return -1;
  return ai - bi;
});

const generatedAt = new Date().toISOString();
const classValues = classNames.map((n) => `    (${sqlText(n)})`).join(",\n");
const studentValues = rows
  .map(
    (r) =>
      `  (${sqlText(r.code)}, ${sqlText(r.name)}, ${sqlText(r.gender)}, ${sqlText(r.dob)}, ${sqlText(
        r.className,
      )}, ${sqlText(r.guardian)}, ${sqlText(r.address)}, ${sqlText(r.phone)}, ${sqlText(r.photoId)})`,
  )
  .join(",\n");
const codeValues = rows.map((r) => `  (${sqlText(r.code)})`).join(",\n");

// ── Import SQL ───────────────────────────────────────────────────────────────

const importSql = `-- ============================================================================
-- Creamsville School — student registration (generated)
-- Source: creamsville-students.tsv   Generated: ${generatedAt}
-- Rows: ${rows.length}   Classes: ${classNames.length}
--
-- RUN THIS IN THE SUPABASE SQL EDITOR (project iojiahkehnijxxczrgft).
--
-- !! THIS FILE CANNOT COMPLETE ON A STANDARD SUPABASE PROJECT !!
-- Section 6 writes auth.users, which is owned by supabase_auth_admin. The SQL
-- editor role receives: 42501 must be owner of table users.
-- Use the supported Admin API instead:
--     node scripts/import-students.mjs --apply
-- This file is kept only as a reference for the non-auth statements.
--
-- It is a single transaction: any error rolls the whole thing back.
-- It is create-only and idempotent: students whose CVS code already exists are
-- skipped, so running it twice does not duplicate anything.
--
-- PHOTOS: by default each student's photo_url is set to a Google Drive
-- thumbnail (works only while the Drive file is shared "anyone with the link").
-- To import without photos, uncomment the "no photos" line in section 5.
--
-- PASSWORDS: generated as CRE + 8 digits, hashed with bcrypt by pgcrypto before
-- they reach auth.users. The plaintext is stored in students.generated_password
-- because that is what the existing admin UI does; it is also printed at the end
-- so you can hand it out.
--
-- ROLLBACK: scripts/out/creamsville-rollback.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

SET LOCAL search_path = public, extensions;
SET LOCAL statement_timeout = '600s';

-- ── 1. Resolve the school, fail closed ──────────────────────────────────────

CREATE TEMP TABLE _cv_school ON COMMIT DROP AS
SELECT id AS school_id, name, abbreviation
FROM schools
WHERE name ILIKE '%cream%' AND is_active;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _cv_school;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active school matching "cream", found %', n;
  END IF;
  IF (SELECT abbreviation FROM _cv_school) IS NULL
     OR (SELECT abbreviation FROM _cv_school) = '' THEN
    RAISE EXCEPTION 'School has no abbreviation; cannot build login emails.';
  END IF;
END $$;

-- ── 2. Classes — create only what is missing ────────────────────────────────

INSERT INTO classes (school_id, name, academic_session_id)
SELECT s.school_id, v.name,
       (SELECT a.id FROM academic_sessions a
         WHERE a.school_id = s.school_id AND a.is_active
         ORDER BY a.start_date DESC LIMIT 1)
FROM _cv_school s
CROSS JOIN (VALUES
${classValues}
) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM classes c
  WHERE c.school_id = s.school_id AND lower(c.name) = lower(v.name)
);

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(DISTINCT v.name, ', ') INTO missing
  FROM (VALUES
${classValues}
  ) AS v(name)
  WHERE NOT EXISTS (
    SELECT 1 FROM classes c
    JOIN _cv_school s ON s.school_id = c.school_id
    WHERE lower(c.name) = lower(v.name)
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Classes still missing after creation: %', missing;
  END IF;
END $$;

-- ── 3. Roster ───────────────────────────────────────────────────────────────

CREATE TEMP TABLE _cv_students (
  code       text PRIMARY KEY,
  full_name  text NOT NULL,
  gender     text,
  dob        date,
  class_name text NOT NULL,
  guardian   text,
  address    text,
  phone      text,
  photo_id   text
) ON COMMIT DROP;

INSERT INTO _cv_students (code, full_name, gender, dob, class_name, guardian, address, phone, photo_id) VALUES
${studentValues};

-- ── 4. Idempotency: drop rows whose CVS code already exists ────────────────

DELETE FROM _cv_students st
WHERE EXISTS (
  SELECT 1 FROM students s
  JOIN _cv_school sc ON sc.school_id = s.school_id
  WHERE s.student_id = st.code
);

DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM _cv_students;
  IF remaining = 0 THEN
    RAISE NOTICE 'Nothing to do: all % students already exist.', ${rows.length};
  ELSE
    RAISE NOTICE 'Registering % students (of ${rows.length}).', remaining;
  END IF;
END $$;

-- ── 5. Photos, emails, passwords ────────────────────────────────────────────

ALTER TABLE _cv_students
  ADD COLUMN email text,
  ADD COLUMN pwd text,
  ADD COLUMN photo_url text;

UPDATE _cv_students
SET photo_url = CASE
  WHEN photo_id IS NULL OR photo_id = '' THEN NULL
  ELSE 'https://drive.google.com/thumbnail?id=' || photo_id || '&sz=w1024'
END;

-- To import without photos, uncomment:
-- UPDATE _cv_students SET photo_url = NULL;

-- Email: first 3 letters of the school name is not used here; the domain is the
-- school abbreviation, matching the app's <slug>@<abbreviation>.com convention.
WITH base AS (
  SELECT code, regexp_replace(lower(full_name), '[^a-z0-9]', '', 'g') AS slug
  FROM _cv_students
), numbered AS (
  SELECT code, slug, row_number() OVER (PARTITION BY slug ORDER BY code) AS rn
  FROM base
)
UPDATE _cv_students st
SET email = (CASE WHEN n.rn = 1 THEN n.slug ELSE n.slug || n.rn::text END)
            || '@' || lower((SELECT abbreviation FROM _cv_school)) || '.com'
FROM numbered n
WHERE n.code = st.code;

-- If the address is already used by another profile in this school, add a
-- numeric suffix, exactly like the admin route does.
DO $$
DECLARE
  r record;
  n int;
  base text;
  domain text;
  candidate text;
BEGIN
  FOR r IN SELECT code, email FROM _cv_students ORDER BY code LOOP
    base := split_part(r.email, '@', 1);
    domain := '@' || split_part(r.email, '@', 2);
    candidate := r.email;
    n := 2;
    WHILE EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.school_id = (SELECT school_id FROM _cv_school)
              AND lower(p.email) = lower(candidate)
          )
       OR EXISTS (
            SELECT 1 FROM _cv_students x
            WHERE x.code <> r.code AND lower(x.email) = lower(candidate)
          )
    LOOP
      candidate := base || n::text || domain;
      n := n + 1;
    END LOOP;
    IF candidate <> r.email THEN
      UPDATE _cv_students SET email = candidate WHERE code = r.code;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(st.email, ', ') INTO clash
  FROM _cv_students st
  JOIN auth.users u ON lower(u.email) = lower(st.email);
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'These emails already exist in auth.users without a student row: %. Resolve them before running.', clash;
  END IF;
END $$;

-- Password: first 3 letters of the school name + 8 random digits.
UPDATE _cv_students
SET pwd = left(upper(regexp_replace((SELECT name FROM _cv_school), '[^a-zA-Z]', '', 'g')), 3)
          || lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0');

-- If two generated passwords collide inside this batch, regenerate one.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT code FROM (
      SELECT code, pwd, row_number() OVER (PARTITION BY pwd ORDER BY code) AS rn
      FROM _cv_students
    ) x WHERE x.rn > 1
  LOOP
    UPDATE _cv_students
    SET pwd = left(upper(regexp_replace((SELECT name FROM _cv_school), '[^a-zA-Z]', '', 'g')), 3)
              || lpad((abs(('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0')
    WHERE code = r.code;
  END LOOP;
END $$;

-- ── 6. Auth users ───────────────────────────────────────────────────────────
-- The on_auth_user_created trigger creates a bare profiles row; section 7 fills
-- in school_id and the avatar.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
SELECT
  COALESCE((SELECT instance_id FROM auth.users LIMIT 1), '00000000-0000-0000-0000-000000000000'),
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  st.email,
  crypt(st.pwd, gen_salt('bf', 10)),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'full_name', st.full_name,
    'role', 'student',
    'school_id', (SELECT school_id::text FROM _cv_school)
  )
FROM _cv_students st
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(st.email)
);

-- ── 7. Email identities (schema-aware) ──────────────────────────────────────

DO $$
DECLARE
  v_id_type text;
  v_has_provider_id boolean;
  v_id_expr text;
BEGIN
  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'id';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
  ) INTO v_has_provider_id;

  v_id_expr := CASE WHEN v_id_type = 'uuid' THEN 'gen_random_uuid()' ELSE 'gen_random_uuid()::text' END;

  EXECUTE format($q$
    INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at%s)
    SELECT %s, u.id,
           jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
           'email', now(), now(), now()%s
    FROM auth.users u
    JOIN _cv_students st ON lower(st.email) = lower(u.email)
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
    )
  $q$,
    CASE WHEN v_has_provider_id THEN ', provider_id' ELSE '' END,
    v_id_expr,
    CASE WHEN v_has_provider_id THEN ', u.id::text' ELSE '' END
  );
END $$;

-- ── 8. Profiles ─────────────────────────────────────────────────────────────

INSERT INTO profiles (id, school_id, full_name, email, role, is_active, avatar_url)
SELECT u.id, s.school_id, st.full_name, st.email, 'student', true, st.photo_url
FROM _cv_students st
JOIN auth.users u ON lower(u.email) = lower(st.email)
CROSS JOIN _cv_school s
ON CONFLICT (id) DO UPDATE SET
  school_id  = EXCLUDED.school_id,
  full_name  = EXCLUDED.full_name,
  email      = EXCLUDED.email,
  role       = 'student',
  is_active  = true,
  avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);

-- ── 9. Students ─────────────────────────────────────────────────────────────

INSERT INTO students (
  school_id, profile_id, student_id, class_id, date_of_birth, gender,
  parent_name, parent_phone, parent_location, photo_url,
  status, generated_password, must_change_password
)
SELECT
  s.school_id,
  u.id,
  st.code,
  c.id,
  st.dob,
  st.gender,
  NULLIF(st.guardian, ''),
  NULLIF(st.phone, ''),
  NULLIF(st.address, ''),
  st.photo_url,
  'active',
  st.pwd,
  true
FROM _cv_students st
JOIN auth.users u ON lower(u.email) = lower(st.email)
CROSS JOIN _cv_school s
JOIN LATERAL (
  SELECT c.id
  FROM classes c
  WHERE c.school_id = s.school_id AND lower(c.name) = lower(st.class_name)
  ORDER BY (
    c.academic_session_id = (
      SELECT a.id FROM academic_sessions a
      WHERE a.school_id = s.school_id AND a.is_active
      ORDER BY a.start_date DESC LIMIT 1
    )
  ) DESC NULLS LAST, c.created_at
  LIMIT 1
) c ON true
WHERE NOT EXISTS (
  SELECT 1 FROM students x
  WHERE x.school_id = s.school_id AND x.student_id = st.code
);

-- ── 10. Password registry (only if this database uses the 006 shape) ───────

DO $$
DECLARE
  v_has_password boolean;
  v_has_password_string boolean;
  v_has_prefix boolean;
  v_has_role boolean;
  v_cols text := '';
  v_vals text := '';
  v_where text;
  v_digest text := $d$encode(digest('schooled-password-registry:v1:' || st.pwd, 'sha256'), 'hex')$d$;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_history' AND column_name = 'password')
    INTO v_has_password;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_history' AND column_name = 'password_string')
    INTO v_has_password_string;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_history' AND column_name = 'school_prefix')
    INTO v_has_prefix;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'password_history' AND column_name = 'role')
    INTO v_has_role;

  IF v_has_password THEN
    v_cols := v_cols || 'password, ';
    v_vals := v_vals || v_digest || ', ';
    v_where := format('NOT EXISTS (SELECT 1 FROM password_history ph WHERE ph.password = %s)', v_digest);
  END IF;

  IF v_has_password_string THEN
    v_cols := v_cols || 'password_string, ';
    v_vals := v_vals || v_digest || ', ';
    IF v_where IS NULL THEN
      v_where := format('NOT EXISTS (SELECT 1 FROM password_history ph WHERE ph.password_string = %s)', v_digest);
    END IF;
  END IF;

  IF v_has_prefix THEN
    v_cols := v_cols || 'school_prefix, ';
    v_vals := v_vals || $p$left(upper(regexp_replace((SELECT name FROM _cv_school), '[^a-zA-Z]', '', 'g')), 3) || 'S', $p$;
  END IF;

  IF v_has_role THEN
    v_cols := v_cols || 'role, ';
    v_vals := v_vals || $p$'student', $p$;
  END IF;

  IF v_cols = '' THEN
    RAISE NOTICE 'password_history has no recognised columns; registry step skipped.';
    RETURN;
  END IF;

  IF v_where IS NULL THEN
    v_where := 'true';
  END IF;

  v_cols := rtrim(v_cols, ', ');
  v_vals := rtrim(v_vals, ', ');

  EXECUTE format(
    'INSERT INTO password_history (%s) SELECT %s FROM _cv_students st WHERE %s',
    v_cols, v_vals, v_where
  );
END $$;

-- ── 11. Verification + hand-over list ──────────────────────────────────────

SELECT
  'created' AS what,
  count(*)  AS students
FROM students s
JOIN _cv_school sc ON sc.school_id = s.school_id
WHERE s.student_id IN (SELECT code FROM _cv_students);

SELECT
  st.code,
  st.full_name,
  st.class_name,
  st.email,
  st.pwd AS password,
  (u.id IS NOT NULL) AS has_login,
  (s.id IS NOT NULL) AS has_student_row
FROM _cv_students st
LEFT JOIN auth.users u ON lower(u.email) = lower(st.email)
LEFT JOIN students s ON s.student_id = st.code AND s.school_id = (SELECT school_id FROM _cv_school)
ORDER BY st.code;

COMMIT;
`;

// ── Rollback SQL ─────────────────────────────────────────────────────────────

const rollbackSql = `-- ============================================================================
-- Creamsville School — ROLLBACK of the generated import
-- Generated: ${generatedAt}
--
-- Deletes exactly the students whose CVS code is listed below, inside the one
-- active school matching "cream". If the number found differs from the expected
-- number below, it refuses and deletes nothing.
--
-- Set _cv_expect to the number the import actually created (default ${rows.length}).
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE _cv_school ON COMMIT DROP AS
SELECT id AS school_id FROM schools WHERE name ILIKE '%cream%' AND is_active;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _cv_school;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active school matching "cream", found %', n;
  END IF;
END $$;

CREATE TEMP TABLE _cv_codes (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _cv_codes (code) VALUES
${codeValues};

CREATE TEMP TABLE _cv_expect (n int) ON COMMIT DROP;
INSERT INTO _cv_expect (n) VALUES (${rows.length});

CREATE TEMP TABLE _cv_victims ON COMMIT DROP AS
SELECT s.profile_id
FROM students s
JOIN _cv_codes c ON c.code = s.student_id
CROSS JOIN _cv_school sc
WHERE s.school_id = sc.school_id;

DO $$
DECLARE found int; expected int;
BEGIN
  SELECT count(*) INTO found FROM _cv_victims;
  SELECT n INTO expected FROM _cv_expect;
  IF found <> expected THEN
    RAISE EXCEPTION 'Refusing to roll back: expected % students, found %. Nothing deleted.', expected, found;
  END IF;
END $$;

DELETE FROM students   WHERE profile_id IN (SELECT profile_id FROM _cv_victims);
DELETE FROM profiles   WHERE id         IN (SELECT profile_id FROM _cv_victims);
DELETE FROM auth.identities WHERE user_id IN (SELECT profile_id FROM _cv_victims);
DELETE FROM auth.users      WHERE id      IN (SELECT profile_id FROM _cv_victims);

SELECT 'remaining' AS what, count(*) AS students
FROM students s
JOIN _cv_school sc ON sc.school_id = s.school_id
WHERE s.student_id IN (SELECT code FROM _cv_codes);

COMMIT;
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "creamsville-import.sql"), importSql, "utf8");
fs.writeFileSync(path.join(OUT, "creamsville-rollback.sql"), rollbackSql, "utf8");

console.log(`rows: ${rows.length}, classes: ${classNames.join(", ")}`);
console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, "creamsville-import.sql"))}`);
console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, "creamsville-rollback.sql"))}`);
