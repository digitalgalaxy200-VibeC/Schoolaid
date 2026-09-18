# SchoolEd — Staging Baseline Report

**Generated:** 2026-09-18 03:55 UTC  **Branch:** `CBT`  **Source:** live staging `noyegdgrfzopfrwjunot`, read-only  
**Schema dump:** `schooled_staging_schema_20260918T035359Z.sql`

> The migration folder does **not** describe the live schema. Phase 5 must use this report + the schema dump
> as the baseline. Never rebuild from `supabase/migrations/`.

## 1. Totals

| Object | Count |
| --- | ---: |
| Public tables | 75 |
| RLS enabled | 75 / 75 |
| RLS forced | 0 |
| **RLS enabled but NO policies (deny-all to tenants)** | **38** |
| Tables with at least one policy | 37 |
| RLS policies | 145 |
| Foreign keys | 212 |
| Indexes | 199 |
| Functions | 9 |
| Triggers | 15 |
| Tables with `school_id` | 64 |
| Tables without `school_id` | 11 |

**RLS is enabled on every public table, but that is not the same as protecting them.** 38 of the 75 tables have RLS enabled with **zero policies**, which denies all access to `anon`/`authenticated` and leaves them service-role-only. The 145 policies are concentrated on the other 37 tables. Academically critical tables in the policy-less set include `student_scores`, `term_results`, `term_result_components`, `result_edit_logs`, `report_card_submissions`, `attendance_records`, `psychomotor_scores`, `affective_scores`, `teacher_comments` and `school_admin_comments`.

Verified 2026-09-18 by `npm run test:rls` (see `scripts/rls-isolation-test.cjs`).

Separately, RLS is bypassed entirely by the service-role client used by 100/107 API routes, so today it constrains nothing in production traffic.

## 2. Phantom tables — verified against LIVE

| Table referenced in code | Exists on staging? | Consequence |
| --- | :---: | --- |
| `report_card_settings` | **MISSING** | 3 routes query it — latent runtime error |
| `assessment_scores` | **MISSING** | teacher `ai-import` WRITE target — AI import is broken on staging |
| `rate_limits` | **MISSING** | login throttling silently falls back to per-instance memory |
| `subject_class_assignments` | **MISSING** | copilot rollback path broken |
| `users` | **MISSING** | `api-auth` GoTrue super-admin branch is dead code |

## 3. Tables

| Table | Est. rows | Cols | RLS | Policies | Indexes | FKs | school_id |
| --- | ---: | ---: | :---: | ---: | ---: | ---: | :---: |
| `academic_levels` | 0 | 5 | yes | 0 | 2 | 1 | yes |
| `academic_sections` | 0 | 9 | yes | 4 | 1 | 3 | yes |
| `academic_sessions` | 0 | 8 | yes | 4 | 2 | 1 | yes |
| `academic_terms` | 0 | 9 | yes | 4 | 2 | 2 | yes |
| `affective_rows` | 0 | 4 | yes | 0 | 1 | 1 | — |
| `affective_scores` | 0 | 6 | yes | 0 | 2 | 4 | yes |
| `affective_templates` | 0 | 5 | yes | 0 | 1 | 1 | yes |
| `ai_import_details` | 0 | 12 | yes | 0 | 1 | 3 | — |
| `ai_import_logs` | 0 | 15 | yes | 0 | 1 | 5 | yes |
| `assessments` | 0 | 10 | yes | 5 | 2 | 2 | yes |
| `attendance` | 0 | 8 | yes | 4 | 4 | 3 | yes |
| `attendance_records` | 0 | 7 | yes | 0 | 2 | 3 | yes |
| `bill_recalc_runs` | 3 | 11 | yes | 4 | 2 | 2 | yes |
| `class_affective_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `class_components_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `class_fees` | 10 | 7 | yes | 4 | 5 | 3 | yes |
| `class_grading_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `class_psychomotor_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `class_subjects` | 0 | 7 | yes | 4 | 5 | 3 | yes |
| `class_teachers` | 0 | 8 | yes | 0 | 5 | 3 | yes |
| `classes` | 0 | 10 | yes | 4 | 2 | 4 | yes |
| `components_rows` | 0 | 5 | yes | 0 | 1 | 1 | — |
| `components_templates` | 0 | 5 | yes | 0 | 1 | 1 | yes |
| `copilot_audit_log` | 0 | 8 | yes | 0 | 2 | 2 | yes |
| `copilot_conversations` | 0 | 8 | yes | 0 | 2 | 1 | yes |
| `copilot_messages` | 0 | 8 | yes | 0 | 2 | 1 | — |
| `copilot_operation_steps` | 0 | 15 | yes | 0 | 2 | 1 | — |
| `copilot_operations` | 0 | 12 | yes | 0 | 2 | 3 | yes |
| `credit_applications` | 0 | 9 | yes | 4 | 3 | 5 | yes |
| `credits` | 0 | 15 | yes | 4 | 4 | 8 | yes |
| `enrollments` | 0 | 8 | yes | 4 | 4 | 4 | yes |
| `fee_allocations` | 5 | 7 | yes | 4 | 4 | 3 | yes |
| `fee_change_events` | 5 | 10 | yes | 4 | 5 | 3 | yes |
| `fee_heads` | 4 | 9 | yes | 4 | 2 | 1 | yes |
| `finance_setup_progress` | 0 | 5 | yes | 4 | 1 | 1 | yes |
| `financial_adjustments` | 20 | 14 | yes | 4 | 4 | 7 | yes |
| `grading_rows` | 0 | 7 | yes | 0 | 1 | 1 | — |
| `grading_templates` | 0 | 5 | yes | 0 | 1 | 1 | yes |
| `level_affective_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `level_components_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `level_grading_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `level_psychomotor_templates` | 0 | 4 | yes | 0 | 2 | 3 | yes |
| `password_history` | 0 | 6 | yes | 0 | 2 | 1 | — |
| `payment_plan_installments` | 0 | 10 | yes | 4 | 3 | 3 | yes |
| `payment_plans` | 0 | 10 | yes | 4 | 2 | 4 | yes |
| `payments` | 3 | 19 | yes | 4 | 6 | 4 | yes |
| `profiles` | 1 | 14 | yes | 4 | 4 | 2 | yes |
| `psychomotor_rows` | 0 | 4 | yes | 0 | 1 | 1 | — |
| `psychomotor_scores` | 0 | 6 | yes | 0 | 2 | 4 | yes |
| `psychomotor_templates` | 0 | 5 | yes | 0 | 1 | 1 | yes |
| `receipts` | 3 | 10 | yes | 4 | 3 | 2 | yes |
| `report_card_submissions` | 0 | 17 | yes | 0 | 2 | 7 | yes |
| `result_edit_logs` | 0 | 10 | yes | 0 | 1 | 4 | — |
| `school_admin_comments` | 0 | 6 | yes | 0 | 2 | 3 | yes |
| `school_admins` | 0 | 11 | yes | 3 | 5 | 2 | yes |
| `school_bank_accounts` | 1 | 9 | yes | 4 | 2 | 1 | yes |
| `school_features` | 0 | 6 | yes | 0 | 2 | 2 | yes |
| `schools` | 0 | 19 | yes | 4 | 2 | 0 | — |
| `student_bill_lines` | 18 | 11 | yes | 4 | 2 | 5 | yes |
| `student_bills` | 6 | 12 | yes | 4 | 5 | 5 | yes |
| `student_fee_adjustments` | 3 | 7 | yes | 4 | 5 | 4 | yes |
| `student_grades` | 0 | 8 | yes | 4 | 4 | 3 | yes |
| `student_scores` | 0 | 10 | yes | 0 | 4 | 6 | yes |
| `student_waivers` | 0 | 10 | yes | 4 | 3 | 4 | yes |
| `students` | 0 | 30 | yes | 4 | 7 | 3 | yes |
| `subjects` | 0 | 8 | yes | 4 | 1 | 1 | yes |
| `subscriptions` | 0 | 10 | yes | 3 | 2 | 1 | yes |
| `super_admins` | 0 | 6 | yes | 0 | 2 | 1 | — |
| `support_logs` | 26 | 7 | yes | 2 | 3 | 2 | yes |
| `teacher_comments` | 0 | 5 | yes | 0 | 2 | 3 | yes |
| `teacher_subjects` | 0 | 10 | yes | 4 | 3 | 5 | yes |
| `teachers` | 0 | 19 | yes | 4 | 5 | 2 | yes |
| `term_fees` | 8 | 10 | yes | 4 | 5 | 4 | yes |
| `term_result_components` | 0 | 12 | yes | 0 | 5 | 4 | yes |
| `term_results` | 0 | 13 | yes | 0 | 4 | 6 | yes |

## 4. RLS policies (147)

| Table | Policy | Cmd | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| `academic_sections` | tenant_delete_academic_sections | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `academic_sections` | tenant_insert_academic_sections | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `academic_sections` | tenant_select_academic_sections | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `academic_sections` | tenant_update_academic_sections | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `academic_sessions` | tenant_delete_academic_sessions | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `academic_sessions` | tenant_insert_academic_sessions | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `academic_sessions` | tenant_select_academic_sessions | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `academic_sessions` | tenant_update_academic_sessions | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `academic_terms` | tenant_delete_academic_terms | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `academic_terms` | tenant_insert_academic_terms | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `academic_terms` | tenant_select_academic_terms | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `academic_terms` | tenant_update_academic_terms | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `assessments` | teacher_assessments | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) AND (is_supe` | `` |
| `   FROM teacher_subjects` |  |  |  | `` | `` |
| `  WHERE (teacher_subjects.teacher_id = ((auth.jwt() ->> 'teacher_id'::text))::uuid))))))` | - |  |  | `` | `` |
| `assessments` | tenant_delete_assessments | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `assessments` | tenant_insert_assessments | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `assessments` | tenant_select_assessments | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `assessments` | tenant_update_assessments | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `attendance` | tenant_delete_attendance | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `attendance` | tenant_insert_attendance | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `attendance` | tenant_select_attendance | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `attendance` | tenant_update_attendance | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `bill_recalc_runs` | tenant_delete_bill_recalc_runs | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `bill_recalc_runs` | tenant_insert_bill_recalc_runs | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `bill_recalc_runs` | tenant_select_bill_recalc_runs | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `bill_recalc_runs` | tenant_update_bill_recalc_runs | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `class_fees` | tenant_delete_class_fees | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `class_fees` | tenant_insert_class_fees | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `class_fees` | tenant_select_class_fees | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `class_fees` | tenant_update_class_fees | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `class_subjects` | tenant_delete_class_subjects | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `class_subjects` | tenant_insert_class_subjects | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `class_subjects` | tenant_select_class_subjects | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `class_subjects` | tenant_update_class_subjects | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `classes` | tenant_delete_classes | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `classes` | tenant_insert_classes | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `classes` | tenant_select_classes | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `classes` | tenant_update_classes | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `credit_applications` | tenant_delete_credit_applications | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `credit_applications` | tenant_insert_credit_applications | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `credit_applications` | tenant_select_credit_applications | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `credit_applications` | tenant_update_credit_applications | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `credits` | tenant_delete_credits | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `credits` | tenant_insert_credits | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `credits` | tenant_select_credits | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `credits` | tenant_update_credits | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `enrollments` | tenant_delete_enrollments | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `enrollments` | tenant_insert_enrollments | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `enrollments` | tenant_select_enrollments | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `enrollments` | tenant_update_enrollments | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `fee_allocations` | tenant_delete_fee_allocations | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_allocations` | tenant_insert_fee_allocations | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `fee_allocations` | tenant_select_fee_allocations | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_allocations` | tenant_update_fee_allocations | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `fee_change_events` | tenant_delete_fee_change_events | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_change_events` | tenant_insert_fee_change_events | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `fee_change_events` | tenant_select_fee_change_events | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_change_events` | tenant_update_fee_change_events | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `fee_heads` | tenant_delete_fee_heads | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_heads` | tenant_insert_fee_heads | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `fee_heads` | tenant_select_fee_heads | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `fee_heads` | tenant_update_fee_heads | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `finance_setup_progress` | tenant_delete_finance_setup_progress | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `finance_setup_progress` | tenant_insert_finance_setup_progress | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `finance_setup_progress` | tenant_select_finance_setup_progress | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `finance_setup_progress` | tenant_update_finance_setup_progress | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `financial_adjustments` | tenant_delete_financial_adjustments | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `financial_adjustments` | tenant_insert_financial_adjustments | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `financial_adjustments` | tenant_select_financial_adjustments | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `financial_adjustments` | tenant_update_financial_adjustments | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payment_plan_installments` | tenant_delete_payment_plan_installments | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payment_plan_installments` | tenant_insert_payment_plan_installments | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payment_plan_installments` | tenant_select_payment_plan_installments | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payment_plan_installments` | tenant_update_payment_plan_installments | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payment_plans` | tenant_delete_payment_plans | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payment_plans` | tenant_insert_payment_plans | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payment_plans` | tenant_select_payment_plans | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payment_plans` | tenant_update_payment_plans | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payments` | tenant_delete_payments | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payments` | tenant_insert_payments | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `payments` | tenant_select_payments | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `payments` | tenant_update_payments | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `profiles` | tenant_delete_profiles | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `profiles` | tenant_insert_profiles | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `profiles` | tenant_select_profiles | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `profiles` | tenant_update_profiles | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `receipts` | tenant_delete_receipts | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `receipts` | tenant_insert_receipts | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `receipts` | tenant_select_receipts | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `receipts` | tenant_update_receipts | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `school_admins` | school_admins_insert | INSERT | public | `-` | `is_super_admin()` |
| `school_admins` | school_admins_select | SELECT | public | `(is_super_admin() OR (school_id = ((auth.jwt() ->> 'school_id'::text))` | `-` |
| `school_admins` | school_admins_update | UPDATE | public | `is_super_admin()` | `is_super_admin()` |
| `school_bank_accounts` | tenant_delete_school_bank_accounts | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `school_bank_accounts` | tenant_insert_school_bank_accounts | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `school_bank_accounts` | tenant_select_school_bank_accounts | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `school_bank_accounts` | tenant_update_school_bank_accounts | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `schools` | schools_delete | DELETE | public | `is_super_admin()` | `-` |
| `schools` | schools_insert | INSERT | public | `-` | `is_super_admin()` |
| `schools` | schools_select | SELECT | public | `true` | `-` |
| `schools` | schools_update | UPDATE | public | `is_super_admin()` | `is_super_admin()` |
| `student_bill_lines` | tenant_delete_student_bill_lines | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_bill_lines` | tenant_insert_student_bill_lines | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_bill_lines` | tenant_select_student_bill_lines | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_bill_lines` | tenant_update_student_bill_lines | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_bills` | tenant_delete_student_bills | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_bills` | tenant_insert_student_bills | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_bills` | tenant_select_student_bills | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_bills` | tenant_update_student_bills | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_fee_adjustments` | tenant_delete_student_fee_adjustments | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_fee_adjustments` | tenant_insert_student_fee_adjustments | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_fee_adjustments` | tenant_select_student_fee_adjustments | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_fee_adjustments` | tenant_update_student_fee_adjustments | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_grades` | tenant_delete_student_grades | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `student_grades` | tenant_insert_student_grades | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `student_grades` | tenant_select_student_grades | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `student_grades` | tenant_update_student_grades | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `student_waivers` | tenant_delete_student_waivers | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_waivers` | tenant_insert_student_waivers | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `student_waivers` | tenant_select_student_waivers | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `student_waivers` | tenant_update_student_waivers | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `students` | tenant_delete_students | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `students` | tenant_insert_students | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `students` | tenant_select_students | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `students` | tenant_update_students | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `subjects` | tenant_delete_subjects | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `subjects` | tenant_insert_subjects | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `subjects` | tenant_select_subjects | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `subjects` | tenant_update_subjects | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `subscriptions` | subscriptions_insert | INSERT | public | `-` | `is_super_admin()` |
| `subscriptions` | subscriptions_select | SELECT | public | `(is_super_admin() OR (school_id = ((auth.jwt() ->> 'school_id'::text))` | `-` |
| `subscriptions` | subscriptions_update | UPDATE | public | `is_super_admin()` | `is_super_admin()` |
| `support_logs` | support_logs_insert | INSERT | public | `-` | `is_super_admin()` |
| `support_logs` | support_logs_select | SELECT | public | `is_super_admin()` | `-` |
| `teacher_subjects` | tenant_delete_teacher_subjects | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `teacher_subjects` | tenant_insert_teacher_subjects | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `teacher_subjects` | tenant_select_teacher_subjects | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `teacher_subjects` | tenant_update_teacher_subjects | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `teachers` | tenant_delete_teachers | DELETE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `teachers` | tenant_insert_teachers | INSERT | public | `-` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `teachers` | tenant_select_teachers | SELECT | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `-` |
| `teachers` | tenant_update_teachers | UPDATE | public | `((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_` | `((school_id = ((auth.jwt() ->> 'school_id'::t` |
| `term_fees` | tenant_delete_term_fees | DELETE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `term_fees` | tenant_insert_term_fees | INSERT | public | `-` | `((school_id)::text = (auth.jwt() ->> 'school_` |
| `term_fees` | tenant_select_term_fees | SELECT | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `-` |
| `term_fees` | tenant_update_term_fees | UPDATE | public | `((school_id)::text = (auth.jwt() ->> 'school_id'::text))` | `((school_id)::text = (auth.jwt() ->> 'school_` |

## 5. Foreign keys (212)

| Table | Constraint | Definition |
| --- | --- | --- |
| `academic_levels` | academic_levels_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `academic_sections` | academic_sections_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `academic_sections` | academic_sections_session_id_fkey | `FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE` |
| `academic_sections` | academic_sections_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `academic_sessions` | academic_sessions_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `academic_terms` | academic_terms_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `academic_terms` | academic_terms_session_id_fkey | `FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE CASCADE` |
| `affective_rows` | affective_rows_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES affective_templates(id) ON DELETE CASCADE` |
| `affective_scores` | affective_scores_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `affective_scores` | affective_scores_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `affective_scores` | affective_scores_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `affective_scores` | affective_scores_trait_id_fkey | `FOREIGN KEY (trait_id) REFERENCES affective_rows(id) ON DELETE CASCADE` |
| `affective_templates` | affective_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `ai_import_details` | ai_import_details_component_id_fkey | `FOREIGN KEY (component_id) REFERENCES components_rows(id)` |
| `ai_import_details` | ai_import_details_import_id_fkey | `FOREIGN KEY (import_id) REFERENCES ai_import_logs(id) ON DELETE CASCADE` |
| `ai_import_details` | ai_import_details_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id)` |
| `ai_import_logs` | ai_import_logs_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id)` |
| `ai_import_logs` | ai_import_logs_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `ai_import_logs` | ai_import_logs_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id)` |
| `ai_import_logs` | ai_import_logs_teacher_id_fkey | `FOREIGN KEY (teacher_id) REFERENCES profiles(id)` |
| `ai_import_logs` | ai_import_logs_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id)` |
| `assessments` | assessments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `assessments` | assessments_teacher_subject_id_fkey | `FOREIGN KEY (teacher_subject_id) REFERENCES teacher_subjects(id) ON DELETE CASCADE` |
| `attendance` | attendance_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `attendance` | attendance_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `attendance` | attendance_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `attendance_records` | attendance_records_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `attendance_records` | attendance_records_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `attendance_records` | attendance_records_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `bill_recalc_runs` | bill_recalc_runs_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `bill_recalc_runs` | bill_recalc_runs_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `class_affective_templates` | class_affective_templates_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_affective_templates` | class_affective_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_affective_templates` | class_affective_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES affective_templates(id) ON DELETE CASCADE` |
| `class_components_templates` | class_components_templates_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_components_templates` | class_components_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_components_templates` | class_components_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES components_templates(id) ON DELETE CASCADE` |
| `class_fees` | class_fees_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id)` |
| `class_fees` | class_fees_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `class_fees` | class_fees_term_fee_id_fkey | `FOREIGN KEY (term_fee_id) REFERENCES term_fees(id) ON DELETE CASCADE` |
| `class_grading_templates` | class_grading_templates_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_grading_templates` | class_grading_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_grading_templates` | class_grading_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES grading_templates(id) ON DELETE CASCADE` |
| `class_psychomotor_templates` | class_psychomotor_templates_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_psychomotor_templates` | class_psychomotor_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_psychomotor_templates` | class_psychomotor_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES psychomotor_templates(id) ON DELETE CASCADE` |
| `class_subjects` | class_subjects_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_subjects` | class_subjects_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_subjects` | class_subjects_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE` |
| `class_teachers` | class_teachers_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `class_teachers` | class_teachers_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `class_teachers` | class_teachers_teacher_id_fkey | `FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE` |
| `classes` | classes_academic_level_id_fkey | `FOREIGN KEY (academic_level_id) REFERENCES academic_levels(id) ON DELETE SET NULL` |
| `classes` | classes_academic_session_id_fkey | `FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL` |
| `classes` | classes_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `classes` | classes_section_id_fkey | `FOREIGN KEY (section_id) REFERENCES academic_sections(id) ON DELETE SET NULL` |
| `components_rows` | components_rows_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES components_templates(id) ON DELETE CASCADE` |
| `components_templates` | components_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `copilot_audit_log` | copilot_audit_log_operation_id_fkey | `FOREIGN KEY (operation_id) REFERENCES copilot_operations(id)` |
| `copilot_audit_log` | copilot_audit_log_step_id_fkey | `FOREIGN KEY (step_id) REFERENCES copilot_operation_steps(id)` |
| `copilot_conversations` | copilot_conversations_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `copilot_messages` | copilot_messages_conversation_id_fkey | `FOREIGN KEY (conversation_id) REFERENCES copilot_conversations(id) ON DELETE CASCADE` |
| `copilot_operation_steps` | copilot_operation_steps_operation_id_fkey | `FOREIGN KEY (operation_id) REFERENCES copilot_operations(id) ON DELETE CASCADE` |
| `copilot_operations` | copilot_operations_conversation_id_fkey | `FOREIGN KEY (conversation_id) REFERENCES copilot_conversations(id) ON DELETE CASCADE` |
| `copilot_operations` | copilot_operations_message_id_fkey | `FOREIGN KEY (message_id) REFERENCES copilot_messages(id)` |
| `copilot_operations` | copilot_operations_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `credit_applications` | credit_applications_bill_id_fkey | `FOREIGN KEY (bill_id) REFERENCES student_bills(id) ON DELETE CASCADE` |
| `credit_applications` | credit_applications_credit_id_fkey | `FOREIGN KEY (credit_id) REFERENCES credits(id) ON DELETE CASCADE` |
| `credit_applications` | credit_applications_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `credit_applications` | credit_applications_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `credit_applications` | credit_applications_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `credits` | credits_recalc_run_id_fkey | `FOREIGN KEY (recalc_run_id) REFERENCES bill_recalc_runs(id) ON DELETE SET NULL` |
| `credits` | credits_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `credits` | credits_source_allocation_id_fkey | `FOREIGN KEY (source_allocation_id) REFERENCES fee_allocations(id) ON DELETE SET NULL` |
| `credits` | credits_source_bill_id_fkey | `FOREIGN KEY (source_bill_id) REFERENCES student_bills(id) ON DELETE SET NULL` |
| `credits` | credits_source_fee_head_id_fkey | `FOREIGN KEY (source_fee_head_id) REFERENCES fee_heads(id) ON DELETE SET NULL` |
| `credits` | credits_source_payment_id_fkey | `FOREIGN KEY (source_payment_id) REFERENCES payments(id) ON DELETE SET NULL` |
| `credits` | credits_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `credits` | credits_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `enrollments` | enrollments_academic_term_id_fkey | `FOREIGN KEY (academic_term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `enrollments` | enrollments_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `enrollments` | enrollments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `enrollments` | enrollments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `fee_allocations` | fee_allocations_bill_line_id_fkey | `FOREIGN KEY (bill_line_id) REFERENCES student_bill_lines(id) ON DELETE CASCADE` |
| `fee_allocations` | fee_allocations_payment_id_fkey | `FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE` |
| `fee_allocations` | fee_allocations_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `fee_change_events` | fee_change_events_fee_head_id_fkey | `FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id)` |
| `fee_change_events` | fee_change_events_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `fee_change_events` | fee_change_events_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `fee_heads` | fee_heads_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `finance_setup_progress` | finance_setup_progress_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `financial_adjustments` | financial_adjustments_bill_id_fkey | `FOREIGN KEY (bill_id) REFERENCES student_bills(id) ON DELETE CASCADE` |
| `financial_adjustments` | financial_adjustments_bill_line_id_fkey | `FOREIGN KEY (bill_line_id) REFERENCES student_bill_lines(id) ON DELETE SET NULL` |
| `financial_adjustments` | financial_adjustments_fee_head_id_fkey | `FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id) ON DELETE SET NULL` |
| `financial_adjustments` | financial_adjustments_recalc_run_id_fkey | `FOREIGN KEY (recalc_run_id) REFERENCES bill_recalc_runs(id) ON DELETE SET NULL` |
| `financial_adjustments` | financial_adjustments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `financial_adjustments` | financial_adjustments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `financial_adjustments` | financial_adjustments_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `grading_rows` | grading_rows_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES grading_templates(id) ON DELETE CASCADE` |
| `grading_templates` | grading_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `level_affective_templates` | level_affective_templates_level_id_fkey | `FOREIGN KEY (level_id) REFERENCES academic_levels(id) ON DELETE CASCADE` |
| `level_affective_templates` | level_affective_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `level_affective_templates` | level_affective_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES affective_templates(id) ON DELETE CASCADE` |
| `level_components_templates` | level_components_templates_level_id_fkey | `FOREIGN KEY (level_id) REFERENCES academic_levels(id) ON DELETE CASCADE` |
| `level_components_templates` | level_components_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `level_components_templates` | level_components_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES components_templates(id) ON DELETE CASCADE` |
| `level_grading_templates` | level_grading_templates_level_id_fkey | `FOREIGN KEY (level_id) REFERENCES academic_levels(id) ON DELETE CASCADE` |
| `level_grading_templates` | level_grading_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `level_grading_templates` | level_grading_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES grading_templates(id) ON DELETE CASCADE` |
| `level_psychomotor_templates` | level_psychomotor_templates_level_id_fkey | `FOREIGN KEY (level_id) REFERENCES academic_levels(id) ON DELETE CASCADE` |
| `level_psychomotor_templates` | level_psychomotor_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `level_psychomotor_templates` | level_psychomotor_templates_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES psychomotor_templates(id) ON DELETE CASCADE` |
| `password_history` | password_history_used_by_fkey | `FOREIGN KEY (used_by) REFERENCES profiles(id)` |
| `payment_plan_installments` | payment_plan_installments_payment_id_fkey | `FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL` |
| `payment_plan_installments` | payment_plan_installments_plan_id_fkey | `FOREIGN KEY (plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE` |
| `payment_plan_installments` | payment_plan_installments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `payment_plans` | payment_plans_bill_id_fkey | `FOREIGN KEY (bill_id) REFERENCES student_bills(id) ON DELETE SET NULL` |
| `payment_plans` | payment_plans_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `payment_plans` | payment_plans_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id)` |
| `payment_plans` | payment_plans_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `payments` | payments_school_account_id_fkey | `FOREIGN KEY (school_account_id) REFERENCES school_bank_accounts(id) ON DELETE SET NULL` |
| `payments` | payments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `payments` | payments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id)` |
| `payments` | payments_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `profiles` | profiles_id_fkey | `FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE` |
| `profiles` | profiles_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `psychomotor_rows` | psychomotor_rows_template_id_fkey | `FOREIGN KEY (template_id) REFERENCES psychomotor_templates(id) ON DELETE CASCADE` |
| `psychomotor_scores` | psychomotor_scores_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `psychomotor_scores` | psychomotor_scores_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `psychomotor_scores` | psychomotor_scores_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `psychomotor_scores` | psychomotor_scores_trait_id_fkey | `FOREIGN KEY (trait_id) REFERENCES psychomotor_rows(id) ON DELETE CASCADE` |
| `psychomotor_templates` | psychomotor_templates_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `receipts` | receipts_payment_id_fkey | `FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE` |
| `receipts` | receipts_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `report_card_submissions` | report_card_submissions_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `report_card_submissions` | report_card_submissions_published_by_fkey | `FOREIGN KEY (published_by) REFERENCES profiles(id)` |
| `report_card_submissions` | report_card_submissions_retracted_by_fkey | `FOREIGN KEY (retracted_by) REFERENCES profiles(id)` |
| `report_card_submissions` | report_card_submissions_reviewed_by_fkey | `FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL` |
| `report_card_submissions` | report_card_submissions_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `report_card_submissions` | report_card_submissions_submitted_by_fkey | `FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE SET NULL` |
| `report_card_submissions` | report_card_submissions_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `result_edit_logs` | result_edit_logs_edited_by_fkey | `FOREIGN KEY (edited_by) REFERENCES profiles(id)` |
| `result_edit_logs` | result_edit_logs_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `result_edit_logs` | result_edit_logs_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE` |
| `result_edit_logs` | result_edit_logs_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `school_admin_comments` | school_admin_comments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `school_admin_comments` | school_admin_comments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `school_admin_comments` | school_admin_comments_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `school_admins` | school_admins_profile_id_fkey | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` |
| `school_admins` | school_admins_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `school_bank_accounts` | school_bank_accounts_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `school_features` | school_features_enabled_by_fkey | `FOREIGN KEY (enabled_by) REFERENCES profiles(id)` |
| `school_features` | school_features_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `student_bill_lines` | student_bill_lines_bill_id_fkey | `FOREIGN KEY (bill_id) REFERENCES student_bills(id) ON DELETE CASCADE` |
| `student_bill_lines` | student_bill_lines_class_fee_id_fkey | `FOREIGN KEY (class_fee_id) REFERENCES class_fees(id) ON DELETE SET NULL` |
| `student_bill_lines` | student_bill_lines_fee_head_id_fkey | `FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id)` |
| `student_bill_lines` | student_bill_lines_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `student_bill_lines` | student_bill_lines_term_fee_id_fkey | `FOREIGN KEY (term_fee_id) REFERENCES term_fees(id) ON DELETE SET NULL` |
| `student_bills` | student_bills_academic_section_id_fkey | `FOREIGN KEY (academic_section_id) REFERENCES academic_sections(id) ON DELETE SET NULL` |
| `student_bills` | student_bills_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL` |
| `student_bills` | student_bills_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `student_bills` | student_bills_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id)` |
| `student_bills` | student_bills_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id)` |
| `student_fee_adjustments` | student_fee_adjustments_class_fee_id_fkey | `FOREIGN KEY (class_fee_id) REFERENCES class_fees(id) ON DELETE CASCADE` |
| `student_fee_adjustments` | student_fee_adjustments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `student_fee_adjustments` | student_fee_adjustments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `student_fee_adjustments` | student_fee_adjustments_term_fee_id_fkey | `FOREIGN KEY (term_fee_id) REFERENCES term_fees(id) ON DELETE CASCADE` |
| `student_grades` | student_grades_assessment_id_fkey | `FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE` |
| `student_grades` | student_grades_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `student_grades` | student_grades_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `student_scores` | student_scores_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL` |
| `student_scores` | student_scores_component_id_fkey | `FOREIGN KEY (component_id) REFERENCES components_rows(id) ON DELETE CASCADE` |
| `student_scores` | student_scores_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `student_scores` | student_scores_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `student_scores` | student_scores_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL` |
| `student_scores` | student_scores_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `student_waivers` | student_waivers_fee_head_id_fkey | `FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id) ON DELETE SET NULL` |
| `student_waivers` | student_waivers_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `student_waivers` | student_waivers_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `student_waivers` | student_waivers_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `students` | students_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL` |
| `students` | students_profile_id_fkey | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` |
| `students` | students_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `subjects` | subjects_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `subscriptions` | subscriptions_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `super_admins` | super_admins_profile_id_fkey | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` |
| `support_logs` | support_logs_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `support_logs` | support_logs_super_admin_id_fkey | `FOREIGN KEY (super_admin_id) REFERENCES profiles(id) ON DELETE CASCADE` |
| `teacher_comments` | teacher_comments_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `teacher_comments` | teacher_comments_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `teacher_comments` | teacher_comments_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `teacher_subjects` | teacher_subjects_academic_term_id_fkey | `FOREIGN KEY (academic_term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `teacher_subjects` | teacher_subjects_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE` |
| `teacher_subjects` | teacher_subjects_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `teacher_subjects` | teacher_subjects_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE` |
| `teacher_subjects` | teacher_subjects_teacher_id_fkey | `FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE` |
| `teachers` | teachers_profile_id_fkey | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` |
| `teachers` | teachers_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `term_fees` | term_fees_academic_section_id_fkey | `FOREIGN KEY (academic_section_id) REFERENCES academic_sections(id) ON DELETE SET NULL` |
| `term_fees` | term_fees_fee_head_id_fkey | `FOREIGN KEY (fee_head_id) REFERENCES fee_heads(id)` |
| `term_fees` | term_fees_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id)` |
| `term_fees` | term_fees_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE SET NULL` |
| `term_result_components` | term_result_components_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `term_result_components` | term_result_components_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `term_result_components` | term_result_components_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE` |
| `term_result_components` | term_result_components_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |
| `term_results` | term_results_class_id_fkey | `FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL` |
| `term_results` | term_results_published_by_fkey | `FOREIGN KEY (published_by) REFERENCES profiles(id)` |
| `term_results` | term_results_school_id_fkey | `FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE` |
| `term_results` | term_results_student_id_fkey | `FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE` |
| `term_results` | term_results_subject_id_fkey | `FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE` |
| `term_results` | term_results_term_id_fkey | `FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE` |

## 6. Functions (9)

- `cleanup_subject_assignments_on_teacher_removal()` **SECURITY DEFINER**
- `custom_jwt_claims()` **SECURITY DEFINER**
- `get_jwt_role()` 
- `get_jwt_school_id()` 
- `handle_new_user()` **SECURITY DEFINER**
- `is_super_admin()` 
- `rls_auto_enable()` **SECURITY DEFINER**
- `tenant_policy()` 
- `update_updated_at_column()` 

## 7. Triggers (15)

- `academic_sessions` — update_academic_sessions_updated_at (BEFORE UPDATE)
- `academic_terms` — update_academic_terms_updated_at (BEFORE UPDATE)
- `assessments` — update_assessments_updated_at (BEFORE UPDATE)
- `class_subjects` — update_class_subjects_updated_at (BEFORE UPDATE)
- `class_teachers` — trg_cleanup_subjects_on_class_teacher_delete (AFTER DELETE)
- `class_teachers` — update_class_teachers_updated_at (BEFORE UPDATE)
- `classes` — update_classes_updated_at (BEFORE UPDATE)
- `profiles` — update_profiles_updated_at (BEFORE UPDATE)
- `school_admins` — update_school_admins_updated_at (BEFORE UPDATE)
- `schools` — update_schools_updated_at (BEFORE UPDATE)
- `student_grades` — update_student_grades_updated_at (BEFORE UPDATE)
- `students` — update_students_updated_at (BEFORE UPDATE)
- `subjects` — update_subjects_updated_at (BEFORE UPDATE)
- `subscriptions` — update_subscriptions_updated_at (BEFORE UPDATE)
- `teachers` — update_teachers_updated_at (BEFORE UPDATE)

## 8. Indexes (199)

- `academic_levels` · `academic_levels_pkey` · `CREATE UNIQUE INDEX academic_levels_pkey ON public.academic_levels USING btree (id)`
- `academic_levels` · `academic_levels_school_id_name_key` · `CREATE UNIQUE INDEX academic_levels_school_id_name_key ON public.academic_levels USING btree (school_id, name)`
- `academic_sections` · `academic_sections_pkey` · `CREATE UNIQUE INDEX academic_sections_pkey ON public.academic_sections USING btree (id)`
- `academic_sessions` · `academic_sessions_pkey` · `CREATE UNIQUE INDEX academic_sessions_pkey ON public.academic_sessions USING btree (id)`
- `academic_sessions` · `idx_unique_active_session_per_school` · `CREATE UNIQUE INDEX idx_unique_active_session_per_school ON public.academic_sessions USING btree (school_id) W`
- `academic_terms` · `academic_terms_pkey` · `CREATE UNIQUE INDEX academic_terms_pkey ON public.academic_terms USING btree (id)`
- `academic_terms` · `idx_unique_active_term_per_school` · `CREATE UNIQUE INDEX idx_unique_active_term_per_school ON public.academic_terms USING btree (school_id) WHERE (`
- `affective_rows` · `affective_rows_pkey` · `CREATE UNIQUE INDEX affective_rows_pkey ON public.affective_rows USING btree (id)`
- `affective_scores` · `affective_scores_pkey` · `CREATE UNIQUE INDEX affective_scores_pkey ON public.affective_scores USING btree (id)`
- `affective_scores` · `affective_scores_student_id_trait_id_term_id_key` · `CREATE UNIQUE INDEX affective_scores_student_id_trait_id_term_id_key ON public.affective_scores USING btree (s`
- `affective_templates` · `affective_templates_pkey` · `CREATE UNIQUE INDEX affective_templates_pkey ON public.affective_templates USING btree (id)`
- `ai_import_details` · `ai_import_details_pkey` · `CREATE UNIQUE INDEX ai_import_details_pkey ON public.ai_import_details USING btree (id)`
- `ai_import_logs` · `ai_import_logs_pkey` · `CREATE UNIQUE INDEX ai_import_logs_pkey ON public.ai_import_logs USING btree (id)`
- `assessments` · `assessments_pkey` · `CREATE UNIQUE INDEX assessments_pkey ON public.assessments USING btree (id)`
- `assessments` · `idx_assessments_teacher_subject` · `CREATE INDEX idx_assessments_teacher_subject ON public.assessments USING btree (teacher_subject_id)`
- `attendance` · `attendance_pkey` · `CREATE UNIQUE INDEX attendance_pkey ON public.attendance USING btree (id)`
- `attendance` · `attendance_student_id_class_id_date_key` · `CREATE UNIQUE INDEX attendance_student_id_class_id_date_key ON public.attendance USING btree (student_id, clas`
- `attendance` · `idx_attendance_date` · `CREATE INDEX idx_attendance_date ON public.attendance USING btree (date)`
- `attendance` · `idx_attendance_student` · `CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id)`
- `attendance_records` · `attendance_records_pkey` · `CREATE UNIQUE INDEX attendance_records_pkey ON public.attendance_records USING btree (id)`
- `attendance_records` · `attendance_records_student_id_term_id_key` · `CREATE UNIQUE INDEX attendance_records_student_id_term_id_key ON public.attendance_records USING btree (studen`
- `bill_recalc_runs` · `bill_recalc_runs_pkey` · `CREATE UNIQUE INDEX bill_recalc_runs_pkey ON public.bill_recalc_runs USING btree (id)`
- `bill_recalc_runs` · `idx_recalc_runs_school_term` · `CREATE INDEX idx_recalc_runs_school_term ON public.bill_recalc_runs USING btree (school_id, term_id)`
- `class_affective_templates` · `class_affective_templates_class_id_key` · `CREATE UNIQUE INDEX class_affective_templates_class_id_key ON public.class_affective_templates USING btree (cl`
- `class_affective_templates` · `class_affective_templates_pkey` · `CREATE UNIQUE INDEX class_affective_templates_pkey ON public.class_affective_templates USING btree (id)`
- `class_components_templates` · `class_components_templates_class_id_key` · `CREATE UNIQUE INDEX class_components_templates_class_id_key ON public.class_components_templates USING btree (`
- `class_components_templates` · `class_components_templates_pkey` · `CREATE UNIQUE INDEX class_components_templates_pkey ON public.class_components_templates USING btree (id)`
- `class_fees` · `class_fees_pkey` · `CREATE UNIQUE INDEX class_fees_pkey ON public.class_fees USING btree (id)`
- `class_fees` · `class_fees_term_fee_id_class_id_key` · `CREATE UNIQUE INDEX class_fees_term_fee_id_class_id_key ON public.class_fees USING btree (term_fee_id, class_i`
- `class_fees` · `idx_class_fees_class` · `CREATE INDEX idx_class_fees_class ON public.class_fees USING btree (class_id)`
- `class_fees` · `idx_class_fees_school` · `CREATE INDEX idx_class_fees_school ON public.class_fees USING btree (school_id)`
- `class_fees` · `idx_class_fees_term_fee` · `CREATE INDEX idx_class_fees_term_fee ON public.class_fees USING btree (term_fee_id)`
- `class_grading_templates` · `class_grading_templates_class_id_key` · `CREATE UNIQUE INDEX class_grading_templates_class_id_key ON public.class_grading_templates USING btree (class_`
- `class_grading_templates` · `class_grading_templates_pkey` · `CREATE UNIQUE INDEX class_grading_templates_pkey ON public.class_grading_templates USING btree (id)`
- `class_psychomotor_templates` · `class_psychomotor_templates_class_id_key` · `CREATE UNIQUE INDEX class_psychomotor_templates_class_id_key ON public.class_psychomotor_templates USING btree`
- `class_psychomotor_templates` · `class_psychomotor_templates_pkey` · `CREATE UNIQUE INDEX class_psychomotor_templates_pkey ON public.class_psychomotor_templates USING btree (id)`
- `class_subjects` · `class_subjects_pkey` · `CREATE UNIQUE INDEX class_subjects_pkey ON public.class_subjects USING btree (id)`
- `class_subjects` · `class_subjects_school_id_class_id_subject_id_key` · `CREATE UNIQUE INDEX class_subjects_school_id_class_id_subject_id_key ON public.class_subjects USING btree (sch`
- `class_subjects` · `idx_class_subjects_class` · `CREATE INDEX idx_class_subjects_class ON public.class_subjects USING btree (class_id)`
- `class_subjects` · `idx_class_subjects_school` · `CREATE INDEX idx_class_subjects_school ON public.class_subjects USING btree (school_id)`
- `class_subjects` · `idx_class_subjects_subject` · `CREATE INDEX idx_class_subjects_subject ON public.class_subjects USING btree (subject_id)`
- `class_teachers` · `class_teachers_pkey` · `CREATE UNIQUE INDEX class_teachers_pkey ON public.class_teachers USING btree (id)`
- `class_teachers` · `class_teachers_school_id_class_id_teacher_id_key` · `CREATE UNIQUE INDEX class_teachers_school_id_class_id_teacher_id_key ON public.class_teachers USING btree (sch`
- `class_teachers` · `idx_class_teachers_class` · `CREATE INDEX idx_class_teachers_class ON public.class_teachers USING btree (class_id)`
- `class_teachers` · `idx_class_teachers_school` · `CREATE INDEX idx_class_teachers_school ON public.class_teachers USING btree (school_id)`
- `class_teachers` · `idx_class_teachers_teacher` · `CREATE INDEX idx_class_teachers_teacher ON public.class_teachers USING btree (teacher_id)`
- `classes` · `classes_pkey` · `CREATE UNIQUE INDEX classes_pkey ON public.classes USING btree (id)`
- `classes` · `idx_classes_section` · `CREATE INDEX idx_classes_section ON public.classes USING btree (section_id)`
- `components_rows` · `components_rows_pkey` · `CREATE UNIQUE INDEX components_rows_pkey ON public.components_rows USING btree (id)`
- `components_templates` · `components_templates_pkey` · `CREATE UNIQUE INDEX components_templates_pkey ON public.components_templates USING btree (id)`
- `copilot_audit_log` · `copilot_audit_log_pkey` · `CREATE UNIQUE INDEX copilot_audit_log_pkey ON public.copilot_audit_log USING btree (id)`
- `copilot_audit_log` · `idx_copilot_audit_school` · `CREATE INDEX idx_copilot_audit_school ON public.copilot_audit_log USING btree (school_id, created_at DESC)`
- `copilot_conversations` · `copilot_conversations_pkey` · `CREATE UNIQUE INDEX copilot_conversations_pkey ON public.copilot_conversations USING btree (id)`
- `copilot_conversations` · `idx_copilot_conversations_school` · `CREATE INDEX idx_copilot_conversations_school ON public.copilot_conversations USING btree (school_id, created_`
- `copilot_messages` · `copilot_messages_pkey` · `CREATE UNIQUE INDEX copilot_messages_pkey ON public.copilot_messages USING btree (id)`
- `copilot_messages` · `idx_copilot_messages_conv` · `CREATE INDEX idx_copilot_messages_conv ON public.copilot_messages USING btree (conversation_id, created_at)`
- `copilot_operation_steps` · `copilot_operation_steps_pkey` · `CREATE UNIQUE INDEX copilot_operation_steps_pkey ON public.copilot_operation_steps USING btree (id)`
- `copilot_operation_steps` · `idx_copilot_op_steps_op` · `CREATE INDEX idx_copilot_op_steps_op ON public.copilot_operation_steps USING btree (operation_id, step_order)`
- `copilot_operations` · `copilot_operations_pkey` · `CREATE UNIQUE INDEX copilot_operations_pkey ON public.copilot_operations USING btree (id)`
- `copilot_operations` · `idx_copilot_operations_school` · `CREATE INDEX idx_copilot_operations_school ON public.copilot_operations USING btree (school_id, created_at DES`
- `credit_applications` · `credit_applications_pkey` · `CREATE UNIQUE INDEX credit_applications_pkey ON public.credit_applications USING btree (id)`
- `credit_applications` · `idx_credit_app_school` · `CREATE INDEX idx_credit_app_school ON public.credit_applications USING btree (school_id, credit_id)`
- `credit_applications` · `idx_credit_app_student` · `CREATE INDEX idx_credit_app_student ON public.credit_applications USING btree (school_id, student_id, created_`
- `credits` · `credits_pkey` · `CREATE UNIQUE INDEX credits_pkey ON public.credits USING btree (id)`
- `credits` · `idx_credits_school` · `CREATE INDEX idx_credits_school ON public.credits USING btree (school_id)`
- `credits` · `idx_credits_student` · `CREATE INDEX idx_credits_student ON public.credits USING btree (student_id, status)`
- `credits` · `idx_credits_student_created` · `CREATE INDEX idx_credits_student_created ON public.credits USING btree (school_id, student_id, created_at)`
- `enrollments` · `enrollments_pkey` · `CREATE UNIQUE INDEX enrollments_pkey ON public.enrollments USING btree (id)`
- `enrollments` · `enrollments_student_id_class_id_academic_term_id_key` · `CREATE UNIQUE INDEX enrollments_student_id_class_id_academic_term_id_key ON public.enrollments USING btree (st`
- `enrollments` · `idx_enrollments_class` · `CREATE INDEX idx_enrollments_class ON public.enrollments USING btree (class_id)`
- `enrollments` · `idx_enrollments_student` · `CREATE INDEX idx_enrollments_student ON public.enrollments USING btree (student_id)`
- `fee_allocations` · `fee_allocations_payment_id_bill_line_id_key` · `CREATE UNIQUE INDEX fee_allocations_payment_id_bill_line_id_key ON public.fee_allocations USING btree (payment`
- `fee_allocations` · `fee_allocations_pkey` · `CREATE UNIQUE INDEX fee_allocations_pkey ON public.fee_allocations USING btree (id)`
- `fee_allocations` · `idx_fee_alloc_line` · `CREATE INDEX idx_fee_alloc_line ON public.fee_allocations USING btree (bill_line_id)`
- `fee_allocations` · `idx_fee_alloc_payment` · `CREATE INDEX idx_fee_alloc_payment ON public.fee_allocations USING btree (payment_id)`
- `fee_change_events` · `fee_change_events_pkey` · `CREATE UNIQUE INDEX fee_change_events_pkey ON public.fee_change_events USING btree (id)`
- `fee_change_events` · `idx_fee_change_events_head` · `CREATE INDEX idx_fee_change_events_head ON public.fee_change_events USING btree (fee_head_id)`
- `fee_change_events` · `idx_fee_change_events_school` · `CREATE INDEX idx_fee_change_events_school ON public.fee_change_events USING btree (school_id)`
- `fee_change_events` · `idx_fee_change_events_term` · `CREATE INDEX idx_fee_change_events_term ON public.fee_change_events USING btree (term_id)`
- `fee_change_events` · `idx_fee_events_created` · `CREATE INDEX idx_fee_events_created ON public.fee_change_events USING btree (school_id, created_at)`
- `fee_heads` · `fee_heads_pkey` · `CREATE UNIQUE INDEX fee_heads_pkey ON public.fee_heads USING btree (id)`
- `fee_heads` · `uq_fee_heads_school_name` · `CREATE UNIQUE INDEX uq_fee_heads_school_name ON public.fee_heads USING btree (school_id, name)`
- `finance_setup_progress` · `finance_setup_progress_pkey` · `CREATE UNIQUE INDEX finance_setup_progress_pkey ON public.finance_setup_progress USING btree (school_id)`
- `financial_adjustments` · `financial_adjustments_pkey` · `CREATE UNIQUE INDEX financial_adjustments_pkey ON public.financial_adjustments USING btree (id)`
- `financial_adjustments` · `idx_adj_student_bill` · `CREATE INDEX idx_adj_student_bill ON public.financial_adjustments USING btree (school_id, student_id, bill_id)`
- `financial_adjustments` · `idx_fin_adj_school` · `CREATE INDEX idx_fin_adj_school ON public.financial_adjustments USING btree (school_id)`
- `financial_adjustments` · `idx_fin_adj_student` · `CREATE INDEX idx_fin_adj_student ON public.financial_adjustments USING btree (student_id, term_id)`
- `grading_rows` · `grading_rows_pkey` · `CREATE UNIQUE INDEX grading_rows_pkey ON public.grading_rows USING btree (id)`
- `grading_templates` · `grading_templates_pkey` · `CREATE UNIQUE INDEX grading_templates_pkey ON public.grading_templates USING btree (id)`
- `level_affective_templates` · `level_affective_templates_level_id_key` · `CREATE UNIQUE INDEX level_affective_templates_level_id_key ON public.level_affective_templates USING btree (le`
- `level_affective_templates` · `level_affective_templates_pkey` · `CREATE UNIQUE INDEX level_affective_templates_pkey ON public.level_affective_templates USING btree (id)`
- `level_components_templates` · `level_components_templates_level_id_key` · `CREATE UNIQUE INDEX level_components_templates_level_id_key ON public.level_components_templates USING btree (`
- `level_components_templates` · `level_components_templates_pkey` · `CREATE UNIQUE INDEX level_components_templates_pkey ON public.level_components_templates USING btree (id)`
- `level_grading_templates` · `level_grading_templates_level_id_key` · `CREATE UNIQUE INDEX level_grading_templates_level_id_key ON public.level_grading_templates USING btree (level_`
- `level_grading_templates` · `level_grading_templates_pkey` · `CREATE UNIQUE INDEX level_grading_templates_pkey ON public.level_grading_templates USING btree (id)`
- `level_psychomotor_templates` · `level_psychomotor_templates_level_id_key` · `CREATE UNIQUE INDEX level_psychomotor_templates_level_id_key ON public.level_psychomotor_templates USING btree`
- `level_psychomotor_templates` · `level_psychomotor_templates_pkey` · `CREATE UNIQUE INDEX level_psychomotor_templates_pkey ON public.level_psychomotor_templates USING btree (id)`
- `password_history` · `idx_password_history_used` · `CREATE INDEX idx_password_history_used ON public.password_history USING btree (password)`
- `password_history` · `password_history_pkey` · `CREATE UNIQUE INDEX password_history_pkey ON public.password_history USING btree (id)`
- `payment_plan_installments` · `idx_inst_plan` · `CREATE INDEX idx_inst_plan ON public.payment_plan_installments USING btree (plan_id)`
- `payment_plan_installments` · `payment_plan_installments_pkey` · `CREATE UNIQUE INDEX payment_plan_installments_pkey ON public.payment_plan_installments USING btree (id)`
- `payment_plan_installments` · `payment_plan_installments_plan_id_installment_number_key` · `CREATE UNIQUE INDEX payment_plan_installments_plan_id_installment_number_key ON public.payment_plan_installmen`
- `payment_plans` · `idx_plans_student` · `CREATE INDEX idx_plans_student ON public.payment_plans USING btree (student_id)`
- `payment_plans` · `payment_plans_pkey` · `CREATE UNIQUE INDEX payment_plans_pkey ON public.payment_plans USING btree (id)`
- `payments` · `idx_payments_school_paid_on` · `CREATE INDEX idx_payments_school_paid_on ON public.payments USING btree (school_id, paid_on DESC)`
- `payments` · `idx_payments_status` · `CREATE INDEX idx_payments_status ON public.payments USING btree (status)`
- `payments` · `idx_payments_student` · `CREATE INDEX idx_payments_student ON public.payments USING btree (student_id)`
- `payments` · `idx_payments_term` · `CREATE INDEX idx_payments_term ON public.payments USING btree (term_id)`
- `payments` · `payments_pkey` · `CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id)`
- `payments` · `payments_receipt_number_key` · `CREATE UNIQUE INDEX payments_receipt_number_key ON public.payments USING btree (receipt_number)`
- `profiles` · `idx_profiles_is_active` · `CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active)`
- `profiles` · `idx_profiles_role` · `CREATE INDEX idx_profiles_role ON public.profiles USING btree (role)`
- `profiles` · `idx_profiles_school_id` · `CREATE INDEX idx_profiles_school_id ON public.profiles USING btree (school_id)`
- `profiles` · `profiles_pkey` · `CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id)`
- `psychomotor_rows` · `psychomotor_rows_pkey` · `CREATE UNIQUE INDEX psychomotor_rows_pkey ON public.psychomotor_rows USING btree (id)`
- `psychomotor_scores` · `psychomotor_scores_pkey` · `CREATE UNIQUE INDEX psychomotor_scores_pkey ON public.psychomotor_scores USING btree (id)`
- `psychomotor_scores` · `psychomotor_scores_student_id_trait_id_term_id_key` · `CREATE UNIQUE INDEX psychomotor_scores_student_id_trait_id_term_id_key ON public.psychomotor_scores USING btre`
- `psychomotor_templates` · `psychomotor_templates_pkey` · `CREATE UNIQUE INDEX psychomotor_templates_pkey ON public.psychomotor_templates USING btree (id)`
- `receipts` · `idx_receipts_payment` · `CREATE INDEX idx_receipts_payment ON public.receipts USING btree (payment_id)`
- `receipts` · `receipts_pkey` · `CREATE UNIQUE INDEX receipts_pkey ON public.receipts USING btree (id)`
- `receipts` · `receipts_school_id_receipt_number_key` · `CREATE UNIQUE INDEX receipts_school_id_receipt_number_key ON public.receipts USING btree (school_id, receipt_n`
- `report_card_submissions` · `report_card_submissions_class_id_term_id_key` · `CREATE UNIQUE INDEX report_card_submissions_class_id_term_id_key ON public.report_card_submissions USING btree`
- `report_card_submissions` · `report_card_submissions_pkey` · `CREATE UNIQUE INDEX report_card_submissions_pkey ON public.report_card_submissions USING btree (id)`
- `result_edit_logs` · `result_edit_logs_pkey` · `CREATE UNIQUE INDEX result_edit_logs_pkey ON public.result_edit_logs USING btree (id)`
- `school_admin_comments` · `school_admin_comments_pkey` · `CREATE UNIQUE INDEX school_admin_comments_pkey ON public.school_admin_comments USING btree (id)`
- `school_admin_comments` · `school_admin_comments_student_id_term_id_key` · `CREATE UNIQUE INDEX school_admin_comments_student_id_term_id_key ON public.school_admin_comments USING btree (`
- `school_admins` · `idx_school_admins_profile` · `CREATE INDEX idx_school_admins_profile ON public.school_admins USING btree (profile_id)`
- `school_admins` · `idx_school_admins_school` · `CREATE INDEX idx_school_admins_school ON public.school_admins USING btree (school_id)`
- `school_admins` · `school_admins_pkey` · `CREATE UNIQUE INDEX school_admins_pkey ON public.school_admins USING btree (id)`
- `school_admins` · `school_admins_profile_id_key` · `CREATE UNIQUE INDEX school_admins_profile_id_key ON public.school_admins USING btree (profile_id)`
- `school_admins` · `school_admins_school_id_profile_id_key` · `CREATE UNIQUE INDEX school_admins_school_id_profile_id_key ON public.school_admins USING btree (school_id, pro`
- `school_bank_accounts` · `school_bank_accounts_pkey` · `CREATE UNIQUE INDEX school_bank_accounts_pkey ON public.school_bank_accounts USING btree (id)`
- `school_bank_accounts` · `uq_school_bank_accounts` · `CREATE UNIQUE INDEX uq_school_bank_accounts ON public.school_bank_accounts USING btree (school_id, bank_name, `
- `school_features` · `school_features_pkey` · `CREATE UNIQUE INDEX school_features_pkey ON public.school_features USING btree (id)`
- `school_features` · `school_features_school_id_feature_key_key` · `CREATE UNIQUE INDEX school_features_school_id_feature_key_key ON public.school_features USING btree (school_id`
- `schools` · `schools_pkey` · `CREATE UNIQUE INDEX schools_pkey ON public.schools USING btree (id)`
- `schools` · `schools_slug_key` · `CREATE UNIQUE INDEX schools_slug_key ON public.schools USING btree (slug)`
- `student_bill_lines` · `idx_bill_lines_bill` · `CREATE INDEX idx_bill_lines_bill ON public.student_bill_lines USING btree (bill_id)`
- `student_bill_lines` · `student_bill_lines_pkey` · `CREATE UNIQUE INDEX student_bill_lines_pkey ON public.student_bill_lines USING btree (id)`
- `student_bills` · `idx_bills_class` · `CREATE INDEX idx_bills_class ON public.student_bills USING btree (class_id)`
- `student_bills` · `idx_bills_school_term` · `CREATE INDEX idx_bills_school_term ON public.student_bills USING btree (school_id, term_id)`
- `student_bills` · `idx_bills_student` · `CREATE INDEX idx_bills_student ON public.student_bills USING btree (student_id)`
- `student_bills` · `student_bills_pkey` · `CREATE UNIQUE INDEX student_bills_pkey ON public.student_bills USING btree (id)`
- `student_bills` · `student_bills_student_id_term_id_key` · `CREATE UNIQUE INDEX student_bills_student_id_term_id_key ON public.student_bills USING btree (student_id, term`
- `student_fee_adjustments` · `idx_sfa_class_fee` · `CREATE INDEX idx_sfa_class_fee ON public.student_fee_adjustments USING btree (class_fee_id)`
- `student_fee_adjustments` · `idx_sfa_student` · `CREATE INDEX idx_sfa_student ON public.student_fee_adjustments USING btree (student_id)`
- `student_fee_adjustments` · `student_fee_adjustments_pkey` · `CREATE UNIQUE INDEX student_fee_adjustments_pkey ON public.student_fee_adjustments USING btree (id)`
- `student_fee_adjustments` · `uq_sfa_student_class` · `CREATE UNIQUE INDEX uq_sfa_student_class ON public.student_fee_adjustments USING btree (school_id, student_id,`
- `student_fee_adjustments` · `uq_sfa_student_term` · `CREATE UNIQUE INDEX uq_sfa_student_term ON public.student_fee_adjustments USING btree (school_id, student_id, `
- `student_grades` · `idx_student_grades_assessment` · `CREATE INDEX idx_student_grades_assessment ON public.student_grades USING btree (assessment_id)`
- `student_grades` · `idx_student_grades_student` · `CREATE INDEX idx_student_grades_student ON public.student_grades USING btree (student_id)`
- `student_grades` · `student_grades_pkey` · `CREATE UNIQUE INDEX student_grades_pkey ON public.student_grades USING btree (id)`
- `student_grades` · `student_grades_student_id_assessment_id_key` · `CREATE UNIQUE INDEX student_grades_student_id_assessment_id_key ON public.student_grades USING btree (student_`
- `student_scores` · `idx_student_scores_class` · `CREATE INDEX idx_student_scores_class ON public.student_scores USING btree (class_id)`
- `student_scores` · `idx_student_scores_subject` · `CREATE INDEX idx_student_scores_subject ON public.student_scores USING btree (subject_id)`
- `student_scores` · `student_scores_pkey` · `CREATE UNIQUE INDEX student_scores_pkey ON public.student_scores USING btree (id)`
- `student_scores` · `student_scores_student_id_component_id_term_id_subject_id_key` · `CREATE UNIQUE INDEX student_scores_student_id_component_id_term_id_subject_id_key ON public.student_scores USI`
- `student_waivers` · `idx_sw_student_term` · `CREATE INDEX idx_sw_student_term ON public.student_waivers USING btree (student_id, term_id)`
- `student_waivers` · `idx_waivers_student_term` · `CREATE INDEX idx_waivers_student_term ON public.student_waivers USING btree (school_id, student_id, term_id)`
- `student_waivers` · `student_waivers_pkey` · `CREATE UNIQUE INDEX student_waivers_pkey ON public.student_waivers USING btree (id)`
- `students` · `idx_students_active` · `CREATE INDEX idx_students_active ON public.students USING btree (is_active)`
- `students` · `idx_students_class_id` · `CREATE INDEX idx_students_class_id ON public.students USING btree (class_id)`
- `students` · `idx_students_profile_id` · `CREATE INDEX idx_students_profile_id ON public.students USING btree (profile_id)`
- `students` · `idx_students_school_active` · `CREATE INDEX idx_students_school_active ON public.students USING btree (school_id, class_id)`
- `students` · `idx_students_school_id` · `CREATE INDEX idx_students_school_id ON public.students USING btree (school_id)`
- `students` · `students_pkey` · `CREATE UNIQUE INDEX students_pkey ON public.students USING btree (id)`
- `students` · `students_profile_id_key` · `CREATE UNIQUE INDEX students_profile_id_key ON public.students USING btree (profile_id)`
- `subjects` · `subjects_pkey` · `CREATE UNIQUE INDEX subjects_pkey ON public.subjects USING btree (id)`
- `subscriptions` · `idx_subscriptions_school` · `CREATE INDEX idx_subscriptions_school ON public.subscriptions USING btree (school_id)`
- `subscriptions` · `subscriptions_pkey` · `CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id)`
- `super_admins` · `super_admins_email_key` · `CREATE UNIQUE INDEX super_admins_email_key ON public.super_admins USING btree (email)`
- `super_admins` · `super_admins_pkey` · `CREATE UNIQUE INDEX super_admins_pkey ON public.super_admins USING btree (id)`
- `support_logs` · `idx_support_logs_created` · `CREATE INDEX idx_support_logs_created ON public.support_logs USING btree (created_at DESC)`
- `support_logs` · `idx_support_logs_school` · `CREATE INDEX idx_support_logs_school ON public.support_logs USING btree (school_id)`
- `support_logs` · `support_logs_pkey` · `CREATE UNIQUE INDEX support_logs_pkey ON public.support_logs USING btree (id)`
- `teacher_comments` · `teacher_comments_pkey` · `CREATE UNIQUE INDEX teacher_comments_pkey ON public.teacher_comments USING btree (id)`
- `teacher_comments` · `teacher_comments_student_id_term_id_key` · `CREATE UNIQUE INDEX teacher_comments_student_id_term_id_key ON public.teacher_comments USING btree (student_id`
- `teacher_subjects` · `idx_teacher_subjects_teacher` · `CREATE INDEX idx_teacher_subjects_teacher ON public.teacher_subjects USING btree (teacher_id)`
- `teacher_subjects` · `teacher_subjects_pkey` · `CREATE UNIQUE INDEX teacher_subjects_pkey ON public.teacher_subjects USING btree (id)`
- `teacher_subjects` · `teacher_subjects_teacher_id_subject_id_class_id_academic_te_key` · `CREATE UNIQUE INDEX teacher_subjects_teacher_id_subject_id_class_id_academic_te_key ON public.teacher_subjects`
- `teachers` · `idx_teachers_profile_id` · `CREATE INDEX idx_teachers_profile_id ON public.teachers USING btree (profile_id)`
- `teachers` · `idx_teachers_school` · `CREATE INDEX idx_teachers_school ON public.teachers USING btree (school_id)`
- `teachers` · `idx_teachers_school_id` · `CREATE INDEX idx_teachers_school_id ON public.teachers USING btree (school_id)`
- `teachers` · `teachers_pkey` · `CREATE UNIQUE INDEX teachers_pkey ON public.teachers USING btree (id)`
- `teachers` · `teachers_profile_id_key` · `CREATE UNIQUE INDEX teachers_profile_id_key ON public.teachers USING btree (profile_id)`
- `term_fees` · `idx_term_fees_fee_head` · `CREATE INDEX idx_term_fees_fee_head ON public.term_fees USING btree (fee_head_id)`
- `term_fees` · `idx_term_fees_school` · `CREATE INDEX idx_term_fees_school ON public.term_fees USING btree (school_id)`
- `term_fees` · `idx_term_fees_section` · `CREATE INDEX idx_term_fees_section ON public.term_fees USING btree (academic_section_id)`
- `term_fees` · `idx_term_fees_term` · `CREATE INDEX idx_term_fees_term ON public.term_fees USING btree (term_id)`
- `term_fees` · `term_fees_pkey` · `CREATE UNIQUE INDEX term_fees_pkey ON public.term_fees USING btree (id)`
- `term_result_components` · `idx_trc_school` · `CREATE INDEX idx_trc_school ON public.term_result_components USING btree (school_id)`
- `term_result_components` · `idx_trc_student` · `CREATE INDEX idx_trc_student ON public.term_result_components USING btree (student_id)`
- `term_result_components` · `idx_trc_term` · `CREATE INDEX idx_trc_term ON public.term_result_components USING btree (term_id)`
- `term_result_components` · `term_result_components_pkey` · `CREATE UNIQUE INDEX term_result_components_pkey ON public.term_result_components USING btree (id)`
- `term_result_components` · `term_result_components_student_id_term_id_subject_id_compon_key` · `CREATE UNIQUE INDEX term_result_components_student_id_term_id_subject_id_compon_key ON public.term_result_comp`
- `term_results` · `idx_term_results_published` · `CREATE INDEX idx_term_results_published ON public.term_results USING btree (published)`
- `term_results` · `idx_term_results_student` · `CREATE INDEX idx_term_results_student ON public.term_results USING btree (student_id)`
- `term_results` · `term_results_pkey` · `CREATE UNIQUE INDEX term_results_pkey ON public.term_results USING btree (id)`
- `term_results` · `term_results_student_id_term_id_subject_id_key` · `CREATE UNIQUE INDEX term_results_student_id_term_id_subject_id_key ON public.term_results USING btree (student`

## 9. Storage

| Bucket | Object | Bytes |
| --- | --- | ---: |
| `avatars` | `17a265d5-88d9-46e7-9d13-eaad8c96cb22/1785812472576-2afm3q678c6.png` | 3454 |
| `avatars` | `ai-imports/17a265d5-88d9-46e7-9d13-eaad8c96cb22/1785910968247-mwvujnft3b.jpg` | 1668278 |

**Exposure:** the `ai-imports/` object is an exam mark sheet in a **public** bucket (finding I8).

## 10. Divergence from the migration folder

- Live RLS: **75/75** tables have RLS enabled, but only **37** have policies; **38 are deny-all to tenants** (see §1). The migration files imply far less than either figure.
- 5 tables referenced by code do not exist at all (see §2).
- 9 functions, 15 triggers, 199 indexes exist live.
- Baseline = the schema dump. All new work = forward-only migrations.
