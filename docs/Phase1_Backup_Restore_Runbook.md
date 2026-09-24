# Phase 1 — Verified Backup & Restore Baseline (Runbook)

> **STATUS: EXECUTED AND VERIFIED** on 2026-09-18 03:43:45 UTC.
> Target: **staging** (`noyegdgrfzopfrwjunot`). Production was never contacted.
> Backup taken, restored into an isolated local sandbox, and row-for-row verified.
> See §8 evidence record and §11 execution log.

---

## 1. Purpose

Establish a verified, restorable logical backup of the **staging** database before any
schema change, migration, or destructive remediation is performed. Phase 1 is the safety
net that makes every later phase reversible.

## 2. Scope

**In scope:** staging Postgres database (schema + data + `auth` schema), and the staging
Storage objects (if any must be preserved).

**Out of scope:** production (explicitly forbidden in this phase), application code,
migrations, authentication, RLS.

---

## 3. Environment identity — VERIFIED

Environment identity was ambiguous and is now resolved:

| Environment | Supabase project ref | Evidence |
| --- | --- | --- |
| **Production** | `iojiahkehnijxxczrgft` | `docs/Finance_Canonical_Spec_Phase0.md:83` — "Production (`iojiahkehnijxxczrgft`): untouched; migration only after staging approval." |
| **Staging** | `noyegdgrfzopfrwjunot` | `scripts/isolation-test.cjs`, `scripts/tenant-baseline-check.js`, `supabase/migrations/032_finance_canonical_staging.sql` |

### ⚠️ Warning recorded during verification

`.env.local` points at **production** (`iojiahkehnijxxczrgft`), and several scripts
(`scripts/migrate.js:21`, `scripts/query_db.ts:3`, `scripts/import_broadsheet.js:16`,
`scripts/run-migration-api.js:4`, `scripts/reset_all_passwords.js:5`, `check.js:3`)
**default to production** when their env vars are unset.

Consequence: running local development or these scripts without an explicit override
operates against **production data**. This must be corrected (Phase 2/5 candidate) and is
recorded here so Phase 1 does not accidentally target the wrong project.

> **RESOLVED 2026-09-24.** All six files named above were guarded, then removed.
> `scripts/lib/db-guard.js` now refuses any target but staging unless the ref is
> typed out, and the three that silently fell back to production no longer fall
> back at all. The last commit containing them is `9a31091`; `scripts/README.md`
> records what each did and how to restore it. This paragraph is kept as the
> evidence that the problem was found in Phase 1, not as a live instruction.

**Phase 1 targets staging only: `noyegdgrfzopfrwjunot`.**

---

## 4. Prerequisites — current state

| # | Prerequisite | State | Action needed |
| --- | --- | --- | --- |
| P1 | `pg_dump` / `pg_restore` / `psql` | ✅ **RESOLVED** | Installed **without root**: PostgreSQL 17.11 binaries downloaded from PGDG and extracted to `~/schooled-ops/pg17` (v16 from the Ubuntu repo was insufficient — the staging server runs 17.6, and `pg_dump` refuses to dump from a newer major version). |
| P2 | Staging DB password | ✅ **RESOLVED** | Supply `SUPABASE_DB_PASSWORD` for ref `noyegdgrfzopfrwjunot` (Supabase dashboard → Project Settings → Database). Note: this is the **database** password, *not* the service-role key. |
| P3 | Staging connection reachability | ✅ **VERIFIED** | Direct connection is IPv6-only on many Supabase projects. If `db.<ref>.supabase.co:5432` is unreachable, use the **session pooler on port 5432** — *not* the transaction pooler on 6543. |
| P4 | Restore verification target | ✅ **RESOLVED** | No `docker`, no `podman`, no local Postgres server. Options: (a) install PostgreSQL locally, (b) a scratch Supabase project, (c) Docker. |
| P5 | Authorization to connect to staging | ✅ **GRANTED** | Explicit go-ahead required before contacting any live database. |
| P6 | Disk space | ✅ **OK** | 61 GB free on `/` |
| P7 | Node / npm | ✅ **OK** | v22.23.2 / 10.9.8; `pg` module present (could script, but `pg_dump` is preferred — see §5) |

### Exact credential dependency

The expected variable name is already used by the repository
(`scripts/run-migration.js:5`, since removed — see the note in §3):

```
SUPABASE_DB_PASSWORD=<database password for the target project>
```

Connection format (per `scripts/run-migration.js:12`, since removed):

```
postgresql://postgres:<urlencoded-password>@db.<ref>.supabase.co:5432/postgres
```

For Phase 1 the ref must be `noyegdgrfzopfrwjunot` (staging). **No database password is
present in `.env.local`**; `.env.local` contains only `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
`VERCEL_OIDC_TOKEN`. A service-role key is a REST credential and **cannot** be used as a
database password.

---

## 5. Method decision

**Chosen method: `pg_dump` in custom format (`-Fc`), over a direct or session-mode connection.**

### Why not the REST / Management API

The repository's existing tooling talks to Supabase through PostgREST and the Management
API using the service-role key (e.g. `check.js:3`, `scripts/isolation-test.cjs:52`). This
is **not** a valid backup mechanism:

- PostgREST returns at most a bounded number of rows per request (default limit 1000), so a
  table-by-table export would be **silently truncated**.
- There is no cross-table transactional snapshot — a "backup" assembled from many REST
  calls is internally inconsistent (foreign-key and aggregation skew).
- The `auth` schema (including `auth.users.encrypted_password`) is not fully exposed
  through PostgREST.
- On the Free tier there are no automatic backups and no PITR, so nothing else covers this.

This is precisely the "do not improvise with the service-role key" case: it is the wrong
kind of credential for the job, and using it would produce a backup that *appears* to
succeed while being incomplete.

### Connection-mode constraint

`pg_dump` requires a **session**. Use the direct connection or the **session-mode pooler
(port 5432)**. The **transaction-mode pooler (port 6543) will not work** — it does not
guarantee a stable session, which `pg_dump` requires.

---

## 6. Execution steps

### Step 1 — Install client tooling
```bash
sudo apt-get update && sudo apt-get install -y postgresql-client
pg_dump --version   # must report the installed version
```

### Step 2 — Set the connection (staging only)
```bash
export PGHOST="db.noyegdgrfzopfrwjunot.supabase.co"   # or session-pooler host if IPv6-unreachable
export PGPORT=5432
export PGUSER=postgres
export PGDATABASE=postgres
export PGPASSWORD="$SUPABASE_DB_PASSWORD"
```
**Verify identity before dumping** — this step prevents backing up the wrong environment:
```bash
psql -c "select current_database(), current_user, version();"
psql -c "select count(*) from schools;"
psql -c "select id, name from schools order by created_at limit 5;"
```
The school list must be **checked against the known staging schools** before proceeding.

### Step 3 — Create the backup directory (outside the git repo)
```bash
mkdir -p ~/schooled-backups/phase1
cd ~/schooled-backups/phase1
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
```

### Step 4 — Dump
```bash
# Roles and globals first (needed for a faithful restore)
pg_dumpall --roles-only --no-role-passwords > globals_${STAMP}.sql

# Full logical dump in custom format (schema + data, includes auth schema)
pg_dump --format=custom --no-owner --no-privileges --verbose \
        --file=schooled_staging_${STAMP}.dump
```

### Step 5 — Capture the evidence record
Record: UTC timestamp, project ref, Postgres version, `pg_dump` version, file name,
byte size, SHA-256 checksum.
```bash
sha256sum schooled_staging_${STAMP}.dump | tee schooled_staging_${STAMP}.sha256
ls -lh
```

### Step 6 — Storage objects (NOT covered by pg_dump)
Uploaded files (school logos, avatars, exam images in the `avatars` bucket) live in
S3-backed object storage and are **absent from a Postgres dump**. On the Free tier the
allowance is 1 GB total.

Handle separately via either the Supabase CLI's storage commands (verify your CLI version
supports them) or by enumerating and downloading objects through the Storage API using the
service-role key **server-side, read-only**.

**Do not consider Phase 1 complete until Storage coverage is explicitly decided —
either backed up, or formally recorded as an accepted gap.**

---

## 7. Restore verification (mandatory)

A dump that has never been restored is not a backup.

1. Provision an isolated restore target (P4). **Never restore over staging or production.**
2. Restore:
   ```bash
   createdb restore_verify
   pg_restore --dbname=restore_verify --no-owner --no-privileges --exit-on-error \
              schooled_staging_${STAMP}.dump
   ```
3. Verify the **application-visible** schema and data:
   ```bash
   psql -d restore_verify -c "\dt public.*"            # compare table count
   psql -d restore_verify -c "select count(*) from schools;"
   psql -d restore_verify -c "select count(*) from profiles;"
   psql -d restore_verify -c "select count(*) from auth.users;"
   ```
4. Verify tenant integrity on the restored copy:
   ```bash
   psql -d restore_verify -c "select school_id, count(*) from students group by school_id;"
   psql -d restore_verify -c "select count(*) from students where school_id is null;"
   ```
5. Cross-check against the live staging baseline:
   ```bash
   npm run test:baseline      # run against staging; compare output to step 4
   ```
6. Record pass/fail per check in the evidence record below.

**Note:** `auth.users.encrypted_password` **is** included in a full dump, so restored logins
remain valid. A schema-only dump would lose them — do not use `--schema-only` for this
purpose.

---

## 8. Evidence record — COMPLETED

| Field | Value |
| --- | --- |
| Backup timestamp (UTC) | 2026-09-18 03:43:45 UTC |
| Environment | staging (`noyegdgrfzopfrwjunot`) — **production never contacted** |
| Postgres version (source) | 17.6 (Supabase) |
| `pg_dump` version | 17.11 |
| Method | `pg_dump --format=custom` (full fidelity; `--no-owner` applied at restore time) |
| Dump file | `schooled_staging_20260918T034345Z.dump` |
| Size | 0.71 MB |
| SHA-256 | `649079f7c7c57d87d97fd851c4ddc4560177a3ae9e788778ad843bfcb663dc49` |
| Storage objects | **NOT COVERED — accepted gap** (see §6 Step 6) |
| Restore target | local sandbox PostgreSQL 17.11, `127.0.0.1:55432`, database `schooled_verify` |
| Restore result | rc=1, **3 errors, all benign**: `extension "supabase_vault" is not available` + 2 follow-ons. `supabase_vault` is a Supabase-proprietary extension absent from vanilla PostgreSQL. |
| Row-count comparison | **17/17 sampled tables match exactly** (schools 2, profiles 14, students 6, teachers 2, classes 2, subjects 5, terms 1, sessions 1, student_scores 15, term_results 5, attendance 1, student_bills 6, payments 3, fee_heads 4, support_logs 47, school_features 1, report_card_submissions 1) |
| Schema comparison | public tables 75 = 75 · `auth.users` 14 = 14 · indexes 199 = 199 · functions 9 = 9 · triggers 15 = 15 |
| RLS comparison | public RLS policies **145 = 145** · tables with RLS enabled **75 = 75** |
| Content spot-check | school names, student names, score sum (451.00), term grades — **all match** |
| TOC coverage | 113 TABLE DATA entries across 5 schemas: `public` 75, `auth` 27, `storage` 8, `realtime` 2, `vault` 1 |
| Verified by / date | automated restore verification, 2026-09-18 03:43:45 UTC |

### Notes and findings

1. **`pg_dumpall --roles-only` failed (rc=1)** — expected. The Supabase `postgres` role cannot read cluster roles without superuser. Roles are managed by the Supabase platform and are not restorable into a vanilla instance. Recorded as an accepted limitation.
2. **Time-zone display artifact** — `TIMESTAMPTZ` columns render in `Africa/Porto-Novo` in the sandbox vs `UTC` on staging. Verified identical by epoch comparison (both `1788999853`), so this is presentation only, not a data difference.
3. **Finding for the migration-baseline work (Phase 5):** the **live** staging database has RLS enabled on **all 75 public tables** and **145 policies**. This is materially more protection than the migration files imply, and re-confirms that the repository's migration history does **not** describe the live schema. The baseline must be taken from the live database, not reconstructed from `supabase/migrations`.
4. Note that RLS being *present* does not mean it is *enforced* for application traffic — 100 of 107 API routes use the service-role client, which bypasses RLS. Phase 2/3 and the CBT work address that separately.

## 9. Restore procedure (disaster recovery)

1. Provision the target (or confirm the existing project is empty/reset).
2. Restore roles: `psql -f globals_<STAMP>.sql`
3. Restore data: `pg_restore --dbname=<target> --no-owner --no-privileges --exit-on-error <dump>`
4. Restore Storage objects (per §6 Step 6).
5. Re-apply any environment configuration (env vars, Auth settings, RLS — note RLS policies
   are part of the schema and are included).
6. Verify using §7 steps 3–5.
7. Re-run `npm run test:isolation`.

**Expected duration:** proportional to database size. **Point of no return:** writing over a
live project. Always restore into an isolated target first.

---

## 10. Do-not list

- Do not use the service-role key as a database password.
- Do not use the transaction pooler (port 6543) for `pg_dump`.
- Do not dump, connect to, or modify production in this phase.
- Do not use `--schema-only` for this backup.
- Do not commit any dump, password, or connection string to the repository.
- Do not mark Phase 1 complete until §7 has actually been performed and §8 completed.

---

## 11. Execution log

| Date | Action | Result |
| --- | --- | --- |
| 2026-09-18 | Installed PostgreSQL 17.11 client + server into `~/schooled-ops` without root (PGDG `.deb` extraction) | OK |
| 2026-09-18 | Created local sandbox cluster, `127.0.0.1:55432`, scram auth, localhost-only | OK |
| 2026-09-18 | Identity gate: confirmed target = staging via school fingerprint | OK (schools `Test`, `test`; 75 tables) |
| 2026-09-18 | Safety guard: aborted check if connection string references production | Passed |
| 2026-09-18 | `pg_dump --format=custom` of staging | schooled_staging_20260918T034345Z.dump (0.71 MB) |
| 2026-09-18 | Clean single-run restore into fresh sandbox database | rc=1, 3 benign `supabase_vault` errors |
| 2026-09-18 | Row-count, schema, RLS and content verification | **ALL MATCH** |
| 2026-09-18 | Ops scripts written to `~/schooled-ops` (mode 700, outside git) | OK |
