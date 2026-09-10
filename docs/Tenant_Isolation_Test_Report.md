# Tenant Isolation — Guarantee, Evidence & Regression Suite

> **The guarantee in one sentence:** a student's money records, bills, exam
> scores and profiles belong to exactly one school, and no school (or staff
> member logged in under one school) can ever see, open or change another
> school's data — neither through the app nor underneath it.

This document records how the guarantee is enforced (Phase 1), the automated
proof that it holds right now (Phase 2), and how to re-prove it after any
future change (Phase 3 regression suite).

---

## 1. How the guarantee is enforced

### Database layer (defense in depth)

- Every tenant-owned table carries a `school_id` column. A full sweep of all
  **75 tables** on staging found **0 tables** without school ownership: child
  tables (score rows, allocation rows, bill lines, log rows, etc.) sit under
  school-owned parents.
- **36 tables** have full RLS policies; the rest have RLS enabled with no
  policies (deny-by-default). The app's server routes use a service client,
  so the *real* protection is the ownership scoping in every API route —
  RLS is the second net for any future direct-access path.
- All application writes flow through the app's own API routes, which verify
  the caller's school before every read or write.

### API layer (enforced in code, March 2026 audit)

All findings from the route-by-route audit are closed:

| Severity | Outcome |
| --- | --- |
| HIGH / MEDIUM (12 findings) | Fixed & committed (`dd83d4e`) — platform backdoor routes deleted; school-admin routes (students, teachers, terms, comments, assignments, assessment components, grading scales, affective/psychomotor) now ownership-verified; teacher routes (scores, report cards, publish, rosters) now class/student/subject-scoped. |
| LOW (10 findings) | Fixed & committed (`5c2c67b`) — finance re-fetches school-scoped; review-log scoping corrected; FK ownership checks added; platform auth fails closed; impersonation role-whitelisted; login email-confirm ordering corrected. |
| Deferred — needs product decision | **#9** template-library ownership (is the template catalogue global or per-school?) · **#16** whether `password_history` stays at all. Both are open questions, not known leaks. |

---

## 2. The automated proof (Phase 2) — 23/23 PASSED

`scripts/isolation-test.cjs` logs in as the platform super admin on staging,
impersonates **School A** ("Test" — has students/bills/payments), **School B**
("test " — empty) and a **School A teacher**, seeds one disposable probe
student inside School B, then fires the checks below. Finally it removes the
probe data and verifies both schools are byte-for-byte back at their starting
counts.

Run it any time:

```bash
npm run test:isolation        # full 23-check cross-school proof
npm run test:baseline         # school-by-school count snapshot (read-only)
```

The test targets the **staging** project (`noyegdgrfzopfrwjunot`) and the
staging app URL. It never touches production.

### Result recorded 2026-09-10

| # | Check | Result |
| ---: | --- | --- |
| 1 | Super admin login (staging) | PASS |
| 2–4 | Impersonate School A admin / School B admin / School A teacher | PASS |
| 5 | School A has students + term to probe with | PASS |
| 6 | Teacher own-school roster request gated | PASS |
| 7–8 | Probe class + student created in School B only | PASS |
| 9 | **A's student list excludes B's student** | PASS |
| 10 | **B's student list contains only B's student** | PASS |
| 11 | **A's billing list contains no B students** | PASS |
| 12 | **A's payments list contains no B students** | PASS |
| 13 | **A cannot open B's student finance workspace** | PASS (404) |
| 14 | **B cannot open A's student finance workspace** | PASS |
| 15 | **A's teacher cannot read B's class roster** | PASS (no data) |
| 16 | **A's teacher cannot read B's scores** | PASS (denied) |
| 17 | Payments belong to their student's school | PASS (0 mismatches) |
| 18 | Bills belong to their student's school | PASS (0 mismatches) |
| 19 | Receipts belong to their payment's school | PASS (0 mismatches) |
| 20 | Allocations belong to their payment's school | PASS (0 mismatches) |
| 21–23 | Probe cleanup (student via API, class via scoped SQL) | PASS |

### Data-integrity sweep (same run)

```text
payments ↔ student school mismatch:  0
bills    ↔ student school mismatch:  0
receipts ↔ payment school mismatch:  0
allocations ↔ payment school mismatch: 0
```

---

## 3. Baseline evidence — nothing was disturbed

Counts captured before Phase 1 fixes and re-verified after the Phase 2 test:

| School | Students | Classes | Bills | Payments | Receipts | Profiles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Test (`17a265d5…`) | 6 | 2 | 6 | 3 | 3 | 10 |
| test  (`569e6cb2…`) | 0 | 0 | 0 | 0 | 0 | 1 |

The two real schools' data on staging was used read-only (impersonation is a
session switch — no password resets, no row edits).

---

## 4. Phase status

| Phase | What | Status |
| --- | --- | --- |
| 1 | Audit (DB + all routes) & fix findings | ✅ done — HIGH/MEDIUM/LOW closed |
| 2 | Automated two-school isolation test | ✅ done — 23/23, cleanup verified |
| 3 | Lock: regression scripts + this report | ✅ done |
| 4 | Guided browser walkthrough with the 2 real schools + sign-off | ⏳ next |

---

## 5. Re-running after any future change

Whenever a route, migration or finance change lands, prove the guarantee again:

```bash
npm run test:baseline    # 1. snapshot both schools (read-only)
npm run test:isolation   # 2. full cross-school proof (23 checks)
npm run test:baseline    # 3. snapshot again → must equal step 1
```

Any FAIL means a change broke tenant isolation — fix before shipping.
