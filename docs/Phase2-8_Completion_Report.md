# Phases 2–8 — Completion Report

**Branch:** `CBT` · **Date:** 2026-09-18 · **Scope:** staging only. Production was never contacted.

---

## Summary

| Phase | Title | Status |
| ---: | --- | --- |
| 2 | Secret Hygiene & Session-Signing Separation | ✅ complete, verified |
| 3 | Impersonation Authorization Hardening | ✅ complete |
| 4 | Session Lifecycle & Cookie Hygiene | ✅ complete, verified |
| 5 | Migration Baseline & Schema Reconciliation | ✅ complete (report + freeze + rules) |
| 6 | Phantom Tables & Login Brute-Force | ✅ complete (migration 042 applied to staging) |
| 7 | Server-Minted Token Foundation | ⚠️ **partially blocked** — see §7 |
| 8 | Tenant-Isolation Regression Harness | ✅ complete, 12/12 passing |

---

## Phase 2 — Secret hygiene

`src/lib/jwt-secret.ts` is now the single source of the session-signing secret.
Nine files were converted; `process.env.JWT_SECRET` is read in exactly one place.

Removed: the `SUPABASE_SERVICE_ROLE_KEY` fallback (C2) and the hardcoded
`"fallback-insecure-secret"` literal in `middleware.ts` and the super-admin
dashboard (C3).

**Verified:** `tsc` clean · production build succeeds incl. Edge middleware ·
login 200 · `/api/auth/me` 200 with a valid cookie and 401 with none · a token
forged with the old literal → **401** · a token forged with the service-role key
→ **401** (both tokens confirmed 201 bytes, so these are not false passes).

**Deployment prerequisite:** production has no `JWT_SECRET`. Set it in Vercel
**before** deploying this code, otherwise every login returns 500.

**Consequence:** all pre-existing sessions were invalidated — one planned logout.

---

## Phase 3 — Impersonation

Impersonation remains a full Super Admin capability; only the escalation was
removed. Previously an already-impersonating session could re-target itself to
**any** school using a school ID from the request body.

Now: authorisation requires a genuine Super Admin session, or proof of the
original Super Admin identity via the httpOnly `schoolaid-super-session` cookie.
An impersonated school-scoped token can never widen into platform reach.
Re-targeting (e.g. switching to the teacher view within a school) still works.
The audit row is now mandatory — if it cannot be written, no session is issued.

Also: `verifyCopilotAccess` previously checked only for the *presence* of the
backup cookie; it now verifies that cookie is genuinely a Super Admin session.

---

## Phase 4 — Session & cookie hygiene

| Change | Reason |
| --- | --- |
| CSRF origin check rewritten to compare against the request host (plus `ALLOWED_ORIGINS`) | The old check substring-matched `"schoolaid"`/`"vercel.app"`, so `notschoolaid.evil.com` passed |
| Supabase GoTrue branch removed from `verifySuperAdmin` | It queried a `users` table that does not exist and nothing sets `sb-access-token` — dead code |
| `middleware.ts` no longer passes any request carrying `sb-access-token` | It was a page-level bypass |
| Logout clears `schoolaid-super-session`, `schoolaid-return-path`, `schoolaid-impersonate-school` | A full Super Admin session token survived logout |
| `schoolaid-email` cookie removed entirely | Never read anywhere, and was not httpOnly |
| `exit-impersonation` validates the stored session and constrains the redirect to a local path | Prevented promoting an invalid session and an open redirect |

---

## Phase 5 — Migration baseline

`supabase/migrations/README.md` records the freeze, the verified reasons the
folder cannot reproduce the live schema, and the forward-only rules.

`docs/SchoolEd_Staging_Baseline_Report.md` is the authoritative baseline:
75 tables · 145 policies · 212 FKs · 199 indexes · 9 functions · 15 triggers.
Schema dump kept outside the repo at
`~/schooled-ops/backups/schooled_staging_schema_<stamp>.sql`.

**Key correction discovered during baseline work:** RLS is enabled on all 75
tables, but **38 have zero policies** and are deny-all to tenants — including
`student_scores`, `term_results`, `result_edit_logs`, `report_card_submissions`
and `attendance_records`. "RLS enabled" was being read as "protected"; it is not.

---

## Phase 6 — Missing tables and login hardening

Migration `042_reconcile_missing_tables.sql` (applied to staging, verified):

- `report_card_settings` — created with RLS + 4 tenant policies. Three routes
  queried it and would have failed at runtime.
- `rate_limits` + `bump_rate_limit()` — an atomic increment-and-check function.

Deliberately **not** created, because they were duplicates of canonical tables:

| Referenced name | Canonical table | Fix |
| --- | --- | --- |
| `assessment_scores` | `student_scores` | `ai-import` route repointed |
| `subject_class_assignments` | `class_subjects` | copilot engine + rollback repointed |
| `users` | `profiles` | dead branch removed (Phase 4) |

Other fixes: `lib/rate-limit.ts` now calls the RPC and **fails closed**;
`teacher/scores` writes `class_id` again (the "migration 015 missing" TODO was
stale — the column exists live); login escapes LIKE wildcards and rejects an
ambiguous email match instead of silently taking the first row.

---

## Phase 7 — Token foundation: **partially blocked**

**Gate result: PASS on feasibility.** The Supabase keys decode as `alg: HS256`,
so the project still uses the legacy shared JWT secret and a self-minted
PostgREST token is viable. No Supabase Auth migration and no access-token hook
are required.

`src/lib/cbt/scoped-client.ts` is implemented: it mints a short-lived
(120 s) tenant token carrying `school_id`, and builds a client that is subject
to RLS. It **fails closed** if `SUPABASE_JWT_SECRET` is absent rather than
silently falling back to the service-role client.

**Blocker:** `SUPABASE_JWT_SECRET` is not present in any env file. Without it the
positive path cannot be exercised. Add it (Supabase dashboard → Project Settings
→ API → JWT Secret) to `.env.staging` and the end-to-end proof can be run.

**Independent proof that the mechanism works:** RLS enforcement was verified
directly in Postgres by emulating PostgREST's `role` + `request.jwt.claims` —
a tenant sees exactly its own rows, other tenants' rows are invisible, and a
request with no claims sees nothing.

---

## Phase 8 — Regression harness

`scripts/rls-isolation-test.cjs` (`npm run test:rls`) proves the **database**
layer, complementing the existing HTTP-level `isolation-test.cjs`.

**12/12 passing.** Deliberately non-vacuous: preconditions assert both tenants
hold rows before any cross-tenant comparison, so it cannot pass on empty data.

Covers: own-row visibility · cross-tenant blocking on two tables · super-admin
visibility preserved · no-claims denial · a ratchet on policy-less tables
(≤ 38, must reach 0) · a gate requiring every `cbt_*` table to carry RLS and
policies before Phase 14.

---

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run build` | exit 0, 133 pages, Edge middleware compiled, 0 errors |
| `npm test` (vitest) | 50/50 passing |
| `npm run test:rls` | 12/12 passing |
| End-to-end auth (login / me / forged tokens / CSRF / middleware / logout) | all as expected |
| Production contacted | **never** |

---

## Open items

1. **`SUPABASE_JWT_SECRET`** — needed to complete Phase 7's positive proof.
2. **Migration 042 must be applied before deploying the rate-limit change.**
   The limiter fails closed, so without the table/RPC login returns an error.
3. **Production deployment prerequisite:** set `JWT_SECRET` in Vercel first.
4. 38 tables remain deny-all to tenants; they must gain policies before any
   tenant-scoped client reads them (Phase 14 gate covers `cbt_*`).
5. Storage objects are backed up but the `avatars` bucket remains public, so the
   exam image exposure (I8) is still live — Phase 13.
