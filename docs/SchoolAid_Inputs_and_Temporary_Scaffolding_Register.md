# SchoolAid — Inputs & Temporary Scaffolding Register

**Purpose.** A durable list of (1) the things I am waiting on from you, and (2) the temporary
scaffolding that must be removed *when* you deliver them. This exists so that nothing depends on
my memory — every item below is verifiable in the repo or in `~/schooled-ops/`.

**Rule for this file:** it names *where* credentials live, never *what* they are. Real values exist
only in gitignored env files.

**Last updated:** Phase 16 (CBT authorization & tenant boundary).

---

## Part 1 — Inputs I am waiting on

### 1.1 Blocking something you will actually run

| # | Input | Where you get it | What it unblocks | If it stays absent |
| --- | --- | --- | --- | --- |
| **I1** | **`SUPABASE_JWT_SECRET`** | Supabase dashboard → project `noyegdgrfzopfrwjunot` → **Settings → API (Keys) → JWT Settings → JWT Secret** | The tenant-scoped Supabase client — the only way CBT routes touch the database with RLS actually applying. Phase 7 built it; Phase 16 makes it the CBT boundary. | `createTenantScopedClient()` **throws**. It fails closed by design and refuses to quietly fall back to the service-role client (which would silently disable RLS). CBT cannot serve a single request. |
| **I2** | **`JWT_SECRET` present in Vercel** (staging project) | Generate it yourself; it must be at least 32 random characters and **must not** equal the service-role key | Phase 2's code. | **Every login returns HTTP 500** once Phase 2's code is deployed. This is a deployment-ordering trap: the variable must exist *before* the deploy, not after. |
| **I3** | A decision on **Contradiction B** — attempts after a report card is published | Your call (options recorded in the spec, `O2`) | Phase 18 delivery engine, Phase 19 integration. | Work can start; the official-score update path cannot be finalised. |
| **I4** | **Who may retract** — School Admin only, or Super Admin too? (`O4`) | Your call | Phase 12 sign-off (report card — currently parked per your instruction). | Blocks nothing I am building now. |
| **I5** | **Question types at launch** (`O5`) | Your call | Phase 17 question bank UI. | Schema already supports `mcq`, `true_false`, `theory`. I will assume exactly these three unless you say otherwise. |

### 1.2 Waiting on you later — not blocking now

| # | Input | Blocks |
| --- | --- | --- |
| I6 | Previously downloaded PDFs after a retraction (`O3`) | Report card (Phase 11/12, parked) |
| I7 | Resume-after-disconnect clock behaviour (`O6`) | Phase 18 |
| I8 | AI pricing, STT provider, DeepSeek model choice, fallback triggers, retention (`O7`) | Phases 21–23 |

---

## Part 2 — Temporary scaffolding to remove when you deliver

| # | Item | Where | Why it exists | Remove when |
| --- | --- | --- | --- | --- |
| **T1** | `.env.production` contains **placeholders only** (URL + token-shaped strings) | `.env.production` (gitignored, never tracked) | So the `env:production` switch has a safe target and I never hold production secrets. | You fill it at production-deployment time. **I will not fill it.** Delete it if you prefer. |
| **T2** | Staging DB password is embedded in `STAGING_DB_URL` + `SUPABASE_DB_PASSWORD` | `.env.staging` (gitignored, never tracked) | Needed to dump/restore/verify the staging DB. | You rotate it (you said "after this sprint"). Then update `.env.staging`, re-run `npm run test:rls`, and archive the pre-rotation backup. |
| **T3** | `~/schooled-ops/pgdata_pg16_old` — dead PostgreSQL 16 data directory | outside the repo | The sandbox was first built on PG 16, then rebuilt on **PG 17.11** because `pg_dump` refuses to dump from a newer server. This is the old one. | Safe to delete now. Only kept as a spare restore target. |
| **T4** | Backups under `~/schooled-ops/backups/` | outside the repo | Phase 1 verified baseline. | After V2 reaches production **and** a production baseline is separately verified. |
| **T5** | `scripts/which-env.js` is untracked | `scripts/` | Small env switcher used by `npm run env:staging`. | Decide: make it permanent repo tooling (then commit it) or keep it local. Your call. |
| **T6** | Two untracked `.docx` files in `docs/` | `docs/` | Your architecture/spec documents. | Decide whether they belong in git. I have not committed them without your say-so. |

---

## Part 3 — Deliberate decisions that look like unfinished work — **do not "fix" these**

These are not scaffolding. They are intentional, and undoing them would reintroduce a bug or
a security gap that was already paid for.

| # | Decision | Why it is deliberate |
| --- | --- | --- |
| **D1** | `assessment_scores`, `subject_class_assignments`, `users` were **not created** | They were phantom tables (referenced by code, absent from the database) that duplicated `student_scores`, `class_subjects`, `profiles`. Callers were repointed instead of creating duplicates. |
| **D2** | `rate_limits` has RLS **enabled with no policies** | It is not tenant data. The isolation ratchet only counts tables carrying `school_id`, so this is allowed on purpose. |
| **D3** | A `BEFORE UPDATE` trigger blocks editing `cbt_attempt_questions` — **for everyone, including the service role** | PD-4. Editing a question must never change what a past student saw. Correct the result through the audited correction workflow instead. |
| **D4** | Answer keys live in `cbt_question_answer_keys`, **not** as a column on `cbt_question_options`; no student policy exists on either | Permissive RLS policies OR together, so a blanket "same school" SELECT policy on the options table would hand students the answer key. |
| **D5** | `cbt_assessments` binds its component via `component_id` + a partial unique index | This is option **A1** for Contradiction A: it expresses "Mathematics Test is CBT this term" without touching the existing component tables. |
| **D6** | `scripts/get_creds.js` is a disabled stub | It used to print every school admin's plaintext password. The stub stays so nobody recreates it by copy-paste. |
| **D7** | `getJwtSecret()` **throws** rather than falling back | The previous hardcoded `"fallback-insecure-secret"` let anyone forge a super-admin session whenever `JWT_SECRET` was unset. |
| **D8** | `cbt_attempts` / `cbt_attempt_questions` are **SELECT-only** for students | Phase 14's `FOR ALL` policy let a student rewrite their own `started_at`/`expires_at`. Fixed by migration 046. |

---

## Part 4 — Security chore, owed

| # | Chore | Notes |
| --- | --- | --- |
| **S1** | Rotate the staging database password | It was pasted into the chat, so treat it as disclosed. Rotation is cheap; production is untouched by any of this. |
| **S2** | Treat `SUPABASE_JWT_SECRET` as **service-role-grade** | Anyone holding it can mint a token with `role: service_role`, which bypasses RLS entirely. Server-side only — never in a `NEXT_PUBLIC_*` variable, never in a client bundle. |
| **S3** | **`student_scores` policies are school-wide, not role-aware** (found in Phase 19) | Its four policies require only `school_id = jwt.school_id`. A **student-scoped** token could therefore INSERT/UPDATE/DELETE scores for its own school. The same is true of every table migration 043 covered. |

### S3 — why it is not treated as an emergency

It is **not exploitable today**, and the reason is worth stating precisely rather
than assuming:

- A student cannot currently obtain a PostgREST token. The tenant-scoped client
  is constructed **server-side only** in `src/lib/cbt/authz.ts`; the token is
  never returned to a browser.
- The **anon key alone grants nothing**, because every policy compares
  `school_id` to a JWT claim. An anon-key request carries no `school_id`, so
  `NULL = school_id` is not true and the row is denied.
- A genuine Supabase Auth token (if one is ever issued) also carries no
  `school_id` claim, so it is denied by the same comparison.

So the school-wide policies are only reachable with a token our own server mints,
and that server only mints one after the role and tenant have been authorised.

The reason to fix it anyway: the moment any feature hands a tenant token to the
browser — which is the ordinary Supabase pattern, and exactly what a realtime or
client-side CBT feature would want to do — every student immediately gains write
access to their own school's `student_scores`, `term_results` and
`attendance_records`. That is a large blast radius resting on a single
architectural habit.

**Fix shape:** make the 043 policies role-aware (`app_role = 'student'` for
SELECT only, staff for writes) in a forward migration, in the same style as
`046`. Not started; not a blocker for CBT because CBT never exposes a token.

---

## Part 5 — Cleanup checklist (run when I1 and I2 land)

```
1. Add SUPABASE_JWT_SECRET to .env.staging       (you, by hand — never in chat)
2. npm run env:staging                            (syncs .env.local)
3. npm test                                       (unit suite)
4. npm run test:rls                               (DB-level isolation + alignment)
5. Proceed to the CBT route work that needs a real scoped client
6. Rotate the staging DB password; update .env.staging; re-run steps 3-4
7. Delete ~/schooled-ops/pgdata_pg16_old
8. Decide T4 (backup retention), T5 (which-env.js), T6 (docx)
```
