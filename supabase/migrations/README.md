# Migrations — read this before adding one

## Status: the numbered migrations below are FROZEN history

`001` … `041` document how the schema evolved. They are **not** a reproducible
build of the live database and must not be treated as the source of truth.

Verified reasons (see `docs/SchoolEd_Staging_Baseline_Report.md`):

- **Duplicate numeric prefixes** — `006`, `008`, `009` (×3), `010`, `012` (×3),
  `013`, `014`, `015`, `017`, `018`, `019`, `020`. Ordering between files with
  the same number is ambiguous.
- **Ordering inversion** — `032_finance_canonical_staging.sql` is the *sole*
  creator of `term_fees`, `class_fees`, `student_waivers`,
  `student_fee_adjustments` and `academic_sections`, yet `028`–`031` depend on
  them and carry lower numbers. A clean ordered apply fails.
- **Silent no-ops** — `032` uses `CREATE TABLE IF NOT EXISTS` over tables that
  `013`/`027`/`028` already created with *different columns*
  (`payments.payment_date` vs `paid_at`; `fee_allocations.student_fee_id` vs
  `bill_line_id`; `fee_heads.is_optional` vs `is_compulsory`). Applied over an
  older shape it changes nothing and leaves the old columns in place.
- **Objects created by nobody** — `school_subscriptions`, `platform_payments`,
  `school_billing_configs`, `platform_bank_accounts` are referenced by `028`
  but created by no migration.
- **Duplicate table definitions** — `student_scores`, `psychomotor_scores` and
  `affective_scores` are created in `005`, `010` and `011`; `password_history`
  is defined incompatibly in `006` and `008`.
- `staging_complete_schema.sql` is a stale `013`/`026`/`027` snapshot and does
  not match the live database either.

## The authoritative baseline

The baseline is a **schema-only dump of the live staging database**, not this
folder. It is generated and stored outside the repository:

```
~/schooled-ops/backups/schooled_staging_schema_<timestamp>.sql
```

Regenerate it any time with:

```sh
~/schooled-ops/dump-staging.sh        # full data + schema, staging only
```

A full logical backup (`--format=custom`) plus a Storage object backup live
alongside it. See `docs/Phase1_Backup_Restore_Runbook.md`.

## Rules for new migrations

1. **Never edit an applied migration.** Editing a file that has already run
   repairs nothing — the database does not re-run it — and creates a divergence
   between the repo and every environment.
2. **Forward-only.** All new work starts at `042` and increases by one. Do not
   reuse a number, ever, even if it looks free.
3. **Never reuse a duplicate prefix.** Check with:
   `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d` (must print nothing).
4. **Additive by default.** New columns are nullable or carry defaults. Dropping
   or renaming requires its own reviewed migration with a data-migration step.
5. **Guard against the wrong shape, not just absence.** `IF NOT EXISTS` protects
   against a missing table, not against a table with the wrong columns. Verify
   the live shape before writing.
6. **Verify against staging before production.** Apply, then confirm with the
   baseline report's row-count and object-count checks.

## Forward migration sequence (new work)

| # | Purpose | Status |
| ---: | --- | --- |
| `042` | Reconcile tables referenced by code but absent from the schema: `report_card_settings`, `rate_limits`, `bump_rate_limit()` | ✅ applied |
| `043` | Tenant RLS policies for the 28 tables that had RLS enabled but no policies | ✅ applied |
| `044` | Score-level correction audit: extends `result_edit_logs`, adds correction cycles | ✅ applied |
| `045` | CBT schema foundation: 12 `cbt_*` tables with RLS and a role-aware policy matrix | ✅ applied |
| `046` | CBT attempt integrity: least-privilege policies for the attempt-scoped tables + a snapshot immutability trigger | ✅ applied |
| `047` | CBT structural alignment: composite school-consistent foreign keys, plus per-class student assessment visibility | ✅ applied |
| `048` | CBT delivery integrity: one live attempt per student per assessment, one official result per student per assessment | ✅ applied |
| `049`+ | Reserved for CBT authoring/delivery routes, AI Gateway and AI Credits | — |
| `057` | Website Engine, Slice 1: `website_configs` — per-school website binding, `template_key`, and the `status` kill-switch column (`active`/`suspended`/`disabled`), with RLS and tenant policies | ✅ applied to staging |
| `058` | Website Engine, Phase 5: `website_media` — the media library, with opaque storage paths (no tenant id in a public URL), soft-delete tombstones and RLS | ✅ applied to staging |
| `059` | Website Engine, Phase 6: `website_configs` gains `theme`, `contact` and `seo` (additive JSONB columns, no backfill) | ✅ applied to staging |
| `060` | Website Engine, Phase 7: `website_pages` + `website_sections` (RLS, composite tenant-consistent foreign key), `website_configs.draft_version`, and `replace_website_page_sections()` — one atomic, version-checked content save, executable only by `service_role` | ✅ applied to staging |

Each of these is written to be idempotent, so re-running one is safe.

### Why `045`–`047` were safe to apply to a live staging database

`045`–`047` are additive and were applied while staging held real rows. Before
applying `047` specifically, every `cbt_*` table was verified to be **empty**
(0 rows), so the composite foreign keys had nothing to validate against; the
`UNIQUE (id, school_id)` keys cannot fail because `id` is already the primary
key. `045`/`046` touch no existing table at all.

`048` is the one migration in this group that alters an existing table
(`cbt_results` gains two nullable columns). It was safe for the same reason: the
table was verified empty first, and the columns are nullable so no existing row
can be invalidated. Its backfill statement is idempotent and only fills rows that
are still missing the values.

---

## `061`–`064`, and the production catch-up (2026-09-30)

| `#` | What it does | State |
| --- | --- | --- |
| `061` | CBT sections on assessments | ✅ staging · ✅ production |
| `062` | CBT attempt sections — an attempt binds to the section sat | ✅ staging · ✅ production |
| `063` | Per-question media on CBT attempts (`cbt_attempt_questions.media`) | ✅ staging · ✅ production |
| `064` | **Finance for a database that already has the first-generation finance tables.** See below | ✅ staging (no-op) · ✅ production |
| `065` | **`rate_limits` reconciled.** See below | ✅ staging (no-op) · ✅ production |
| `067` | **`inquiries`** — the landing-page "Waitlist" (public form → super admin). Super-admin-only RLS; the public writes through `/api/public/inquiries` with the service role | ⏳ not yet applied |

### `064` — why production needed its own finance migration

Production carried a **first-generation** finance schema: `fee_heads` with
`is_optional`, plus `student_fees`, `class_fee_overrides`, `section_fee_defaults`,
`fee_templates` and `fee_template_items`. Migration `032` was written to *build*
the canonical finance schema on staging, which was a blank slate — it uses
`CREATE TABLE IF NOT EXISTS` against names production already had. On production
those statements skip **silently**, so `032` alone leaves a database that looks
migrated while missing `fee_heads.is_compulsory` and every canonical column on
`payments` and `receipts`. `064` reaches the same end state for a database that
already has the first-generation tables.

Two properties make it safe, and both were checked before it ran:

1. **Every first-generation finance table was empty** — all ten, 0 rows each,
   checked directly. The file opens with a guard that *refuses to run* if any has
   since gained rows, because Part C adds `NOT NULL` columns and tightens
   constraints, which is only safe against empty tables.
2. **Additive only.** No `DROP`, `TRUNCATE` or `DELETE`. The first-generation
   tables are left exactly as they are; nothing in the current application reads
   them.

The one place it must *loosen* rather than tighten: `receipts.student_id` and
`receipts.amount` carry `NOT NULL` in the first-generation shape and the current
application does not supply them, so every receipt insert would have failed. Both
are relaxed, and `payment_id` is tightened to `NOT NULL` to match staging.

### The production catch-up itself

Production was a whole platform-generation behind — 69 tables against staging's
99 — and the *deployed code* was the older generation too. Finance could not land
in isolation, because a schema the deployed code cannot read changes nothing a
school can see.

Applied to production, in order, each file in its own transaction: `064` →
`033`…`041` (finance), `020`–`022` (copilot), `042`–`048`, `049`–`053` (AI),
`054`–`063`.

The method is the part worth reusing:

- Every batch was first run against production inside `BEGIN … ROLLBACK`, so the
  real schema is exercised and nothing is committed. Groups were dry-run
  *atomically* (all files in one transaction) so later files see the tables the
  earlier ones create — a per-file rollback hides them and reports a false
  dependency error.
- The finance batch was additionally asserted inside the rolled-back transaction:
  17 post-state checks covering tables present, `is_compulsory` present,
  `receipts` nullability, 52 RLS policies across 13 tables, and the student name
  backfill.
- Only then was each file applied and committed.

Result: production 111 tables, missing nothing staging has except `super_admins`
— a table **no migration creates and no source file references**, empty on staging
too, so it is vestigial rather than outstanding.

### `065` — the same trap as `064`, and it took login down

`064` exists because `CREATE TABLE IF NOT EXISTS` does nothing when the table
already exists. `042` had the same problem and nobody noticed, because the
symptom looked like something else entirely.

Production already had a `rate_limits` table from an earlier generation:

```
production : (ip PK, attempts, expires_at)              3 columns
staging    : (id, ip UNIQUE, attempts, expires_at,
              created_at, updated_at)                    6 columns
```

So `042`'s `CREATE` was skipped, `042`'s `bump_rate_limit()` was created, and the
function went looking for a column that did not exist:

```
ERROR: 42703: column "updated_at" of relation "rate_limits" does not exist
```

`src/lib/rate-limit.ts` catches that error and **fails closed** by design —
*"If it is unreachable we fail CLOSED rather than allowing the request"*. So the
login route answered `429 Too many attempts.` to **every** attempt. Not a limit
being reached: the check itself erroring, on every login, for every user.

`065` adds `created_at` and `updated_at`. It deliberately does **not** move the
primary key from `ip` to `id`, and does not add `id`: `ON CONFLICT (ip)` already
has a unique constraint to work with, nothing reads a `rate_limits` column
directly, and moving a primary key on a live table to gain cosmetic parity is
risk without benefit.

**The lesson, stated plainly:** after a catch-up like this, do not assume a
migration ran just because it reported success. Compare the actual shapes.
Production and staging now differ only where production is the *looser* of the
two (nullable where staging is `NOT NULL`), which cannot break code that already
writes those columns — plus a `rate_limits.id` that nothing reads.
