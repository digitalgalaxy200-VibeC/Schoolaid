# SchoolEd V2 — Feature & Reusability Specification

**Status:** Living specification. Reconciled against the repository at `feat/finance-phase1` @ `e2ee816`.
**Authority:** Where this document conflicts with an older architecture note, this document plus the recorded product decisions below take precedence.
**Gate:** No CBT schema or CBT feature implementation begins until this specification is accepted.

---

## 1. Core Product Principle (locked)

> **CBT is a score-generation mechanism, not a separate grading system.**

It produces an official score which enters the existing SchoolEd grading/report-card pipeline
through `student_scores`. Report-card publication remains the authority for locking official
academic records.

---

## 2. Recorded Product Decisions (FINAL)

### PD-1 — CBT → Report Card

CBT feeds the existing pipeline. The official flow is fixed:

```
CBT Assessment
  → CBT Attempt(s)
  → Official CBT Result
  → CBT Integration Layer
  → student_scores
  → existing approval / recalculation pipeline
  → term_results / term_result_components
  → Report Card
```

- CBT results are **never** written directly into `term_results` or `term_result_components`.
- A CBT assessment is bound to **School → Session → Term → Class → Subject → Teacher → Assessment → Student**.
- The CBT result populates the **configured report-card component** for that term/class/subject.
  *Example: Mathematics → First Term → Test (30 marks) is configured as CBT. John scores 24/30
  in the official CBT result. The integration layer writes `24` into the Mathematics Test
  component in `student_scores`.*
- Provenance must always be traceable:
  `report-card score → component → CBT assessment → official attempt → student → CBT result/answers`.

### PD-2 — CBT vs Manual Scores

- A component has **one active score source at a time**: Manual **or** CBT.
- No conflict-resolution rules ("CBT wins" / "manual wins") are to be built.
- The system **prevents two competing sources from existing** for the same configured component.
- Per-term configuration is valid: First Term → CBT, Second Term → Manual. These are independent.
- Correcting a CBT result is done through the **authorized CBT correction workflow** — never by
  creating a second manual score.

### PD-3 — Report-Card Retraction

- Retraction is **WHOLE CLASS + TERM**. It is not a per-student operation.
- A **mandatory reason** is recorded.
- Retraction does **not** mean every student's score changes. Only records actually changed
  receive score-change audit entries.
- Every score change must record at minimum: **previous value, new value, actor, date/time,
  student, subject, component, reason/context, and the retraction/correction cycle that
  authorized the change.**
- Publish and unpublish/retraction events are themselves auditable.
- Lifecycle:
  `Published → Locked → Admin Retracts (reason required) → Correction Window → Teacher Corrects → Full Audit → Admin Republishes → Published / Locked`
- **This supersedes** any prior documentation permitting teachers to modify published report
  cards directly — specifically master-architecture-doc §3.4 and §6.1, which must be amended.

### PD-4 — CBT Attempts

- Attempts are **separate, immutable, permanent historical records**. Take 1 / Take 2 / Take 3
  all remain available forever.
- A later attempt **must never overwrite** an earlier attempt.
- Each attempt retains its own: attempt number, question snapshot, answers, timing, submission
  state, score, result.
- Maximum attempts is set by assessment configuration.
- **Default official-attempt rule:** the latest valid/completed attempt becomes the official
  attempt automatically.
- An **authorized teacher/admin may override** the official attempt; the override must be
  explicitly recorded in the audit history.
- The system must distinguish three distinct concepts: **attempt history**, **official attempt**,
  **official score**.
- Previous attempts are never deleted, overwritten, or collapsed.

---

## 3. Concrete technical contradictions found

Per instruction, these decisions were not silently altered. Two genuine implementation
contradictions were found. Both are solvable; the smallest alternatives are given.

### Contradiction A — PD-2 assumes subject-level source configuration; components are class-level

**Evidence:** `class_components_templates` is bound `UNIQUE(class_id)`
(`supabase/migrations/011_separated_templates.sql:30-36`), and `components_rows` carries only
`template_id`, `name`, `maximum_score`, `display_order` — **there is no `subject_id`**
(`011:38-44`). The subject dimension exists only in `student_scores.subject_id`.

**Consequence:** "Mathematics Test → CBT" (PD-2's own example) cannot be expressed today. A
component named "Test" is a single row shared by **every subject** in the class, so configuring
"Test → CBT" would make *every* subject's Test CBT, not only Mathematics.

**Smallest alternatives:**

| Option | Approach | Cost |
| --- | --- | --- |
| **A1 (recommended)** | Bind the source on the **CBT assessment itself**: a `cbt_assessments` row declares `(school, session, term, class, subject, component)`, with a partial unique index preventing two active CBT assessments claiming the same tuple. The manual score route refuses to write when a CBT claim exists for that tuple. | **No change to existing component tables.** New CBT table only. Expresses "Mathematics Test is CBT this term" exactly. |
| A2 | Add a subject dimension to component configuration via a new table `component_source_config(class_id, term_id, subject_id, component_id, source)`. | New config surface + migration + UI. More explicit, more work. |
| A3 | Accept component granularity — "Test is CBT for the whole class this term." | Simplest, but changes PD-2's stated intent. |

**Recommendation: A1.** It satisfies "one source at a time", is enforceable with a database
constraint, and requires no modification to existing gradebook tables.

### Contradiction B — PD-4 (latest attempt auto-official) collides with PD-3 (published = locked)

**Evidence:** PD-4 makes the latest completed attempt the official attempt automatically, which
would require updating `student_scores`. PD-3 forbids modifying scores while the class+term
report card is `published`. Therefore: *what happens when a student completes Take 3 after the
class report card has been published?*

**Smallest alternatives:**

| Option | Behaviour | Trade-off |
| --- | --- | --- |
| **B1** | Block new attempts for that (assessment, student) once the class+term report card is `published`; attempts resume after retraction. | Simple and consistent; may deny a student a legitimately remaining attempt. |
| **B2 (recommended)** | **Attempt is always allowed and fully recorded** (history preserved), but the **official score is not recomputed while the report card is locked**. The new attempt becomes official when the class is retracted (or after republishing). | Preserves student effort and audit integrity; requires the integration layer to respect the lock. |
| B3 | Allow the attempt and automatically raise a retraction task for the admin. | Most workflow-correct, most UI work. |

**Recommendation: B2**, with B1 as the stricter option if a school wishes to forbid
post-publication attempts entirely.

---

## 4. Feature Specification

Status key: **S1** explicitly specified · **S2** partially specified · **S3** open decision.

### 4.1 Question Bank

| Feature | Status |
| --- | --- |
| School-scoped bank; manual creation consumes no AI credits | **S1** |
| Core fields: subject, class/level, topic, type, text, marks | **S1** |
| Optional: options, correct option, section, media, explanation, difficulty | **S1** |
| Stable internal option IDs; display letters are presentation-only | **S1** (mandatory) |
| Draft/review/approved lifecycle metadata; AI provenance | **S1** |
| Multiple media per question, explicitly bound to the question | **S1** |
| Editing | **S1** |
| Types: MCQ, True/False, Theory | **S1** |
| Fill-in-the-gap, matching, multi-select, ordering, numeric | **S3** |
| Organisation: folders, tags, search, filters, sorting | **S3** |
| Duplicate / reuse a question across assessments | **S3** |
| Archive vs delete semantics | **S3** |
| Difficulty scale values | **S3** |
| Section semantics (grouping? marks impact?) | **S3** |
| Non-AI bulk import (CSV/Excel/paste) | **S3** |
| Question ownership within a school (creator-only vs shared) | **S3** |
| Learning Objective / Subtopic as required fields | **Out of scope** (explicitly not required) |

### 4.2 Assessment configuration & lifecycle

| Feature | Status |
| --- | --- |
| Configure questions, marks, attempt rules, timing; preview; publish | **S1** |
| Lifecycle: Draft → Review → Published → In Progress → Submitted → Marked → Results Published → Corrected | **S1** |
| Attempt limits configurable per assessment | **S1** |
| Server-authoritative start/expiry; no continuation past expiry | **S1** |
| Immutable per-attempt question snapshots | **S1** (PD-4) |
| Multiple permanent historical attempts | **S1** (PD-4) |
| Default official attempt = latest valid/completed | **S1** (PD-4) |
| Authorized override of official attempt, audited | **S1** (PD-4) |
| Assessment bound to School/Session/Term/Class/Subject/Teacher | **S1** (PD-1) |
| Reopen / cancel / override authority | **S2** — "explicit and audited" stated, authority not named |
| Scheduling / availability window | **S3** |
| Pass mark / pass-fail | **S3** |
| Negative marking | **S3** |
| Targeting granularity (whole class / selected students) | **S3** |
| Re-take eligibility rules (who may take Take 2, and when) | **S3** |

### 4.3 Delivery experience

| Feature | Status |
| --- | --- |
| One question per screen; responsive; inherits the design system | **S1** |
| Timer derived from server state; never a per-second write | **S1** |
| Autosave / network recovery; batched writes | **S1** |
| No correct-answer exposure before the publication policy allows | **S1** |
| Score visibility configurable at school level | **S1** |
| Additional configurable rules beyond attempt limits | **S2** |
| Back-navigation / answer changes before submit | **S3** |
| Flag-for-review, question palette | **S3** |
| Resume-after-disconnect semantics (does the clock continue?) | **S3** |
| Timezone handling | **S3** |
| Accessibility, calculator, offline mode | **S3** |

### 4.4 Marking & results

| Feature | Status |
| --- | --- |
| Deterministic objective marking from stored option identities; no AI | **S1** (non-negotiable) |
| Subjective marked by teacher, or AI-suggested with teacher approval | **S1** |
| AI suggestion never silently published | **S1** (non-negotiable) |
| Corrections audited (original, new, reason, actor, timestamp) | **S1** |
| Attempt history / official attempt / official score kept distinct | **S1** (PD-4) |
| Partial credit / rubric for theory | **S3** |
| Rounding and aggregation rules | **S3** |
| Invalidating an attempt (cheating, technical failure) | **S3** |
| Remark / recheck request workflow | **S3** |

### 4.5 CBT → Report Card integration

| Feature | Status |
| --- | --- |
| Integration layer writes `student_scores`; never `term_results` | **S1** (PD-1) |
| Component resolution uses class → level → school | **S1** |
| Provenance chain persisted and queryable | **S1** (PD-1) |
| One active source per component (Manual XOR CBT) | **S1** (PD-2) — see Contradiction A |
| Official score respects the publication lock | **S1** (PD-3) — see Contradiction B |
| `student_scores.class_id` write re-enabled so class alignment can be enforced | **Required** — currently commented out (`teacher/scores/route.ts:184-186`) |

### 4.6 Report card & results

| Feature | Status |
| --- | --- |
| Published = locked; teachers cannot edit | **S1** (PD-3) — enforcement gap to close |
| Admin retracts whole class+term with mandatory reason | **S1** — already implemented |
| Correction window; teacher edits | **S1** — already implemented |
| Republish | **S1** — already implemented |
| Full score-change audit incl. retraction cycle linkage | **S1** (PD-3) — **audit missing** |
| Publish/unpublish events auditable | **S1** — partially implemented |
| Admin investigation view | **S1** — partial |
| Previously downloaded PDFs after retraction | **S3** |
| May a teacher edit any score during the window, or only flagged ones? | **S3** |
| Who may retract — School Admin only, or Super Admin too? | **S3** |

### 4.7 AI platform

| Feature | Status |
| --- | --- |
| Capability-based gateway; provider-agnostic; DeepSeek initial; finite fallback; SA-configurable priority | **S1** |
| SA control plane (providers, models, capabilities, priority, connectivity test, quota, credit allocation, failure monitoring) | **S1** |
| AI use cases: PDF→Q, Image→Q, Text→Q, Modify with AI, Voice→Text, AI subjective marking | **S1** |
| Injection protection; untrusted content is data; no raw SQL; tenant derived server-side; output validation | **S1** |
| Super Admin Copilot kept as a separate permission domain | **S1** |
| Credit cost formula per operation | **S3** |
| Speech-to-text provider | **S3** |
| Which DeepSeek models/capabilities to activate | **S3** |
| Which failures trigger fallback vs stop | **S3** |
| School-level controls for AI-assisted marking | **S3** |
| Retention/privacy policy for AI requests and uploads | **S3** |
| Legal terms for future content reuse/training | **S3** |
| Provider credential management (env vs SA UI) | **S3** |

### 4.8 AI Credits

| Feature | Status |
| --- | --- |
| School-owned wallet; append-only ledger; included / promotional / purchased; expiry; balance visibility; pre-operation estimate; reservation + refund on failure; provider usage tracked separately from credits charged | **S1** |
| Purchase flow mechanics | **S3** |
| Zero-balance mid-operation behaviour | **S3** |
| Who sees the balance | **S3** |
| Promotional expiry defaults | **S3** |

### 4.9 Explicitly out of scope (architect for reuse, do not activate)

Practice Mode · public student learning platform · AI tutoring / adaptive learning ·
lesson-note generation · additional AI providers beyond the initial one ·
teacher-personal credit purchasing.

---

## 5. Reusability Specification

One implementation per capability. Do not create parallel utilities.

| # | Capability | Reused by | Exists? | Infrastructure |
| --- | --- | --- | --- | --- |
| R1 | Tenant ownership validation (proves a referenced row belongs to the caller's school) | All write paths | ⚠️ Pattern proven in `ai-import:178-211`, **not extracted** | V1 — extract |
| R2 | Role/authorization guards (`verifySchoolAdmin/Teacher/Student/SuperAdmin`) | All routes | ✅ `school-auth.ts`, `api-auth.ts` | V1 |
| R3 | CBT authorization guard (role + tenant + class/subject/teacher) | All CBT routes | ❌ Create (Phase 16) | V2 |
| R4 | Component resolution (class → level → school) | Gradebook entry, publish, CBT integration | ⚠️ Exists 3+ times, inconsistently | V1 — unify |
| R5 | Grade/mark computation (total → % → band → remark) | All report-card paths | ❌ 11 divergent copies | V1 — unify |
| R6 | Audit logging (actor, action, target, before/after, reason, timestamp) | Corrections, publish/unpublish, AI, admin ops | ⚠️ 5 fragmented tables; best template `fee_change_events` | V1 — unify pattern |
| R7 | Result/score correction history incl. retraction-cycle linkage | PD-3 workflow, CBT corrections | ❌ Create (Phase 12) | V2 (extends V1) |
| R8 | Media handling: upload + private bucket + signed URLs | Question media, exam imports, logos, avatars | ⚠️ Public-only today | V1 — extend |
| R9 | AI Gateway / provider abstraction | All AI features | ⚠️ Interface only; provider hardcoded | V2 |
| R10 | AI credit ledger (append-only) | All AI features | ❌ Create (Phase 22) | V2 |
| R11 | Validation utilities (runtime input + AI output validation) | All routes, AI output | ❌ No validation library in repo | V1 + V2 |
| R12 | Tenant-scoped Supabase client (anon key + server-minted token so RLS applies) | CBT routes (optionally more later) | ❌ Create (Phase 7) | V2 |
| R13 | JWT secret module (single fail-closed source) | All auth call sites | ❌ 6+ duplicated ternaries | V1 |
| R14 | Feature flags (`school_features`) | AI import, CBT, AI gateway | ✅ Working | V1 |
| R15 | Rate limiting (shared across instances) | Login, AI, attempt submission | ⚠️ Memory-only today | V1 |
| R16 | PDF generation (server-side React PDF → buffer) | Receipts, invoices, CBT results | ✅ `finance/receipts.tsx` | V1 |
| R17 | Attempt snapshot utility (immutable per-attempt question state) | Every attempt | ❌ Create (Phase 15) | V2 |
| R18 | Shared UI components + design tokens | All UI | ✅ — gaps: radio group, stepper, timer, progress | V1 |
| R19 | Error / loading / empty states | All pages | ✅ `ErrorState`, `Skeleton*` | V1 |
| R20 | School defaults (seed components/grades/traits) | Provisioning | ⚠️ **Conflicting**: `school-defaults.ts:11-15` (30/30/40) vs `025_auto_seed_defaults.sql:20-23` (20/20/60) | V1 — reconcile |
| R21 | Notification / email | Onboarding | ⚠️ `email.ts` has **no importers — dead code** | V1 |

---

## 6. Roadmap reconciliation

| Phase | Change required |
| --- | --- |
| **11** | Freeze semantics scoped to `published` only. A retraction window is **not** corruption. |
| **12** | Rewritten: add `published` to the write-blocking set (`teacher/scores/route.ts:131`); add score-level audit; link each edit to its retraction cycle; extend `result_edit_logs` with `school_id`, `reason`, component detail. |
| **14** | `cbt_assessments` carries explicit `school_id, session_id, term_id, class_id, subject_id, teacher_id` with constraints proving subject∈class and teacher-assigned. |
| **15** | Add `attempt_number` + `UNIQUE(assessment_id, student_id, attempt_number)`; snapshots immutable and per-attempt. |
| **16** | Enforce enrolments, class/subject/teacher alignment server-side and at the RLS boundary. |
| **18** | Add attempt-history UI (Take 1/2/3 with date, score, status) and the audited official-attempt override. |
| **19** | Depends on Contradiction A resolution; needs component-source claim enforcement (A1) and lock-aware official score updates (B2). |
| **NEW gate** | No CBT schema/feature work until this specification is accepted. |

---

## 7. Gates

1. No CBT schema or feature implementation before this specification is accepted.
2. No migration or destructive action before Phase 1 backup + restore verification is performed.
3. Phases 2–13 may proceed where dependencies permit.
4. AI must remain optional: CBT fully functional with AI disabled.
5. Practice Mode must not be activated.
6. Super Admin impersonation is preserved as a capability; only its authorization is hardened.

---

## 8. Open decisions register

| # | Decision | Blocks |
| --- | --- | --- |
| O1 | **Contradiction A** — choose A1 / A2 / A3 for component source binding | Phase 19 |
| O2 | **Contradiction B** — choose B1 / B2 / B3 for attempts after publication | Phases 18–19 |
| O3 | Previously downloaded PDFs after retraction | Phase 12 |
| O4 | Who may retract (School Admin only vs also Super Admin) | Phase 12 |
| O5 | Question types at launch | Phase 17 |
| O6 | Resume-after-disconnect clock behaviour | Phase 18 |
| O7 | AI credit pricing, STT provider, DeepSeek models, fallback triggers, retention policy | Phases 21–23 |
