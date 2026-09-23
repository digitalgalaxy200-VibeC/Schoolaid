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
