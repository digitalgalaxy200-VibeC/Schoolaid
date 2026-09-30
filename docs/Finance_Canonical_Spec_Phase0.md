# SchoolAid Finance — Phase 0: Canonical Financial Specification

> Status: **DRAFT FOR REVIEW** — no production code changes result from this document.
> Scope: School Finance domain only (money collected by a school from students/parents).
> Platform Finance (money schools pay SchoolAid: `platform_payments`, `school_subscriptions`, `school_billing_configs`, `platform_bank_accounts`) is a completely separate domain and is **never** referenced by this engine.

---

## 1. Purpose

Replace the frozen-bill mental model with a **recalculable obligation model**:

- Fees determine what a student *currently* owes.
- Payments determine what a student *has actually paid* — and never change.
- Every transition (fee change, recalc, credit, adjustment) is an explicit, recorded, auditable financial event.

This document is the single source of truth that Phase 1–5 implementations must satisfy. UI screens never implement their own financial math.

---

## 2. Governing principles

Seven separate concepts — never collapsed into one mutable “bill amount”:

1. **Fee configuration** — what the school currently charges (session + term + class + fee head + amount).
2. **Student obligation** — what a specific student currently owes for a fee head in a term (with class-at-billing context).
3. **Payment** — money actually received (immutable).
4. **Payment allocation** — how a payment is tied to an obligation (immutable; may be flagged *converted* when excess becomes credit).
5. **Adjustment** — an explicit, reasoned change to an obligation (manual or price-driven).
6. **Credit** — money belonging to the student that is not currently applied to any obligation (ledger-based).
7. **Audit event** — evidence of who changed what, when, before/after, and why.

### 2.1 The Never List

- NEVER delete or modify a historical payment (amount, date, method, reference, fee head, receipt).
- NEVER rewrite an old receipt because fees changed.
- NEVER represent outstanding as a negative number. Excess → credit.
- NEVER hide or silently move excess payments.
- NEVER automatically transfer credit between fees/terms.
- NEVER automatically modify another term when one term’s fee changes.
- NEVER rewrite a previous term because a student was promoted.
- NEVER silently recalculate students; every recalc requires preview → explicit Apply.
- NEVER store an editable `outstanding_balance` as authority. Outstanding is derived.
- NEVER use the audit log as the financial ledger.
- NEVER hardcode finance formulas inside UI components.
- NEVER drop/truncate/rename existing finance tables or data.

---

## 3. Current state audit (verified 2026-09 against staging DB `noyegdgrfzopfrwjunot`)

### 3.1 Existing finance schema (reused as the foundation)

| Table | Key columns (verified) | Role in new model |
|---|---|---|
| `fee_heads` | id, school_id, name, is_compulsory, is_active, display_order | Fee catalogue |
| `term_fees` | id, school_id, academic_section_id (null = school-wide), **term_id (nullable)**, fee_head_id, default_amount, fee_type Required/Not Required, is_active | Class/section default config — becomes **term-aware** |
| `class_fees` | id, school_id, term_fee_id, class_id, amount, is_compulsory, **UNIQUE (term_fee_id, class_id)** | Per-class override config |
| `student_bills` | id, school_id, student_id, term_id, academic_section_id, class_id, gross_amount, waiver_amount, net_amount, status, generated_by | **Term container for a student’s obligations** |
| `student_bill_lines` | id, bill_id, fee_head_id, amount, waived_amount | **Recalculable obligation lines** |
| `payments` | id, school_id, student_id, term_id, amount, method, reference, receipt_number, paid_at, recorded_by, notes, status (active/voided), voided_by, voided_at | Immutable payments |
| `receipts` | id, payment_id, school_id, receipt_number, file_url | Immutable receipts (needs balance-after snapshot) |
| `fee_allocations` | id, school_id, payment_id, bill_line_id, amount | Payment ↔ obligation allocation |
| `student_waivers` | id, school_id, student_id, term_id, fee_head_id, amount, waiver_type, reason | Existing adjustment family |
| `payment_plans` / `payment_plan_installments` | schedule records | Untouched (a plan is not a payment) |
| `student_fee_adjustments` | opt-in/out for optional fees | Optional-fee applicability |

Supporting (existing): `academic_sessions`, `academic_terms` (school_id, session_id, is_active), `academic_sections`, `classes` (+ section_id), `students` (+ first/last name, is_active backfilled from profiles).

### 3.2 Current code

| Piece | Location | Role in new model |
|---|---|---|
| Billing resolution engine | `src/lib/finance/billing.ts` (`loadFeeConfig`, `resolveBillLines`) | Becomes the core of the new deterministic engine (extended, not replaced) |
| Reporting helpers | `src/lib/finance/reports.ts` (posted allocations, section/class summaries, fee breakdown, derived status) | Consumed by dashboard/reports/exports; must be fed by the same engine |
| Receipt renderer | `src/lib/finance/receipts.tsx` | Unchanged output; route gains snapshot fields |
| APIs | `api/school-admin/finance/*` (fee-heads, term-fees, class-fees + apply, matrix, billing + generate + [billId] + waivers, payments + void, receipts/[id]/pdf, payment-plans, student-adjustments, sections, students/[studentId], dashboard, reconciliation, reports, reports/export) | Existing routes stay; new recalc/credit/audit routes added alongside |
| UI | `/school-admin/finance/*` (Overview, Fee Setup/Matrix, Billing, Payments, Reports) | Consumes APIs only |

### 3.3 Live data posture

- Staging: **0 student bills, 0 payments, 0 waivers, 0 allocations**; 2 fee heads, 2 classes, 1 term, 2 schools. Safest possible moment to change the model.
- Production (`iojiahkehnijxxczrgft`): untouched; migration only after staging approval.
- The old abandoned DB’s 47 payments / 226 class fees / 21 term fees are **not** part of these environments; never assume their presence — code inspects the live DB before migrating.

---

## 4. Target entity model (additive)

```
Fee Configuration (term_fees + class_fees, now term-scoped)
        │  (explicit generation / recalculation)
        ▼
Student Obligation  =  student_bills (container) + student_bill_lines (per fee head)
        │
        ├── Payments (immutable) ──► fee_allocations ──► obligation lines
        │
        ├── student_waivers / adjustments (explicit, reasoned)
        │
        └── credits ledger (new) ── credit_applications (new) ──► obligations
                │
                ▼
        Derived position: Current Charge − Waivers/Adjustments − Paid − Credit applied
        = Outstanding (≥ 0)  OR  Credit (when paid > charge)
```

### New tables (all additive, all school-scoped, all RLS-protected like existing)

1. **`fee_change_events`** — record of a fee change + its preview summary + apply scope (who, when, session, term, class, fee head, old amount, new amount, scope, reason, students affected, totals before/after).
2. **`audit_events`** — generic who/what/when/before/after/why for financial actions (fee change, recalc run, adjustment, credit op, payment void).
3. **`credits`** — ledger entries: student, amount, session, source payment id, source allocation id, original fee head, original bill/line, term, reason, status (open/applied), created_by, audit ref.
4. **`credit_applications`** — explicit application: credit_id, target obligation (bill_line_id or bill_id+term), amount applied, applied_at, applied_by.
5. **`receipts.balance_after`** (additive column) — snapshot captured at issuance so a later fee change never changes what a historical receipt implied.
6. **`bill_recalc_runs`** (optional, Phase 2) — one row per executed recalc with inputs/scope, referenced by audit + generated adjustments.

No existing table is dropped, truncated, renamed, or semantically stolen. `student_bills`/`student_bill_lines` remain the obligation storage; their line amounts are updated **only** by the explicit recalc path.

---

## 5. Canonical calculation

### 5.1 Account unit

One obligation line = `(student, academic term, fee head, class-at-billing)`.

### 5.2 Current charge

```
CurrentCharge(line) = amount from the term-aware fee configuration
                      resolved at recalc time for the line's class-at-billing
```

- Fee head blank / ₦0 / disabled-for-class → obligation line amount **0**. A zero charge never deletes history (payments/allocations remain, excess flows to credit).

### 5.3 Position (derived, never stored editable)

```
Gross charge          = CurrentCharge
− Waivers/adjustments = Adjusted charge        (never below 0)
− Valid allocations   = paid against the line  (only status = 'active' payments)
− Credit applied      = explicit applications  (Phase 3)
= Outstanding                                  (clamped at ≥ 0)
```

Overflow rule (same for every path):

```
if paid (incl. credit applied) > adjusted charge:
    Outstanding = 0
    Excess = credit ledger entry (with source references)
```

### 5.4 Statuses (derived from the same calculation — no manual toggles)

| Derived state | Rule |
|---|---|
| Unpaid | charge > 0, paid = 0, no credit applied |
| Partial | 0 < paid+credit < adjusted charge |
| Paid | paid+credit ≥ adjusted charge and no excess produced |
| Credit balance | available credit > 0 (student level) |

### 5.5 Worked examples (authoritative — these are the acceptance scenarios)

| # | Scenario | Charge | Paid | Result |
|---|---|---|---|---|
| A | Normal payment | 50,000 | 30,000 | Outstanding 20,000; credit 0 |
| B | Fee increased | 50,000 → 60,000 | 30,000 | Outstanding 30,000 (payment untouched) |
| C | Fee decreased | 50,000 → 40,000 | 30,000 | Outstanding 10,000 |
| D | Payment exceeds new fee | 50,000 → 40,000 | 50,000 | Outstanding 0; **credit 10,000** |
| E | Fee removed after full payment (Books 20,000) | 0 | 20,000 | Payment intact; **credit 20,000** with source refs |
| F | Promotion | Term 1 billed in Basic 1 | — | Term 1 obligation keeps Basic 1 context |
| G | Term isolation | Term 1 = 50,000, Term 2 = 60,000 | — | Change Term 1 → 55,000 leaves Term 2 at 60,000 |
| H | Credit application | Credit 10,000 | — | Apply to Term 2 Tuition → credit 0 remaining, obligation reduced |

---

## 6. Fee configuration & term awareness

- Matrix scope becomes **Session + Term** (UI selector), then Class × Fee Head.
- `term_fees.term_id` is filled for every row the matrix writes. Rows with `term_id = NULL` (legacy/template) are treated as **templates**: copied into a term the first time that term is configured, and shown as “unscoped template” only until then.
- Apply scope for a change (Phase 2): **this term only | selected terms | future terms | all applicable terms**. Scope is persisted on the `fee_change_event`.
- Blank/“not needed” for a class = `class_fees` ₦0 override (already supported; engine skips ₦0 lines).
- Deactivate fee head (`fee_heads.is_active = false`): stops it appearing in new configuration; **existing obligations keep their lines** until an explicit recalc removes/blanks them — deactivation alone never touches obligations or payments.

---

## 7. Recalculation flow (Phase 2 — preview then apply)

Never silent. Sequence:

1. Admin changes a fee (matrix) — **configuration only**. No student data moves.
2. System computes a **preview** for the chosen scope:
   - affected students; aggregate old vs new obligation totals; difference;
   - representative before/after examples; number of lines producing credit.
3. Admin sees **Cancel | Apply Changes**.
4. On **Apply**, per affected obligation line (matching by fee head + term + class-at-billing):
   - update line `amount` to the new charge;
   - recompute bill gross/net (waivers re-capped at ≤ charge);
   - compute paid-vs-charge; overflow → `credits` entry (source = allocation/payment) and allocations flagged `converted` where excessed;
   - write `fee_change_event` + `audit_events` + optional `bill_recalc_runs`.
5. Apply is idempotent (same config twice → no second change, no duplicate events).

Payments, allocations, receipts are never edited by this flow — only obligation amounts, derived totals, and credit entries are written.

---

## 8. Payment & allocation rules (unchanged behavior, made explicit)

- Recorded via existing `payments` route: overpayment at entry remains **rejected** (documented MVP decision).
- Allocations never exceed the payment; allocation history retained.
- If a later charge drop makes allocations exceed the charge, the excess **becomes credit** (Rule D/E) — the original allocation row stays, flagged `converted`, referencing the credit.
- Void is an audited status transition, never a delete.

## 9. Adjustment rules

- Manual adjustment requires: student, term, target (bill line or fee head), amount, direction, reason, actor. Stored as its own record family; `student_waivers` remains valid for fee/discount waivers and unifies under the same engine read path.
- Adjustments can never drive outstanding negative — overflow becomes credit.
- Every adjustment creates an audit event.

## 10. Credit ledger (Phase 3)

- `credits` rows are created **only** by: (a) recalc overflow (fee cut/removal after payments), (b) explicit admin adjustment, (c) future reversal workflows.
- Fields per spec §10 of the prompt (student, amount, session, source payment, source allocation, original fee head, date, reason, status, applied, remaining). Remaining = derived (`amount − Σ credit_applications`).
- **Application is explicit**: admin picks amount + target obligation; recorded in `credit_applications`. No automatic movement between fees/terms.

## 11. Audit flow (Phase 4)

`audit_events` + `fee_change_events` record actor, timestamp, session/term/class/fee head, before/after values, scope, reason, counts and totals. Financial truth stays in the financial tables; audit provides evidence and answers “why is this balance what it is?”. Audit rows are append-only (no update/delete APIs).

## 12. Receipts

- Receipt row + PDF content never mutate.
- Additive column `receipts.balance_after` (and snapshot of obligation summary) captured at issuance, so recalculations cannot alter what a receipt implied.

## 13. Phase plan & boundaries

| Phase | Build | Gate |
|---|---|---|
| 1 | Term-aware Fee Matrix (session/term selector, template rows, scope on change) | Review on staging; term isolation tests |
| 2 | Recalculation engine (preview + apply + scope + overflow→credit + fee_change_event) | Scenarios A–G pass |
| 3 | Credit & adjustment ledger (credits, credit_applications, manual adjustments) | Scenario H + credit tests |
| 4 | Audit & history (audit_events everywhere, reconstruction views) | Traceability walkthrough |
| 5 | Reporting/reconciliation rebuild on the engine | Parity with engine-derived totals |

Each phase: summary → DB changes → business-rule map → tests → scenarios → UI changes → risks → explicit confirmation checklist (payments immutable, receipts immutable, outstanding derived, credits ledger-based, preview+apply, term isolation, class-at-billing preserved, audit recorded).

## 14. Migration strategy

1. **Backup** staging DB (Supabase project backup / pg_dump) before any DDL.
2. Inspect live tables (never trust assumptions) — verify counts of bills/lines/payments/waivers.
3. Apply **additive** DDL only (new tables/columns listed in §4); no alterations to existing columns’ semantics.
4. Backfill: existing `term_fees` rows with `term_id = NULL` are left untouched and read as templates (§6). No payment/bill data is rewritten — staging currently has none; if any appear before migration, totals are verified before/after via engine-level queries.
5. Run engine unit tests (below) against the migrated schema.
6. Production: same sequence only after full staging approval.

## 15. Automated test strategy

Deterministic engine tests in `src/lib/finance/__tests__/` (pure functions over fixtures — no DB):

- Scenarios A–H from §5.5.
- Blank cell mid-term after partial payment (₦0 charge; paid → credit with source refs).
- Fee restored after removal (obligation recreated on recalc only; history intact).
- Deactivation vs removal (deactivation changes nothing until recalc; removal converts).
- Term isolation (Term 1 change never alters Term 2 totals).
- Promotion (Term 1 line keeps class-at-billing for recalcs).
- Idempotent apply (double apply → single change set).
- No negative outstanding invariant (property check over random fixtures).
- Engine parity test: dashboard/reports totals equal engine-derived totals for same fixture.

## 16. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Silent mass recalc | Preview + explicit Apply + scope persisted + idempotency |
| Credit drift | Ledger + explicit application; remaining always derived |
| Receipt/balance ambiguity after recalc | `balance_after` snapshot at issuance |
| Engine/UI divergence | Single engine module; parity tests |
| Legacy NULL-term rows | Template semantics, documented, migrated only by copy-forward |
| Tenant leakage | Every new table school-scoped + RLS policies mirroring existing inline-JWT pattern; all routes re-verify school ownership |

## 17. Open questions (defaults recommended)

1. Credit application UX — explicit manual apply (default) vs optional “auto-apply at next bill generation” flag per student. → Default: explicit only in Phase 3; revisit in Phase 5.
2. Fee removal vs deactivation in the matrix UI — provide both; removal warns when payments exist (→ credit conversion on next recalc). → Default: deactivate for “stop using”, remove only via recalc scope with preview.
3. Should waivers remain a separate table or be unified under adjustments? → Default: keep `student_waivers` for fee-level waivers; generic adjustments table added Phase 3; engine reads both through one adapter.
4. Recalc eligibility mid-term for classes with zero enrolled students — no lines exist; preview reports them as “no obligation to update”. → Default: informational only.
