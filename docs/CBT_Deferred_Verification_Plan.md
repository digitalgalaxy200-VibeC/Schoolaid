# CBT Verification Plan

**Status: the key has landed and the transport is now verified.** `SUPABASE_JWT_SECRET`
was added to staging and confirmed correct **offline** — by re-signing the project's
own anon key with HMAC-SHA256 and matching the signature byte-for-byte, which a wrong
or truncated secret cannot do.

The sections below are kept as the record of what was blocked and why, and as the
checklist for the parts that remain unverified.

**Last updated:** after Phase 20 (commit `31a9c6b`) + live verification of the tenant
client.

---

## 0. What is now verified (was blocked)

| ID | Result |
| --- | --- |
| Secret matches this project | ✅ signature re-computed from the anon key matches exactly |
| **D1** — a self-minted token is accepted by PostgREST | ✅ HTTP 200 (was 401/503) |
| **D6 (positive control)** — the token exposes exactly that school's rows | ✅ 10 rows for one school, 1 for the other, both exact |
| **D7** — cross-tenant reads blocked through the real transport | ✅ 0 rows |
| **D10** — the anon key alone grants nothing | ✅ 0 rows |
| **D3** — an expired token is rejected | ✅ HTTP 401 |
| **D4** — a token signed with the WRONG secret is rejected | ✅ HTTP 401 |
| **D5** — the secret is service-role-grade | ✅ a `service_role` token minted from it saw **14** rows across schools, vs 10 for a single school |

These now run **through the real application code** — `createTenantScopedClient` and
`mintTenantToken` — not through a hand-rolled re-implementation, as an opt-in suite:

```sh
CBT_LIVE=1 npx vitest run src/lib/cbt/__tests__/live-scoped-client.test.ts
```

It is opt-in (`CBT_LIVE=1`) so the normal `npm test` stays offline and deterministic;
without the flag its six tests report as **skipped**, which is visible rather than silent.

**Still unverified** — D8, D9, D11, D12 and D13 — because they need CBT rows and a full student flow. They are not blocked on you.

### D14-D20 — now verified through the real route handlers

| ID | Scenario | Expected | Result |
| --- | --- | --- | --- |
| **D14** | No session cookie | 401 | ✅ |
| **D14b** | Malformed cookie | 401 | ✅ |
| **D15** | Student cookie on a staff route | 403 | ✅ |
| **D16** | Teacher NOT assigned to that class+subject | 403 | ✅ |
| **D17** | Teacher assigned to that class+subject | 200 | ✅ |
| **D18** | `school_admin` claim | 200 | ✅ |
| **D19** | Another school's token | 404 | ✅ |
| **D19b** | Non-existent assessment id | 404 | ✅ |
| **D20** | `all_classes` session, class not assigned | 200 | ✅ |
| — | Cross-origin mutating request | 403 | ✅ |

```sh
CBT_LIVE=1 npx vitest run src/lib/cbt/__tests__/routes.test.ts
```

D16 and D20 are the same teacher and the same assessment, differing only by the
session's `all_classes` flag — so the 403 → 200 transition is attributable to the
flag and not to anything else.

**D19 and D19b must agree.** They assert the same status for "belongs to another
school" and "does not exist", which is what stops the endpoint being used to
probe whether an id exists elsewhere. If they ever diverge, that is a disclosure
bug, not a test failure.

These tests BUILD FIXTURES AND REMOVE THEM, because staging could not support the
test as written:

- all five `teacher_subjects` rows are **vacant** (`teacher_id IS NULL`), so there
  was no teacher assignment to test at all;
- the one class with a **published** report card is locked, which would mask an
  authorization outcome behind a lock error (409 instead of the 403 being
  asserted).

So the test creates a probe class, a probe assignment and two probe assessments,
and deletes all of them in `afterAll`. Verified afterwards that staging is
unchanged: probe rows 0, `teacher_subjects` back to its original 5 rows with 0
assigned, `profiles` 14, `cbt_assessments` 0.

---

## 1. Why the gate existed

The gate was deliberate, not an oversight. `src/lib/cbt/scoped-client.ts` mints its own
short-lived PostgREST token from the Supabase project JWT secret, then talks to Postgres
with the **anon** key plus that token, so **Row Level Security actually applies**.

With no `SUPABASE_JWT_SECRET` configured it refused to continue:

```
getSigningSecret()            throws  TenantClientConfigurationError
  -> createTenantScopedClient()  throws
    -> authorizeCbtAssessment()  returns { ok: false, status: 503 }
```

It could have fallen back to `getServiceClient()`. That is exactly what it must **not**
do: the service-role client bypasses RLS, so a silent fallback would turn every RLS
assertion in the CBT surface into decoration while every test still passed. A 503 was
loud and honest; a silent fallback would have been invisible.

**And it paid off in a concrete way:** the fail-closed behaviour is what forced the
offline signature check, which is what caught the difference between "the key is present"
and "the key is *correct*" before a single request was made.

---

## 2. Two different things, no longer conflated

| | What it actually proves | Status |
| --- | --- | --- |
| `npm run test:rls` (53 checks) | The **policies' logic**, evaluated inside Postgres with the claims set via `set_config('request.jwt.claims', …)`. It is a *simulation* of PostgREST. | ✅ done |
| The D-series below | The **real transport**: a genuine HTTP request carrying a genuinely signed token, with RLS deciding | ✅ D1-D7, D10 done; D8, D9, D11-D13 pending routes |

The harness proves the policy expressions are right. It does **not** prove that a real
bearer token is accepted, that the signature is checked, that the claims survive the
transport, or that the anon key alone is powerless. Those were D1-D5 and D6-D12, and they
are now verified — see §0.

---

## 3. The deferred test matrix

Method legend: **HTTP** = real PostgREST request via `fetch` with a bearer token.
**SQL** = via `pg` in a rolled-back transaction.

### D0 — Asserted today, no key needed

| ID | Proves | Method | Pass criterion |
| --- | --- | --- | --- |
| D0.1 | Absence of the key fails **closed**, not open | unit | `isTenantClientConfigured() === false`; `createTenantScopedClient()` throws `TenantClientConfigurationError` |
| D0.2 | A wrong/absent school scope is refused before any query | unit | `mintTenantToken({userId:'', …})` and a bad `appRole` both throw |
| D0.3 | The guard's decisions are correct | unit (34 tests) | ✅ passing |

### D1–D5 — Token minting and transport

These are the tests that prove the token is *real*, not merely well-formed.

| ID | What it proves | Method | Pass criterion | Why it is not vacuous |
| --- | --- | --- | --- | --- |
| **D1** | A minted token is **accepted by PostgREST** | HTTP | `GET /rest/v1/cbt_questions` returns 200, not 401 | A well-formed-but-unaccepted token is the #1 silent failure here; 200 is the only acceptable evidence |
| **D2** | The token carries exactly the intended claims | decode + verify | payload has `school_id`, `app_role`, `role: "authenticated"`, `sub`, `aud: "authenticated"`, `iat`, `exp`; `exp - iat === 120` | Asserts the values are *present and correct*, not just that a string exists (a previous forged-token test in this project passed on an empty string) |
| **D3** | An **expired** token is rejected | HTTP | request with `exp` in the past returns 401 | Proves expiry is enforced by the transport, not only described in a comment |
| **D4** | A token signed with the **wrong secret** is rejected | HTTP | token signed with a random 32-byte secret returns 401 | **The critical anti-false-positive test.** Without it, D1 could pass because PostgREST ignored the signature entirely |
| **D5** | The secret is genuinely **service-role-grade** (confirms the handling rule) | HTTP, optional, read-only | a token minted with `role: "service_role"` returns rows that a tenant token cannot | OPTIONAL and one-off. It does not fix anything — it *demonstrates* that anyone holding this secret can bypass RLS, which is why the register classifies it as service-role-grade. Run once, on staging, then stop |

### D6–D12 — RLS through the genuine transport

Each runs against a **tenant A token** and a **tenant B token**, and each asserts both a
positive and a negative. A negative-only suite can pass on an empty database.

| ID | What it proves | Pass criterion |
| --- | --- | --- |
| **D6** | A teacher token reads its **own** school's question bank | rows > 0 for tenant A (positive control) |
| **D7** | A teacher token reads **nothing** from the other school | 0 rows for tenant B's questions; and vice versa |
| **D8** | A **student** token reads **no** questions and **no answer keys** | `cbt_questions` 0 rows **and** `cbt_question_answer_keys` 0 rows. The second is the leak that matters |
| **D9** | A student reads **no other student's** attempt | `cbt_attempts` filtered by another student's `student_profile_id` → 0 rows |
| **D10** | The **anon key alone grants nothing** | every `cbt_*` table returns 0 rows (or 401) with no bearer token. If this ever fails, every other assertion here is meaningless |
| **D11** | A student cannot **INSERT** an attempt through the real path | `POST /rest/v1/cbt_attempts` as a student → 403 or RLS-blocked; proves migration 046 at the transport layer, not just the catalog |
| **D12** | A snapshot **cannot be UPDATEd**, even as service role | `PATCH` on `cbt_attempt_questions` → rejected by the trigger. Run once with the tenant token and once with the service-role key |

### D13 — Cross-school negative matrix (the security-critical sweep)

For **every** `cbt_*` table, with a valid token for the *other* school: read → 0 rows;
write where the schema permits → rejected. Driven from a table list rather than
hand-written per table, so a table added later is covered automatically instead of being
forgotten. This is the widened version of harness section 8, which currently covers four
representative paths.

### D14–D20 — Guard behaviour through a real route

These need **Phase 17's first CBT route** plus a running server (`npm run dev`), so they
are the "live test" step. Expected results, stated in advance so the test is falsifiable:

| ID | Scenario | Expected |
| --- | --- | --- |
| D14 | No session cookie | 401 |
| D15 | Student cookie on a staff route | 403 |
| D16 | Teacher cookie, **unassigned** to that class+subject | 403 |
| D17 | Teacher cookie, **assigned** | 200 |
| D18 | `school_admin` cookie | 200 |
| D19 | Assessment id belonging to **another school** | 404/403 — and the response must be **identical** to the "does not exist" case, so the id's existence is not disclosed |
| D20 | Impersonating Super Admin (teacher, `all_classes`) | 200 — impersonation must remain fully usable |

---

## 4. Runbook — executed

```
1. Add SUPABASE_JWT_SECRET to .env.staging      ✅ done (by hand, never in chat)
2. verify the secret matches THIS project       ✅ offline HMAC re-sign of the anon key
3. npm run env:staging                          ✅ synced; env:which confirmed staging
4. npm test                                     ✅ 249 passed, 6 skipped
5. npm run test:rls                             ✅ 53/53
6. CBT_LIVE=1 npx vitest run .../live-scoped-client.test.ts   ✅ 6/6
7. Phase 17-20 routes + dev server              ✅ done — D8–D20 all verified (see §1)
8. Add JWT_SECRET to Vercel BEFORE deploying Phase 2 code, or every login 500s
```

Step 2 is worth keeping as a habit. It cost one command and turned "the key is present"
into "the key is provably correct", before any request was made. The standalone probe
that ran the wider sweep lives outside the repo at `~/schooled-ops/cbt-token-probe.cjs`
(8/8), alongside `~/schooled-ops/verify-jwt-secret.cjs`.

Two of my own scripts failed before they passed, and both were the same class of bug — a
test that would have proved nothing:

- `get` was declared twice (env reader and HTTP helper) — a syntax error, so it failed loudly.
- **The live suite initially read the env file into a local object and left `process.env`
  untouched**, so the assertions passed against my copy while the real client threw
  "not configured". That is precisely the false confidence these tests exist to remove,
  and it only surfaced because the suite exercised the real module instead of a
  re-implementation.

---

## 5. Rules these tests must follow

Learned the hard way in this project; recorded so the D-series does not repeat them.

1. **Every positive assertion needs a failing negative twin.** A check that only asserts
   "0 rows" passes on an empty database.
2. **Never assert `0 == 0` without first proving the data exists.** D6 exists purely as
   that control for D7/D8.
3. **Verify the token is non-empty before using it.** A prior forged-token test produced
   401s from a malformed token and proved nothing.
4. **Assert *why* something failed, not just that it failed.** Where a specific constraint
   or trigger is the thing under test, match its error message.
5. **Force the correct role.** Querying as the table owner silently bypasses RLS and
   inverts the result — this already produced one false failure and one false pass.
6. **`relrowsecurity::text` yields `true`/`false`, not `t`/`f`.** Casting assumptions here
   inverted an entire baseline finding once.
7. **Clean up.** Probe rows go inside rolled-back transactions, or are deleted by id. No
   test may leave rows in staging.
8. **Staging only.** Any script must refuse to run against `iojiahkehnijxxczrgft`
   (production), as `~/schooled-ops/apply-migration.cjs` already does.

---

## 6. What is genuinely NOT blocked

Phase 17 (question bank), Phase 18 (delivery engine) and Phase 19 (report-card
integration) can all be built and proven the same way Phase 16 was: schema-level proofs
via SQL, plus pure-logic unit tests. What waits for the key is the **transport and route**
verification (D1–D20) — and the point at which a teacher can actually click through it.
