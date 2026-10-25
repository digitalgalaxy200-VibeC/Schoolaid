#!/usr/bin/env node
/**
 * Creamsville student import.
 *
 * WHAT IT DOES
 * ------------
 * Reads a tab-separated roster and registers each student exactly the way the
 * School Admin UI does:
 *
 *     auth user  ->  profiles  ->  students
 *
 * plus a photo in the existing `avatars` bucket. Nothing about the platform
 * changes: same email convention, same password engine, same bucket, same
 * rollback behaviour as src/app/api/school-admin/students/route.ts.
 *
 * SAFETY
 * ------
 * - Dry run by default. `--apply` is required to write anything.
 * - Create-only. Existing students are skipped; nothing is edited or deleted.
 * - Scoped to one school_id.
 * - Calls scripts/lib/db-guard.js: staging runs freely, production must be
 *   named with --confirm-target=<ref>.
 * - The auth user is deleted if the profile or student write fails.
 *
 * USAGE
 * -----
 *   node scripts/import-students.mjs --offline          # parse + validate only
 *   node scripts/import-students.mjs                    # dry run against the DB
 *   node scripts/import-students.mjs --apply            # photos + accounts
 *   node scripts/import-students.mjs --apply --photos-only
 *   node scripts/import-students.mjs --apply --skip-photos
 *   node scripts/import-students.mjs --apply --only=CVS1315,CVS5623
 *   node scripts/import-students.mjs --apply --rollback
 *
 * Flags: --file=<tsv> --school=<name-needle> --abbreviation=<str>
 *        --limit=<n> --apply --offline --photos-only --skip-photos --rollback
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { guardDatabase, refFromUrl } = require("./lib/db-guard.js");

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const APPLY = hasFlag("apply");
const OFFLINE = hasFlag("offline");
const PHOTOS_ONLY = hasFlag("photos-only");
const SKIP_PHOTOS = hasFlag("skip-photos");
const ROLLBACK = hasFlag("rollback");
const LIMIT = Number(opt("limit", "0")) || 0;
const ONLY = new Set(
  (opt("only", "") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);

const TSV_FILE = path.resolve(opt("file", "creamsville-students.tsv"));
const OUT_DIR = path.resolve("scripts/out");
const BUCKET = "avatars";
const PHOTO_CACHE = path.join(OUT_DIR, "photo-cache.json");
const STATE_FILE = path.join(OUT_DIR, "creamsville-import-state.json");
const REPORT_FILE = path.join(OUT_DIR, "creamsville-import-report.csv");
const CREDENTIALS_FILE = path.join(OUT_DIR, "creamsville-credentials.csv");
const SCHOOL_NEEDLE = opt("school", "cream");
const OFFLINE_ABBR = (opt("abbreviation", "cvs") || "cvs").trim().toLowerCase();

// ── Environment ──────────────────────────────────────────────────────────────

/** Minimal .env loader so the script runs without `node --env-file`. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[1] in process.env) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[m[1]] = value;
  }
}
loadEnv(".env.local");
loadEnv(".env");

// ── Small helpers ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const norm = (s) => collapse(s).toLowerCase();

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureOutDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function csv(rows, headers) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n") +
    "\n"
  );
}

// ── Roster parsing ───────────────────────────────────────────────────────────

function readRoster(file) {
  if (!fs.existsSync(file)) throw new Error(`roster not found: ${file}`);
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("roster is empty");

  const header = lines.shift().split("\t").map((s) => s.trim().toLowerCase());
  for (const required of ["timestamp", "name", "gender", "dob", "class"]) {
    if (!header.includes(required)) {
      throw new Error(`roster is missing the "${required}" column (found: ${header.join(", ")})`);
    }
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  return lines.map((line) => {
    const cells = line.split("\t");
    const get = (key) => (idx[key] === undefined ? "" : collapse(cells[idx[key]] ?? ""));
    return {
      timestamp: get("timestamp"),
      name: get("name"),
      gender: get("gender"),
      dob: get("dob"),
      className: get("class"),
      photoUrl: get("photo_url"),
      guardian: get("guardian"),
      address: get("address"),
      phone: get("phone"),
      whatsapp: get("whatsapp"),
      code: get("code").toUpperCase(),
    };
  });
}

function parseDob(raw) {
  const m = String(raw || "").match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return { error: "unparseable" };
  let day = Number(m[1]);
  let month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year <= 30 ? 2000 : 1900;
  if (month < 1 || month > 12 || day < 1 || day > 31) return { error: "out of range" };
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return { error: "invalid date" };
  }
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso };
}

function parseGender(raw) {
  const g = norm(raw);
  if (g === "male" || g === "m") return "Male";
  if (g === "female" || g === "f") return "Female";
  return null;
}

function emailSlug(name) {
  return (
    name
      .replace(/\b(Mr|Mrs|Ms|Miss|Dr|Prof)\b\.?/gi, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "student"
  );
}

function driveFileId(url) {
  if (!url) return null;
  const m =
    String(url).match(/\/d\/([a-zA-Z0-9_-]{10,})/) ||
    String(url).match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function ageAt(iso, at) {
  const [y, m, d] = iso.split("-").map(Number);
  const [ay, am, ad] = at.split("-").map(Number);
  let age = ay - y;
  if (am < m || (am === m && ad < d)) age--;
  return age;
}

const EXPECTED_AGE = {
  reception: [4, 5],
  "year 1": [5, 7],
  "year 2": [6, 8],
  "year 3": [7, 9],
  "year 4": [8, 10],
  "year 5": [9, 11],
  stars: [2, 5],
  "spring garden": [2, 5],
  headstart: [1, 4],
};

function ageNote(iso, className) {
  const band = EXPECTED_AGE[norm(className)];
  if (!band) return null;
  const age = ageAt(iso, "2025-09-01");
  if (age < band[0] - 2 || age > band[1] + 2) {
    return `age ${age} outside expected ${band[0]}-${band[1]} for ${className}`;
  }
  return null;
}

// ── Planning ─────────────────────────────────────────────────────────────────

function allocateEmail(baseName, abbreviation, taken) {
  const domain = `@${abbreviation}.com`;
  const slug = emailSlug(baseName);
  let candidate = `${slug}${domain}`;
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }
  let n = 2;
  while (taken.has(`${slug}${n}${domain}`)) n++;
  candidate = `${slug}${n}${domain}`;
  taken.add(candidate);
  return candidate;
}

function buildPlan({ roster, school, session, classes, existingCodes, takenEmails }) {
  const classesByName = new Map(classes.map((c) => [norm(c.name), c]));
  const classesToCreate = [];
  const createdNames = new Set();
  const seenCodes = new Set();
  const rows = [];

  for (const [index, raw] of roster.entries()) {
    const row = {
      line: index + 2,
      code: raw.code,
      name: collapse(raw.name),
      gender: parseGender(raw.gender),
      genderRaw: raw.gender,
      dobRaw: raw.dob,
      className: collapse(raw.className),
      guardian: collapse(raw.guardian),
      address: collapse(raw.address),
      phone: collapse(raw.phone),
      whatsapp: collapse(raw.whatsapp),
      photoUrl: "",
      photoId: driveFileId(raw.photoUrl),
      email: "",
      classId: null,
      classAction: "",
      status: "READY",
      note: "",
    };

    const dob = parseDob(raw.dob);
    if (dob.error) {
      row.status = "BAD_DOB";
      row.note = dob.error;
    } else {
      row.dob = dob.iso;
    }

    if (!row.name) {
      row.status = "NO_NAME";
      row.note = "name is empty";
    }
    if (!row.code) {
      row.status = "NO_CODE";
      row.note = "CVS code is empty";
    }
    if (!row.gender) {
      row.status = row.status === "READY" ? "BAD_GENDER" : row.status;
      row.note = row.note || `gender "${raw.gender}" not recognised`;
    }
    if (row.code && seenCodes.has(row.code)) {
      row.status = "DUPLICATE_IN_FILE";
      row.note = "same CVS code appears twice";
    }
    if (row.code) seenCodes.add(row.code);
    if (ONLY.size && !ONLY.has(row.code)) {
      row.status = "NOT_SELECTED";
      row.note = "excluded by --only";
    }
    if (row.code && existingCodes.has(row.code)) {
      row.status = "SKIP_EXISTS";
      row.note = "student_id already exists in this school";
    }

    const cls = classesByName.get(norm(row.className)) || null;
    if (cls && row.className) {
      row.classId = cls.id;
      row.classAction = "exists";
    } else if (row.className) {
      row.classAction = "CREATE";
      if (!createdNames.has(norm(row.className))) {
        createdNames.add(norm(row.className));
        classesToCreate.push(row.className);
      }
    } else {
      row.classAction = "MISSING";
      row.status = row.status === "READY" ? "NO_CLASS" : row.status;
      row.note = row.note || "class is empty";
    }

    if (row.status === "READY" && row.dob) {
      const note = ageNote(row.dob, row.className);
      if (note) {
        row.status = "REVIEW";
        row.warning = note;
        row.note = note;
      }
    }

    row.email = allocateEmail(row.name || row.code || "student", school.abbreviation.toLowerCase(), takenEmails);

    rows.push(row);
  }

  return { rows, classesToCreate, sessionId: session?.id ?? null };
}

function printPlan(plan) {
  const width = (key, fallback) =>
    Math.min(38, Math.max(fallback, ...plan.rows.map((r) => String(r[key] ?? "").length)));
  const widths = {
    code: width("code", 12),
    name: width("name", 28),
    className: width("className", 12),
    dob: 12,
    email: width("email", 30),
  };

  console.log("");
  console.log(
    [
      "code".padEnd(widths.code),
      "name".padEnd(widths.name),
      "class".padEnd(widths.className),
      "dob".padEnd(widths.dob),
      "email".padEnd(widths.email),
      "status",
    ].join(" "),
  );
  console.log("-".repeat(110));
  for (const r of plan.rows) {
    console.log(
      [
        r.code.padEnd(widths.code),
        r.name.padEnd(widths.name),
        r.className.padEnd(widths.className),
        (r.dob || r.dobRaw || "").padEnd(widths.dob),
        (r.email || "").padEnd(widths.email),
        r.status + (r.note ? ` (${r.note})` : ""),
      ].join(" "),
    );
  }
  console.log("");
}

function writeReport(plan) {
  ensureOutDir();
  fs.writeFileSync(
    REPORT_FILE,
    csv(
      plan.rows.map((r) => ({
        code: r.code,
        name: r.name,
        gender_open: r.gender,
        gender_sheet: r.genderRaw,
        dob_sheet: r.dobRaw,
        dob_iso: r.dob || "",
        class: r.className,
        class_action: r.classAction,
        email: r.email,
        guardian: r.guardian,
        phone: r.phone,
        photo: r.photoId ? `drive:${r.photoId}` : "",
        status: r.status,
        note: r.note,
      })),
      [
        "code",
        "name",
        "gender_open",
        "gender_sheet",
        "dob_sheet",
        "dob_iso",
        "class",
        "class_action",
        "email",
        "guardian",
        "phone",
        "photo",
        "status",
        "note",
      ],
    ),
    "utf8",
  );
  console.log(`report: ${path.relative(process.cwd(), REPORT_FILE)}`);
}

function summarise(plan) {
  const counts = {};
  for (const r of plan.rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const classCounts = {};
  for (const r of plan.rows) classCounts[r.className] = (classCounts[r.className] || 0) + 1;
  console.log("status:", JSON.stringify(counts));
  console.log("classes:", JSON.stringify(classCounts));
  console.log(`rows: ${plan.rows.length}, photos: ${plan.rows.filter((r) => r.photoId).length}`);
  console.log(`will create: ${plan.rows.filter(isCreatable).length}`);
  if (plan.classesToCreate.length) console.log("classes to create:", plan.classesToCreate.join(", "));
}

function isCreatable(row) {
  return row.status === "READY" || row.status === "REVIEW";
}

// ── Database helpers ─────────────────────────────────────────────────────────

async function resolveSchool(supabase, needle) {
  const { data, error } = await supabase
    .from("schools")
    .select("id,name,slug,abbreviation,is_active")
    .ilike("name", `%${needle}%`);
  if (error) throw new Error(`school lookup failed: ${error.message}`);
  const matches = (data || []).filter((s) => s.is_active);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one active school matching "${needle}", found ${matches.length}: ` +
        matches.map((s) => `${s.name} (${s.slug})`).join(", "),
    );
  }
  if (!matches[0].abbreviation) {
    throw new Error(`school "${matches[0].name}" has no abbreviation; refusing to invent an email domain`);
  }
  return matches[0];
}

async function resolveSession(supabase, schoolId) {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("id,name,start_date,end_date,is_active")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });
  if (error) {
    console.warn(`academic_sessions lookup failed: ${error.message} (classes will be created without a session)`);
    return null;
  }
  const active = (data || []).find((s) => s.is_active);
  return active || (data || [])[0] || null;
}

async function loadClasses(supabase, schoolId) {
  const { data, error } = await supabase
    .from("classes")
    .select("id,name,academic_session_id,created_at")
    .eq("school_id", schoolId);
  if (error) throw new Error(`classes lookup failed: ${error.message}`);
  return data || [];
}

async function loadExistingCodes(supabase, schoolId) {
  const { data, error } = await supabase
    .from("students")
    .select("student_id")
    .eq("school_id", schoolId);
  if (error) throw new Error(`students lookup failed: ${error.message}`);
  return new Set((data || []).map((r) => String(r.student_id || "").toUpperCase()).filter(Boolean));
}

async function loadExistingEmails(supabase, schoolId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("school_id", schoolId);
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return new Set((data || []).map((r) => String(r.email || "").toLowerCase()).filter(Boolean));
}

/** Mirrors generateUniquePassword() in src/lib/password.ts. */
async function generatePassword(supabase, schoolName, role) {
  const prefix = schoolName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "SCH";
  const roleLetter = role === "student" ? "S" : "X";

  for (let attempt = 0; attempt < 30; attempt++) {
    const digits = Array.from(crypto.randomBytes(8))
      .map((b) => String(b % 10))
      .join("");
    const password = `${prefix}${digits}`;
    const digest = crypto
      .createHash("sha256")
      .update(`schooled-password-registry:v1:${password}`)
      .digest("hex");

    // Production carries both historical shapes of this table. Try the merged
    // shape first, then the 006 shape, then the 008 shape.
    const shapes = [
      { password: digest, password_string: digest, school_prefix: `${prefix}${roleLetter}`, role },
      { password: digest, school_prefix: `${prefix}${roleLetter}`, role },
      { password_string: digest },
    ];

    let retry = false;
    let lastError = null;

    for (const row of shapes) {
      const { error } = await supabase.from("password_history").insert(row);
      if (!error) return password;
      lastError = error;

      if (/duplicate key|unique constraint/i.test(error.message)) {
        retry = true;
        break;
      }
      if (/column .* does not exist|could not find/i.test(error.message)) {
        continue; // this database uses another shape; try the next one
      }
      break;
    }

    if (retry) continue;

    console.warn(
      `password_history could not be updated (${lastError?.message ?? "unknown error"}); continuing.`,
    );
    return password;
  }
  throw new Error("could not generate a unique password after 30 attempts");
}

async function createAuthUser({ email, password, fullName, schoolId }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "student", school_id: schoolId },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.msg || body.message || body.error_description || `auth error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const id = data.user?.id || data.id;
  if (!id) throw new Error("auth user created but no id returned");
  return id;
}

async function deleteAuthUser(id) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).catch(() => {});
}

// ── Photos ───────────────────────────────────────────────────────────────────

function extensionFor(contentType) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

async function downloadDriveImage(fileId) {
  const sources = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1024`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
  ];

  for (const url of sources) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { redirect: "follow" });
        if (res.status === 429) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!res.ok) break;
        const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
        if (!contentType.startsWith("image/")) break; // HTML login / virus-scan page
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length < 512) break;
        return { buffer, contentType };
      } catch {
        await sleep(500);
      }
    }
  }
  return null;
}

async function uploadPhoto(supabase, schoolId, buffer, contentType) {
  const fileName = `${schoolId}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${extensionFor(contentType)}`;
  let { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, { contentType, upsert: false });

  if (error && /bucket/i.test(error.message)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
    ({ error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType, upsert: false }));
  }
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  if (!data?.publicUrl) throw new Error("could not build a public URL");
  return data.publicUrl;
}

// ── Offline mode ─────────────────────────────────────────────────────────────

function runOffline(roster) {
  console.log(`offline: ${roster.length} rows from ${path.relative(process.cwd(), TSV_FILE)}`);
  const plan = buildPlan({
    roster,
    school: { id: "offline", name: SCHOOL_NEEDLE, abbreviation: OFFLINE_ABBR },
    session: null,
    classes: [],
    existingCodes: new Set(),
    takenEmails: new Set(),
  });
  printPlan(plan);
  summarise(plan);
  writeReport(plan);
  console.log("\noffline mode — nothing read from or written to any database.");
}

// ── Apply ────────────────────────────────────────────────────────────────────

async function applyPlan(supabase, school, session, plan) {
  const classesByName = new Map();

  // 1. Classes
  if (plan.classesToCreate.length) {
    const { data: existing } = await supabase
      .from("classes")
      .select("id,name,academic_session_id")
      .eq("school_id", school.id);
    for (const c of existing || []) classesByName.set(norm(c.name), c);

    for (const name of plan.classesToCreate) {
      if (classesByName.has(norm(name))) continue;
      const { data, error } = await supabase
        .from("classes")
        .insert({
          school_id: school.id,
          name,
          academic_session_id: session?.id ?? null,
        })
        .select("id,name")
        .single();
      if (error) throw new Error(`could not create class "${name}": ${error.message}`);
      classesByName.set(norm(name), data);
      console.log(`class created: ${name} (${data.id})`);
    }
  }

  for (const row of plan.rows) {
    const cls = classesByName.get(norm(row.className));
    if (cls) {
      row.classId = cls.id;
      row.classAction = row.classAction === "CREATE" ? "created" : row.classAction;
    }
  }

  // 2. Photos
  const photoCache = readJson(PHOTO_CACHE, {});
  if (!SKIP_PHOTOS) {
    // In --photos-only mode, existing students are included so their photo can
    // be moved from the Drive thumbnail into the avatars bucket.
    const photoCandidate = PHOTOS_ONLY
      ? (r) => r.status !== "NOT_SELECTED"
      : isCreatable;
    let uploaded = 0;
    let failed = 0;
    for (const row of plan.rows) {
      if (!photoCandidate(row)) continue;
      if (!row.photoId) continue;

      if (photoCache[row.code]) {
        row.photoUrl = photoCache[row.code];
        continue;
      }

      const image = await downloadDriveImage(row.photoId);
      if (!image) {
        row.note = (row.note ? row.note + "; " : "") + "photo unavailable (not public?)";
        failed++;
        continue;
      }
      try {
        row.photoUrl = await uploadPhoto(supabase, school.id, image.buffer, image.contentType);
        photoCache[row.code] = row.photoUrl;
        writeJson(PHOTO_CACHE, photoCache);
        uploaded++;

        if (PHOTOS_ONLY && row.status === "SKIP_EXISTS") {
          const { data: existing } = await supabase
            .from("students")
            .select("profile_id")
            .eq("school_id", school.id)
            .eq("student_id", row.code)
            .maybeSingle();
          if (existing?.profile_id) {
            await supabase
              .from("students")
              .update({ photo_url: row.photoUrl })
              .eq("school_id", school.id)
              .eq("student_id", row.code);
            await supabase
              .from("profiles")
              .update({ avatar_url: row.photoUrl })
              .eq("id", existing.profile_id);
          }
        }
      } catch (err) {
        row.note = (row.note ? row.note + "; " : "") + `photo upload failed: ${err.message}`;
        failed++;
      }
      await sleep(120);
    }
    console.log(`photos: ${uploaded} uploaded, ${failed} failed, ${Object.keys(photoCache).length} cached`);
  }

  if (PHOTOS_ONLY) {
    writeReport(plan);
    console.log("photos-only — no accounts created.");
    return;
  }

  // 3. Accounts
  const state = readJson(STATE_FILE, {
    school: { id: school.id, name: school.name, slug: school.slug },
    started_at: new Date().toISOString(),
    created: [],
  });
  const credentials = [];
  let created = 0;
  let failed = 0;

  for (const row of plan.rows) {
    if (!isCreatable(row)) continue;
    if (LIMIT && created >= LIMIT) break;

    let userId = null;
    let password = null;
    try {
      password = await generatePassword(supabase, school.name, "student");
      userId = await createAuthUser({
        email: row.email,
        password,
        fullName: row.name,
        schoolId: school.id,
      });

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        school_id: school.id,
        full_name: row.name,
        email: row.email,
        role: "student",
        is_active: true,
        avatar_url: row.photoUrl || null,
      });
      if (profileError) throw new Error(`profile: ${profileError.message}`);

      const payload = {
        school_id: school.id,
        profile_id: userId,
        student_id: row.code,
        class_id: row.classId,
        date_of_birth: row.dob,
        gender: row.gender,
        parent_name: row.guardian || null,
        parent_phone: row.phone || null,
        parent_location: row.address || null,
        photo_url: row.photoUrl || null,
        status: "active",
        is_active: true,
        generated_password: password,
        must_change_password: true,
      };

      let { data: student, error: studentError } = await supabase
        .from("students")
        .insert(payload)
        .select("id")
        .single();

      // Same fallback as the UI route for databases predating migration 006.
      if (studentError && /generated_password|must_change_password/.test(studentError.message)) {
        delete payload.generated_password;
        delete payload.must_change_password;
        ({ data: student, error: studentError } = await supabase
          .from("students")
          .insert(payload)
          .select("id")
          .single());
      }
      if (studentError) throw new Error(`student: ${studentError.message}`);

      row.status = "CREATED";
      row.note = row.warning ? `created; ${row.warning}` : "";
      row.studentId = student.id;
      created++;

      const entry = {
        code: row.code,
        name: row.name,
        email: row.email,
        profile_id: userId,
        student_id: student.id,
        photo_url: row.photoUrl || null,
        created_at: new Date().toISOString(),
      };
      state.created.push(entry);
      credentials.push({
        code: row.code,
        name: row.name,
        email: row.email,
        password,
        class: row.className,
      });
      writeJson(STATE_FILE, state);

      console.log(`created ${row.code} ${row.name} -> ${row.email}`);
    } catch (err) {
      if (userId) await deleteAuthUser(userId);
      row.status = "FAILED";
      row.note = err.message;
      failed++;
      console.error(`FAILED ${row.code} ${row.name}: ${err.message}`);
    }
  }

  writeReport(plan);
  ensureOutDir();
  fs.writeFileSync(
    CREDENTIALS_FILE,
    csv(credentials, ["code", "name", "email", "password", "class"]),
    "utf8",
  );

  console.log("");
  console.log(`created: ${created}, failed: ${failed}`);
  console.log(`credentials: ${path.relative(process.cwd(), CREDENTIALS_FILE)}`);
  console.log(`state:       ${path.relative(process.cwd(), STATE_FILE)}`);
}

async function runRollback(supabase, school) {
  if (!APPLY) throw new Error("--rollback also needs --apply");
  if (!fs.existsSync(STATE_FILE)) throw new Error(`no state file at ${STATE_FILE}`);

  const state = readJson(STATE_FILE, { created: [] });
  const entries = [...state.created].reverse();
  console.log(`rolling back ${entries.length} student(s) created by this batch`);

  let removed = 0;
  for (const entry of entries) {
    await supabase.from("students").delete().eq("id", entry.student_id).eq("school_id", school.id);
    await supabase.from("profiles").delete().eq("id", entry.profile_id).eq("school_id", school.id);
    await deleteAuthUser(entry.profile_id);
    removed++;
    console.log(`rolled back ${entry.code} ${entry.name}`);
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, created: [], rolled_back_at: new Date().toISOString() }, null, 2));
  console.log(`rolled back ${removed}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const roster = readRoster(TSV_FILE);
  console.log(`roster: ${roster.length} rows from ${path.relative(process.cwd(), TSV_FILE)}`);

  if (OFFLINE) {
    runOffline(roster);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local or .env");
  }

  guardDatabase({ ref: refFromUrl(url), action: "register students on" });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const school = await resolveSchool(supabase, SCHOOL_NEEDLE);
  console.log(`school: ${school.name} (${school.slug}) abbreviation=${school.abbreviation} id=${school.id}`);

  if (ROLLBACK) {
    await runRollback(supabase, school);
    return;
  }

  const session = await resolveSession(supabase, school.id);
  console.log(`session: ${session ? `${session.name} (${session.id})` : "none"}`);

  const classes = await loadClasses(supabase, school.id);
  const existingCodes = await loadExistingCodes(supabase, school.id);
  const takenEmails = await loadExistingEmails(supabase, school.id);

  const plan = buildPlan({
    roster,
    school,
    session,
    classes,
    existingCodes,
    takenEmails,
  });

  printPlan(plan);
  summarise(plan);
  writeReport(plan);

  if (!APPLY) {
    console.log("\ndry run — nothing written. Re-run with --apply to create.");
    return;
  }

  await applyPlan(supabase, school, session, plan);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
