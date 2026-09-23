# CBT Deferred Verification Plan — what I cannot test until `SUPABASE_JWT_SECRET` lands

**Status:** Phase 16 complete. This document records the tests that are **written but
unrunnable** until the key exists, so nothing is quietly assumed to work.

**Last updated:** end of Phase 16 (commit `1b13e12`).

---

## 1. Why there is a gap at all

The gap is deliberate, not an oversight. `src/lib/cbt/scoped-client.ts` mints its own
short-lived PostgREST token from the Supabase project JWT secret, then talks to Postgres
with the **anon** key plus that token, so **Row Level Security actually applies**.

With no `SUPABASE_JWT_SECRET` configured it refuses to continue:

```
getSigningSecret()            throws  TenantClientConfigurationError
  -> createTenantScopedClient()  throws
    -> authorizeCbtAssessment()  returns { ok: false, status: 503 }
```

It could have fallen back to `getServiceClient()`. That is exactly what it must **not**
do: the service-role client bypasses RLS, so a silent fallback would turn every RLS
assertion in the CBT surface into decoration while every test still passed. A 503 is
loud and honest; a silent fallback would be invisible.

**The test that proves this behaviour** is `isTenantClientConfigured()` returning `false`
and `createTenantScopedClient()` throwing. That much I *can* assert today — see D0.

---

## 2. Honest scope statement

There are two different things that have been verified, and they are not the same thing:

| | What it actually proves | Status |
| --- | --- | --- |
| `npm run test:rls` (46 checks) | The **policies' logic**, evaluated inside Postgres with the claims set via `set_config('request.jwt.claims', …)` | ✅ done |
| The D-series below | The **real transport**: a genuine HTTP request to PostgREST carrying a genuinely signed token, with RLS deciding | ⛔ blocked on the key |

The existing harness **simulates** PostgREST by setting the JWT claims GUC directly. It
proves the policy expressions are right. It does **not** prove that a real bearer token
is accepted, that the signature is checked, that the claims survive the transport, or
that the anon key alone is powerless. Those are D1–D5 and D6–D12.

I would rather state that plainly than let "46/46 RLS checks pass" be read as
"end-to-end CBT security is verified". It isn't yet.

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

## 4. Runbook when the key arrives

```
1. Add SUPABASE_JWT_SECRET to .env.staging      # by hand, never in chat
2. npm run env:staging                          # syncs .env.local
3. npm test                                     # D0 stays green
4. npm run test:rls                             # 46/46
5. node ~/schooled-ops/cbt-token-probe.cjs      # D1-D5   (to be written on receipt)
6. node ~/schooled-ops/cbt-http-rls-test.cjs    # D6-D13  (to be written on receipt)
7. Phase 17 route + dev server                  # D14-D20
8. Add JWT_SECRET to Vercel BEFORE deploying Phase 2 code, or every login 500s
```

Scripts 5 and 6 are deliberately **not written yet**: they cannot be run, and an unrunnable
test that has never executed is worse than no test, because it looks like coverage. They
will be written against the live transport at step 5, where a failing assertion is
immediately visible.

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
