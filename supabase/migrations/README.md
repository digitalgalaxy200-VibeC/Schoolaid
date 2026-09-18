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
| `042` | Reconcile tables referenced by application code but absent from the live schema (`rate_limits`, `report_card_settings`) | Phase 6 |
| `043` | CBT schema (`cbt_*`) with RLS — gated on the accepted feature specification | Phase 14 |
| `044`+ | Reserved for CBT, AI Gateway and AI Credits work | — |
