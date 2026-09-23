# Phases 17–20 — Progress Report

**Scope of this increment:** the domain layer, schema and tests for the CBT
authoring → delivery → result → report-card chain.

**Status:** complete and verified at the domain and database layers.
**NOT built:** the HTTP route handlers and the user interface. See §4 for why, and
exactly what remains.

Verified: **249 unit tests** across 12 files, **53/53** database isolation and
integrity checks, `tsc --noEmit` clean, and every file written in this increment
lint-clean.

---

## 1. What each phase delivered

### Phase 17 — Question bank — `src/lib/cbt/questions.ts`

| | |
| --- | --- |
| Validation | `parseQuestionInput` — per-type rules, `true_false` defaults to True/False rather than demanding the caller spell it out |
| Lifecycle | `draft → review → approved → archived`, with the transitions declared as data (`QUESTION_TRANSITIONS`) so the rule is readable and testable in one place |
| Readiness | `validateAssessmentReadiness` — refused at **publish** time, not authoring time, so a teacher can build from draft questions and approve as they go |
| Database | create / update / status / get / list, plus `verifyQuestionScope` reusing the Phase 10 ownership helper |
| Tests | 30 |

Two rules worth your attention, both reversible in one place:

1. **An approved question cannot be edited in place.** It must be reopened
   (`approved → review`) first. Editing history is *already* safe because attempts
   snapshot; this rule protects the *process* — someone else's assessment may
   depend on the question as approved. If teachers should edit freely, that is a
   one-line change in `canEditQuestionContent`.
2. **`archived` only returns to `draft`**, so nothing can be resurrected into
   `approved` in a single step.

### Phase 18 — Delivery engine — `src/lib/cbt/delivery.ts`

| | |
| --- | --- |
| Start | `decideStartAttempt` — refuses a second attempt while one is **live**, but does *not* treat an **expired** attempt as a blocker (the student already lost that time) |
| Write | `decideAnswerWrite` — the expiry check runs on **every autosave**, not only at submit, so a student cannot keep answering past the deadline and then submit a complete paper |
| Submit | `decideSubmit` — accepts a submit that lands *after* expiry, because saved work must not be discarded |
| Marking | `planMarking` — objective decided deterministically by option **identity**; theory never auto-marks and holds the attempt at `submitted` |
| Official | `resolveOfficialAttempt`, `shouldRecomputeOfficialScore` (Contradiction B) |
| Database | `createAttempt` (transactional snapshot + cleanup on failure), `markAndStore` |
| Tests | 41 |

The **Contradiction B** decision is now encoded: while the report card is
published, a student may still take a further attempt and it is fully recorded —
but the official score is not recomputed, and the API is given a reason to show a
teacher. Nothing is lost; the promotion simply waits for the next retraction
cycle.

### Phase 19 — CBT → report card — `src/lib/cbt/integration.ts`

Writes **only** `student_scores`. Never `term_results` or
`term_result_components` (PD-1).

- Resolves the component through `resolveTemplateRows` — the canonical
  class → level → school resolver the report-card path already uses, so the two
  cannot disagree.
- Reads the PD-3 lock through the **same** `readReportCardLock` the manual score
  route uses. That helper was private to `api/teacher/scores/route.ts`; it moved
  to `src/lib/report-card.ts` unchanged and the route now imports it. Two
  implementations of "is this report card locked?" is precisely how CBT and manual
  entry would end up disagreeing about whether a write is allowed.
- `planScorePush` is a pure plan, so a caller can show exactly what would change —
  conflicts included — before anything does.
- Refuses a score above the component's maximum rather than writing it. Writing
  35 into a 30-mark component corrupts a report card silently and surfaces weeks
  later at publishing time.
- Refuses the **whole batch** on conflict, rather than writing the clean rows and
  reporting the rest — a half-applied push leaves a component with two sources for
  some students, which is the state PD-2 exists to prevent.
- Records provenance in `cbt_score_links`. Ownership of an existing score is
  decided by provenance, never by comparing values.
- Tests: 11.

### Phase 20 — Publication & correction audit — `src/lib/cbt/corrections.ts`

- `summariseAttemptHistory` returns **every** attempt — Take 1/2/3 with date,
  status and score. Nothing collapsed, because the only way to guarantee a later
  attempt never overwrites an earlier one is to hand back all of them.
- `planOfficialFlags` returns the flag changes as one plan, so the write cannot
  partially apply and leave two attempts official.
- **The audit is written first.** If it fails, the change does not happen. A
  correction that cannot be recorded is worse than no correction, because it makes
  the score look as though it was always that way.
- `recomputeResultFromStoredAwards` is the correction primitive: it re-totals from
  the awards already stored **without re-marking objective answers**, which would
  otherwise overwrite the very teacher award just corrected. It also promotes
  `submitted → marked` once no theory answer is left unawarded.
- A correction is **not** blocked by the report-card lock. The CBT record can be
  corrected at any time; the lock governs whether the corrected score may be
  *pushed*, which is Phase 19's check. Blocking the correction instead would leave
  the two systems disagreeing with no way to reconcile them.
- Tests: 27.

---

## 2. Migration 048 — two invariants made structural

Two rules the engine relies on were enforced only by application code. Application
code has bugs, so they are now indexes:

| Invariant | Before | Now |
| --- | --- | --- |
| One **live** attempt per student per assessment | Nothing stopped two rows both being `in_progress` under different attempt numbers. A student holding two open papers could answer both in parallel. | `cbt_one_live_attempt_per_student` (partial unique index) |
| One **official** result per student per assessment | Nothing limited how many results carried `is_official`. Two would make the report-card push ambiguous, with whichever arrived last winning — silently and unreproducibly. | `cbt_one_official_result_per_student` (partial unique index) |

A partial unique index cannot span a join, and `cbt_results` reached its
assessment and student through `attempt_id`. Those two columns are therefore
denormalised onto the table and kept honest by composite school-consistent
foreign keys, in the same style as migration 047.

Verified safe: `cbt_results` and `cbt_attempts` were both empty (0 rows) before
applying, the new columns are nullable, and the backfill is idempotent. The
migration was applied to staging, re-applied to prove idempotency, and both
invariants now have passing positive **and** negative regression checks.

---

## 3. Verification evidence

| Check | Result |
| --- | --- |
| `npm test` | **249/249** (12 files) |
| `npm run test:rls` | **53/53** (was 46; +7 for migration 048) |
| `npx tsc --noEmit` | clean |
| `npx eslint` on all new files | clean |
| Migration 048 | applied, then re-applied (idempotent) |

Nine pre-existing lint errors remain, none introduced here: four `require()`
imports in the test harness (lines 29–32, untouched) and five `any`s in
`api/teacher/scores/route.ts` (lines 80–137, well below the 27-line import change).
The five `any`s were left alone deliberately — fixing code I did not otherwise
change is scope creep, and worth a separate, reviewable commit.

---

## 4. What is NOT built — the route and UI layer

Every phase above is the **domain and schema** layer. What does not exist yet:

| Missing | Why it is not written yet |
| --- | --- |
| HTTP route handlers (`/api/cbt/...`) | Each one needs `SUPABASE_JWT_SECRET` to execute **even once**. Route code that has never run is where the bugs live — wrong parameter names, a missing `await`, a `params` shape — and none of it is caught by typechecking or by unit tests of the modules beneath it. |
| Teacher-facing UI (question bank, attempt history, marking) | Same dependency, plus it cannot be exercised at all without a running scoped client. |
| Student-facing CBT taking screen | As above. |

The route layer is the next piece of work and is deliberately not written blind.
Once the key lands, the modules above are already covered by tests, so the route
work is thin, mechanical, and immediately verifiable — which is the right order.

---

## 5. One finding from Phase 19 — recorded, not fixed

**`student_scores` policies are school-wide, not role-aware.** The four policies
require only `school_id = jwt.school_id`, so a **student-scoped** token could
INSERT/UPDATE/DELETE scores for its own school. Migration 043 has the same shape
across every table it covered.

**Not exploitable today**, and the reason matters: a student cannot obtain a
PostgREST token (the tenant client is server-side only), the anon key alone
carries no `school_id` so every policy denies it, and a plain Supabase Auth token
also carries no `school_id`.

**Why it should still be fixed:** the moment any feature hands a tenant token to a
browser — the ordinary Supabase pattern, and what a realtime or client-side CBT
feature would want — every student gains write access to their own school's
`student_scores`, `term_results` and `attendance_records`. A large blast radius
resting on one architectural habit.

Recorded as **S3** in the inputs register with the suggested fix shape. It blocks
nothing in CBT, because CBT never exposes a token.
