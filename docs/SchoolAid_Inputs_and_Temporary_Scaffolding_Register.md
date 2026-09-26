# SchoolAid — Inputs & Temporary Scaffolding Register

**Purpose.** A durable list of (1) the things I am waiting on from you, and (2) the temporary
scaffolding that must be removed *when* you deliver them. This exists so that nothing depends on
my memory — every item below is verifiable in the repo or in `~/schooled-ops/`.

**Rule for this file:** it names *where* credentials live, never *what* they are. Real values exist
only in gitignored env files.

**Last updated:** Phase 11 implemented and verified end to end on staging, including a LIVE run of the real publish/retract/republish lifecycle (migrations 055 and 056 applied; S4 records the missing audit table that live run uncovered). Also includes the product owner's decisions on retraction and PDFs, and confirmation that `JWT_SECRET` is set in production.

---

## Part 1 — Inputs I am waiting on

### 1.1 Blocking something you will actually run

| # | Input | Where you get it | What it unblocks | If it stays absent |
| --- | --- | --- | --- | --- |
| **I1** | **`SUPABASE_JWT_SECRET`** — ✅ **DELIVERED AND VERIFIED** | Supabase dashboard → `noyegdgrfzopfrwjunot` → Settings → API → **JWT Settings → Legacy JWT secret** | Now unblocked: the tenant-scoped client works over the real transport (8/8 standalone, 6/6 through the app code). | — |
| **I2** | **`JWT_SECRET` present in Vercel** | ✅ **PRODUCTION: CONFIRMED by the product owner, 2026-09-24.** Staging was configured earlier in the session. | — | **The ordering trap is closed**, and so is the old fallback risk: the pre-Phase-2 chain was `JWT_SECRET` \|\| service-role key \|\| `"fallback-insecure-secret"`, and with the first now set in production, the two dangerous fallbacks are unreachable there **whether or not the fixed code is deployed**. **Two things still worth confirming:** the value is a dedicated random string and **not** the service-role key (the current code *throws* if they match, which would 500 every login), and at least 32 characters (it warns below that). |
| **I3** | A decision on **Contradiction B** — attempts after a report card is published | Your call (options recorded in the spec, `O2`) | Phase 18 delivery engine, Phase 19 integration. | **No longer blocking the build** — Phase 18 encodes the recommended B2 behaviour (`shouldRecomputeOfficialScore`), and it is a one-line change if you prefer B1 or B3. |
| **I4** | **Who may retract** (`O4`) | ✅ **DECIDED 2026-09-24: BOTH** — a School Admin and a Super Admin may retract. | Phase 11/12. | The retract endpoint (`api/school-admin/report-card-review/[classId]`) is gated by `verifySchoolAdmin()`, so the Super Admin route today is impersonation. Phase 11 would make that explicit rather than leave it implicit. |
| **I5** | **Question types at launch** (`O5`) | Your call | Phase 17 question bank UI. | Schema and validation already support `mcq`, `true_false`, `theory`. **Implemented as exactly these three** unless you say otherwise. |
| **I19** | **A decision on Contradiction C — "republish" does not recompute** (`O8`) | Your call | The Phase 11 retraction test you specified. | That test's step *"modify the result → republish → confirm the corrected result"* **cannot pass as written**: `republish` restores the frozen results AS-IS and never runs the recompute that `approve` runs, so a corrected score reaches the card only via **re-submit → approve**. Two ways out: (a) keep the lifecycle and reword the test — corrected results go through approve; or (b) make `republish` recompute, which is a behaviour change to a live workflow. **I have not changed it.** |

### 1.2 Waiting on you later — not blocking now

| # | Input | Blocks |
| --- | --- | --- |
| I6 | Previously downloaded PDFs after a retraction (`O3`) | ✅ **DECIDED 2026-09-24: leave them.** A PDF already in a parent's hands is accepted as-is — no superseding marker, no recall mechanism. | — |
| I7 | Resume-after-disconnect clock behaviour (`O6`) | Phase 18 |
| I8 | AI pricing, STT provider, DeepSeek model choice, fallback triggers, retention (`O7`) | **Partly answered 2026-09-24.** Model DECIDED and applied: `deepseek-flash`, which serves text AND vision, enabled on staging via migration 052. **Still owed:** the pricing schedule (`PLACEHOLDER_PRICING` in `src/lib/ai/credits.ts`), the speech-to-text provider, fallback triggers (`isRetryableStatus`), and usage retention. |
| **I9** | **Consent to move `ai-import` and the copilot onto the AI gateway** | Removes the two remaining direct DeepSeek clients. **Not a refactor — a behaviour change** (their usage would start being charged against credits, and they would stop working while AI is disabled, which is today's default). See `docs/Phases21-22_Progress_Report.md` §4. |
| **I10** | **Harden `ai-import` uploads** using `validateUpload` | ✅ **DONE** — extension from the bytes, type checked against the bytes, size capped, validated once before storage. See `docs/AI_Settings_Screen_and_V1_Fixes_Report.md`. |
| **I11** | **Allow-list `PUT /api/school-admin/school`** | ✅ **DONE** — a projection onto writable columns, not a rejection, because the profile screen round-trips the whole row. |
| **I12** | **Fence school-derived values in the copilot prompt** | ✅ **DONE** — school names and the school list are fenced; term/session names sanitised. |
| **I13** | **`DEEPSEEK_API_KEY` in `.env.staging` and in Vercel (staging project)** | **Blocks every AI call.** DeepSeek is now ENABLED on staging (migration 052), so a call fails with a message naming this variable until it exists. I verified it is absent from both `.env.local` and `.env.staging`. Add it by hand, never in chat. |
| **I14** | **Six TRACKED scripts hardcoded the PRODUCTION project ref** | ✅ **DONE** — guarded via `scripts/lib/db-guard.js`. See Part 6. |
| **I15** | **A speech-to-text provider** (only if voice notes are wanted) | Verified: Gemini does NOT fit the current `speech_to_text` capability — its docs transcribe via an `input_audio` part inside a chat completion, not the `/audio/transcriptions` endpoint the adapter uses. Either name an OpenAI-compatible STT provider (Groq/OpenAI Whisper fit with **zero new code**), or I add a second adapter `kind` for the audio-in-chat shape. |
| **I16** | **Build the Super Admin AI configuration screen** | ✅ **DONE** — `src/app/super-admin/ai` (page + API + nav entry). Supports priority ordering, per-provider and per-model enables, per-school AI access, and ADDING a provider or model. **Never opened in a browser — needs your visual pass.** |
| **I17** | **The legacy `deepseek-chat` model name** | ✅ **DONE** — changed to `deepseek-flash` in `src/app/api/teacher/ai-import/route.ts` and `src/lib/copilot/providers/deepseek-provider.ts`, on your statement that flash is the model you use. One line each to revert. |
| **I18** | **Grant a school the `ai` flag** (and some credits) to test | The school gate is DEFAULT-DENY, so no school can use AI until one is granted on the AI Settings screen. Never tested with a real grant. |

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
| **D9** | `PLACEHOLDER_PRICING = { perCall: 1 }` | Awaiting O7. A made-up per-token schedule would put an invented number in the path of real money. Being a single constant is the point: it is what changes when you decide, and nothing else does. |
| **D10** | AI is **seeded disabled** and `runAiCall` returns a *refusal*, not an exception | The stated requirement is that CBT works fully with AI off. A refusal is an ordinary state a screen renders, and a caller forced to catch an exception to show a normal message will eventually forget to. |
| **D11** | Nothing in `src/lib/ai/` executes anything a model returns | A reply is parsed and read. There is no `eval`, no `Function`, no dynamic dispatch and no SQL. Prompt fencing is mitigation; this is the guarantee, and it must not be traded away because a prompt "looks safe". |
| **D12** | `ai_providers` / `ai_provider_models` are RLS-enabled with **no policies** and no `school_id` | Platform configuration, not tenant data. Verified live: a tenant token reads zero rows while the service client reads the seeded row. The isolation ratchet only counts tables carrying `school_id`, so this is allowed on purpose — same treatment as `components_rows` and `super_admins`. |
| **D13** | The **bulk "set everyone to one password"** routes and scripts were **deleted on 2026-09-24**. Do not recreate them. | `bulk-reset-passwords` set every teacher and student in a school to `school123`; `bulk-reset-students` set them to `<SCHOOLNAME>x3 + 123`, which is derivable from the school's own name; `scripts/reset_all_passwords.js` did it platform-wide. All four are in git at `9a31091` — see `scripts/README.md` for restoration. **If the capability is wanted again, use `generateUniquePassword()` in `src/lib/password.ts`**, which every other reset route already uses and which gives each person a different password. |
| **D14** | A published card resolves its templates from the class that **PUBLISHED** it — the `classId` `isTermApprovedForStudent` already returns from the frozen `term_results.class_id` — not from the student's current class | After a promotion the two differ, and the card re-rendered itself against the new class's components and grading bands. The helper was already written to use the frozen class ("so a later promotion doesn't hide already-published results"); the renderer simply was not reading the value. Only a student who has changed class since publication sees any difference, and the difference IS the fix. |
| **D15** | Class size on a published card is the **ROSTER** size, while position ranks only the students who sat the term | "5th of 32" is what the card has always printed, even when few students have results for that term. Freezing the participant count instead would have changed an issued card from "1 of 6" to "1 of 1" — verified against staging, where the one published class has 6 students on the roster and 1 with results. |
| **D16** | `publication_history` on `report_card_submissions` is immutable **by convention**, with no database trigger | The `BEFORE UPDATE` triggers used by migrations 046/050 block an update outright; this column is legitimately rewritten on every republish, because each publication appends the one it retires. A trigger would block the feature it was meant to protect. Documented in migration 055. |

---

## Part 4 — Security chore, owed

| # | Chore | Notes |
| --- | --- | --- |
| **S1** | Rotate the staging database password | It was pasted into the chat, so treat it as disclosed. Rotation is cheap; production is untouched by any of this. |
| **S2** | Treat `SUPABASE_JWT_SECRET` as **service-role-grade** | Anyone holding it can mint a token with `role: service_role`, which bypasses RLS entirely. Server-side only — never in a `NEXT_PUBLIC_*` variable, never in a client bundle. |
| **S3** | **`student_scores` policies are school-wide, not role-aware** (found in Phase 19) | ✅ **FIXED — migration `054`.** All 24 tables from 043 now require `app_role` in (`teacher`,`school_admin`) for INSERT/UPDATE/DELETE; SELECT stays school-scoped, and super admin and the service role are unchanged. Proven by section 11 of the isolation harness (62/62), which also asserts that no write policy is role-blind and that reads were not withdrawn. **`cbt_attempt_answers` was deliberately NOT tightened** — its student `FOR ALL` policy is load-bearing for the answer autosave (`src/app/api/cbt/attempts/[id]/route.ts`), so narrowing it would break sitting a test. |
| **S4** | **`report_card_audit_logs` did not exist in the database** (found by the Phase 11 live test) | ✅ **FIXED — migration `056`**, applied to staging and verified. The table is declared in `017_report_card_submissions.sql` but had never been created here (its sibling `report_card_submissions` from the same file does exist, so 017 was applied in a variant). **Seven routes wrote to it and two read it, every insert failing silently** because the result is never checked — so "who published this, who retracted it, why" was being recorded nowhere, and the School Admin's audit view (`.../report-card-review/[classId]/logs`) had nothing to show. 056 recreates the table exactly as 017 declares it (same columns, FKs, index, RLS, grants), creates the policy only if the table has none, and backfills nothing. Ratchet and harness re-verified: **62/62**, and section 4's tenant-policyless count is still 0. **Production needs 056 applied too — with your approval; it is off-limits until then.** |
| **S5** | **`audit_logs` (migration `009`) is also absent from the database** | ⚠️ **NOT fixed — needs your call.** Same root cause as S4, different blast radius: written by the password-change and password-reset routes (`api/school-admin/reset-password`, `api/auth/change-password` ×2), so credential events are not audited either. It carries `school_id` and **no RLS at all**; the section 4 ratchet only counts RLS-**enabled** tables, so it would not be flagged today. Fix is one small migration mirroring 009 — but whether that table should be RLS-enabled with a policy (my recommendation, the S3 direction) or left as 009 declares it is a design decision, so I have not made it. |

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

## Part 6 — The operations-script guard (I14)

Six scripts in `scripts/` pointed at **production**: three hardcoded, and three
that fell back to it silently when `SUPABASE_URL` was unset. Because the env files
here define `NEXT_PUBLIC_SUPABASE_URL` rather than `SUPABASE_URL`, that fallback
was the **normal** path, not an edge case — so `import_broadsheet.js` (writes
scores), `migrate.js` (creates users, imports schools) and `query_db.ts` all
pointed at production every time they ran.

**The rule, enforced by `scripts/lib/db-guard.js`:**

```
Staging runs freely. Any other database must be named out loud, by ref.
```

| Target | Behaviour |
| --- | --- |
| `noyegdgrfzopfrwjunot` (staging) | Runs, after printing `▶ target: staging` |
| `iojiahkehnijxxczgrft` (production) | **Refuses** unless `--confirm-target=iojiahkehnijxxczgrft` is passed exactly |
| Any other ref | **Refuses**; the same flag names it |
| A target that cannot be determined | **Refuses.** A script that cannot name its target must not run |

The override is the full ref rather than a bare `--yes` on purpose: it cannot be
muscle-memoried, and it forces the operator to know which database they named.
`query_db.ts` also lost its silent production fallback outright — it now refuses
to guess, the same shape as `getJwtSecret()`.

Verified by running all five runnable scripts aimed at production: each refused,
and the output showed no connection attempt. The positive control — the same
script with the production URL replaced by the staging one — passed the guard and
printed `▶ target: staging`. **`query_db.ts` could not be run at all: this repo has
no `tsx` or `ts-node`, so that script has no runner.** It is type-checked only.

---

## Part 5 — Cleanup checklist

```
1. SUPABASE_JWT_SECRET in .env.staging         ✅ done, verified against the anon key
2. npm run env:staging                          ✅ done (env:which confirms staging)
3. npm test                                     ✅ 410 passed, 43 skipped (3 live suites)
4. npm run test:rls                             ✅ 53/53
5. Live transport tests                         ✅ CBT_LIVE=1 npx vitest run \
                                                   src/lib/cbt/__tests__/live-scoped-client.test.ts \
                                                   src/lib/ai/__tests__/live-ai.test.ts
6. AI tables verified on staging                ✅ 6/6, and staging left at baseline
                                                   (providers 1, models 1, lots 0, ledger 0, usage 0)
7. Migration 052                                ✅ applied to staging: DeepSeek ENABLED,
                                                   text+vision on deepseek-flash
8. Migration 053                                ✅ applied to staging: Groq ENABLED
                                                   (whisper turbo + full, + text fallback)
9. V1 fixes I10, I11, I12                       ✅ done, lint-neutral on the files touched
10. School-level AI gate + AI Settings screen    ✅ built, tsc + eslint clean
                                                   ⬜ never opened in a browser
11. STILL OWED: rotate the staging DB password, then re-run steps 3-4
12. STILL OWED: delete ~/schooled-ops/pgdata_pg16_old (dead PG16 data dir)
13. STILL OWED: decide T4 (backup retention), T5 (which-env.js), T6 (docx),
    I9 (rewire ai-import), I13 (API keys), I15 (STT adapter for Gemini, only if
    wanted), I18 (grant a school the ai flag), O7 pricing
14. Six production-pointing scripts               ✅ guarded (scripts/lib/db-guard.js)
15. Bulk one-password routes + scripts            ✅ DELETED 2026-09-24 (see scripts/README.md)
16. Broadsheet importer                           ✅ DELETED 2026-09-24, restorable from 9a31091
17. Migration one-offs (migrate.js, run-migration.js,
    run-migration-api.js, query_db.ts)            ✅ DELETED 2026-09-24, restorable from 9a31091
18. S3 role-aware tenant policies                 ✅ migration 054 applied; harness now 62/62
19. I17 legacy model name                          ✅ changed to deepseek-flash (2 one-line edits)
20. Phase 24 testing (in progress)                 ✅ AI providers route (19 tests), copilot prompt
    fencing (9), school-field projection (6), stale live-AI assertions corrected
    ⬜ browser pass still owed
21. JWT_SECRET in production                       ✅ confirmed by the product owner; ordering trap closed
22. Who may retract                                ✅ DECIDED: both (School Admin + Super Admin)
23. PDFs after a retraction                        ✅ DECIDED: leave already-downloaded ones as they are
24. Phase 11 (published report cards immutable) ✅ IMPLEMENTED on staging:
    migration 055 (2 additive nullable columns + 2 CHECK guards) + migration 056
    (recreates the missing `report_card_audit_logs`, see S4), both applied and verified;
    `src/lib/report-card-snapshot.ts` (+19 unit tests) wired into `approve`, `publish`,
    `republish` and the student renderer; +5 LIVE tests that run the real lifecycle
    (`CBT_LIVE=1 npx vitest run src/lib/__tests__/live-report-card-snapshot.test.ts`),
    including the acceptance test and the audit trail. tsc, eslint, the full suite
    (467) and the isolation harness (62/62) are all clean. No browser pass yet.
25. Remaining scripts/ helpers that reach a DB     ⚠️ NOT guarded, and NOT part of the six.
    They follow whichever env is loaded rather than defaulting to production. Two more
    migration-family files also remain (run_mig.js → localhost; run-seed.js → an
    unrecognised ref `acxgfhvptoluhlxuttly`). Flagged in scripts/README.md, awaiting a decision.
26. Production untouched; no production value has been read or written
```
