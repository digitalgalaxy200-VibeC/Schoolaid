// ============================================================
// Execution Engine — executes approved plans by calling
// existing backend services through the service client.
// Every step is journaled for audit and rollback.
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";
import type {
  ExecutionPlan,
  ExecutionStep,
  CopilotOperation,
  OperationStep,
  StepResult,
} from "./types";
import { CAPABILITIES, getCapability, isHighRisk } from "./capability-registry";
import {
  DEFAULT_STEP_TIMEOUT_MS,
  StepExecutionError,
  newRequestId,
  outcomeToStepResult,
  runWithTimeout,
  stepStatusFor,
} from "./step-result";
import { logAudit } from "./audit-logger";
import { schoolUpdateFrom } from "./school-update";
import {
  configureWebsite,
  readWebsiteConfig,
  readWebsiteContent,
  updateWebsiteSection,
} from "./website-handlers";
import { createSchoolWithAdmin, provisionAdminForSchool } from "@/lib/school-provisioning";
import {
  assertClassInSchool,
  assertEmailUnused,
  assertSessionInSchool,
  assertSubjectInSchool,
  assertTeacherInSchool,
} from "./tenant-guard";

// ── Execution Context ──────────────────────────────────────

export interface ExecutionContext {
  schoolId: string;
  superAdminId: string;
  operationId: string;
  conversationId?: string;
  onProgress?: (completed: number, total: number, currentStep: string) => void;
  /** Per-step execution timeout; a step past it becomes `unknown`. */
  stepTimeoutMs?: number;
}

// ── Execute Plan ───────────────────────────────────────────

export async function executePlan(
  plan: ExecutionPlan,
  ctx: ExecutionContext,
): Promise<{ operation: CopilotOperation; steps: OperationStep[]; summary: string }> {
  // ── GUARDRAIL: Hard-block high-risk capabilities ──────────
  // This is a code-level check — not just a prompt instruction.
  // Even if the AI hallucinates a plan containing blocked ops,
  // this gate prevents execution before any DB writes occur.
  const blockedSteps = plan.steps.filter((s) => isHighRisk(s.capability));
  if (blockedSteps.length > 0) {
    const blockedNames = blockedSteps.map((s) => s.capability).join(", ");
    throw new Error(
      `Execution blocked: This plan contains high-risk operation(s) [${blockedNames}] that cannot be executed through the AI Copilot. ` +
      `These actions must be performed manually through the SchoolAid admin dashboard to ensure proper human oversight.`
    );
  }
  // ─────────────────────────────────────────────────────────

  const supabase = getServiceClient();
  const steps: OperationStep[] = [];

  // A request id for the operation as a whole (each step carries its own).
  const operationRequestId = newRequestId();

  // 1. Create operation record
  const { data: operation, error: opErr } = await supabase
    .from("copilot_operations")
    .insert({
      conversation_id: ctx.conversationId || null,
      message_id: null,
      school_id: ctx.schoolId || null,
      super_admin_id: ctx.superAdminId,
      status: "executing",
      request_id: operationRequestId,
      plan_summary: plan.summary,
      total_steps: plan.steps.length,
      completed_steps: 0,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (opErr || !operation) {
    throw new Error(`Failed to create operation record: ${opErr?.message}`);
  }

  // Use the provided operation ID if given, otherwise the created one
  const operationId = ctx.operationId || operation.id;

  // 2. Create step records
  for (const planStep of plan.steps) {
    const { data: step, error: stepErr } = await supabase
      .from("copilot_operation_steps")
      .insert({
        operation_id: operationId,
        step_order: planStep.order,
        capability: planStep.capability,
        description: planStep.description,
        input_params: planStep.params,
        api_endpoint: getCapability(planStep.capability)?.endpoint || null,
        api_method: getCapability(planStep.capability)?.method || null,
        request_id: newRequestId(),
        status: "pending",
      })
      .select("*")
      .single();

    if (stepErr) {
      console.error("[copilot] Failed to create step record:", stepErr.message);
      throw new Error(`Failed to create step record: ${stepErr.message}`);
    }

    steps.push(step as OperationStep);
  }

  // Log: plan approved, execution started
  await logAudit({
    schoolId: ctx.schoolId,
    superAdminId: ctx.superAdminId,
    operationId,
    action: "execution_started",
    details: {
      summary: plan.summary,
      totalSteps: plan.steps.length,
    },
  });

  // 3. Execute steps in dependency order
  let completedCount = 0;
  let failedCount = 0;
  let unknownCount = 0;
  const errors: string[] = [];

  // Sort steps by order, respecting dependencies
  const sortedSteps = topologicalSort(plan.steps);
  const results = new Map<number, StepResult>();

  for (const planStep of sortedSteps) {
    // Check dependencies. An `unknown` dependency blocks the dependent step
    // exactly as a failure does — we must not build on an unconfirmed result.
    if (planStep.dependsOn && planStep.dependsOn.length > 0) {
      const depsFailed = planStep.dependsOn.some((depOrder) => {
        const depResult = results.get(depOrder);
        return !depResult || depResult.status !== "success";
      });

      if (depsFailed) {
        // Skip this step — dependencies did not succeed
        await supabase
          .from("copilot_operation_steps")
          .update({
            status: "skipped",
            error_message: "Dependency step did not succeed",
            completed_at: new Date().toISOString(),
          })
          .eq("operation_id", operationId)
          .eq("step_order", planStep.order);

        continue;
      }
    }

    // Resolve params — replace references to previous step outputs
    const resolvedParams = resolveParams(planStep.params, results);

    const stepRow = steps.find((s) => s.step_order === planStep.order);
    const requestId = stepRow?.request_id || newRequestId();
    const startedAtMs = Date.now();

    // Mark step as running, persisting the request id BEFORE dispatch so the
    // dispatch and its result are always traceable to each other.
    await supabase
      .from("copilot_operation_steps")
      .update({
        status: "running",
        request_id: requestId,
        started_at: new Date(startedAtMs).toISOString(),
      })
      .eq("operation_id", operationId)
      .eq("step_order", planStep.order);

    ctx.onProgress?.(completedCount, plan.steps.length, planStep.description);

    // Execute under a timeout. The outcome is ALWAYS a StepResult — success,
    // error, or unknown — never an assumption that the write landed.
    const meta = {
      capability: planStep.capability,
      tenantId: ctx.schoolId,
      requestId,
      startedAtMs,
    };
    const outcome = await runWithTimeout(
      () => executeStep(planStep, resolvedParams, ctx),
      ctx.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
    );
    const result = outcomeToStepResult(outcome, meta);
    results.set(planStep.order, result);

    await supabase
      .from("copilot_operation_steps")
      .update({
        status: stepStatusFor(result),
        result: result as unknown as Record<string, unknown>,
        // `response_data` keeps the RAW payload so rollback and the receipt read
        // exactly what they always have; the contract lives in `result`.
        response_data:
          result.status === "success"
            ? (result.data as Record<string, unknown>)
            : null,
        error_message: result.error?.message ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("operation_id", operationId)
      .eq("step_order", planStep.order);

    if (result.status === "success") {
      completedCount++;
      await logAudit({
        schoolId: ctx.schoolId,
        superAdminId: ctx.superAdminId,
        operationId,
        stepId: stepRow?.id,
        action: "step_completed",
        details: {
          capability: planStep.capability,
          description: planStep.description,
          request_id: requestId,
        },
      });
    } else if (result.status === "unknown") {
      unknownCount++;
      errors.push(
        `Step ${planStep.order}: outcome UNKNOWN — ${result.error?.message ?? "no authoritative result"}`,
      );
      await logAudit({
        schoolId: ctx.schoolId,
        superAdminId: ctx.superAdminId,
        operationId,
        stepId: stepRow?.id,
        action: "step_unknown",
        details: {
          capability: planStep.capability,
          request_id: requestId,
          code: result.error?.code,
        },
      });
    } else {
      failedCount++;
      const errorMsg = result.error?.message || "Unknown error";
      errors.push(`Step ${planStep.order}: ${errorMsg}`);
      await logAudit({
        schoolId: ctx.schoolId,
        superAdminId: ctx.superAdminId,
        operationId,
        stepId: stepRow?.id,
        action: "step_failed",
        details: {
          capability: planStep.capability,
          error: errorMsg,
          request_id: requestId,
        },
      });
    }
  }

  // 4. Update operation status. `unknown` is its own terminal state and is
  // NEVER collapsed into `completed`.
  const finalStatus = failedCount > 0 ? "failed" : unknownCount > 0 ? "unknown" : "completed";

  const { data: updatedOp } = await supabase
    .from("copilot_operations")
    .update({
      status: finalStatus,
      completed_steps: completedCount,
      completed_at: new Date().toISOString(),
    })
    .eq("id", operationId)
    .select("*")
    .single();

  // Refresh step records to get final statuses
  const { data: finalSteps } = await supabase
    .from("copilot_operation_steps")
    .select("*")
    .eq("operation_id", operationId)
    .order("step_order");

  await logAudit({
    schoolId: ctx.schoolId,
    superAdminId: ctx.superAdminId,
    operationId,
    action:
      finalStatus === "completed"
        ? "execution_completed"
        : finalStatus === "unknown"
          ? "execution_unknown"
          : "execution_failed",
    details: {
      completedSteps: completedCount,
      totalSteps: plan.steps.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  // Build summary
  const summary = buildSummary(
    plan,
    { completed: completedCount, failed: failedCount, unknown: unknownCount },
    errors,
  );

  return {
    operation: updatedOp as CopilotOperation,
    steps: (finalSteps || []) as OperationStep[],
    summary,
  };
}

// ── Step Execution ─────────────────────────────────────────

async function executeStep(
  step: ExecutionStep,
  params: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  const capability = getCapability(step.capability);
  if (!capability) {
    // Surfaced as a code (`UNKNOWN_CAPABILITY`) rather than swallowed: a step
    // that cannot run must produce an explicit error, never quietly disappear.
    throw new StepExecutionError(
      "UNKNOWN_CAPABILITY",
      `The requested capability "${step.capability}" is not registered.`,
    );
  }

  if (capability.isReadOnly) {
    // Read-only capabilities just fetch data
    return executeReadStep(capability.endpoint!, params, ctx.schoolId);
  }

  // Write capabilities execute the corresponding operation
  return executeWriteStep(capability, params, ctx);
}

/**
 * Runs ONE read capability for the read-round loop (and for read steps).
 * Writes are refused here, not just filtered upstream: this function is the
 * boundary a read round can reach, and it must never write.
 */
export async function executeReadCapability(
  name: string,
  params: Record<string, unknown>,
  schoolId: string,
): Promise<unknown> {
  const capability = getCapability(name);
  if (!capability) throw new Error(`Unknown capability: ${name}`);
  if (!capability.isReadOnly) throw new Error(`${name} is not a read capability`);
  if (!capability.endpoint) throw new Error(`${name} has no endpoint`);
  return executeReadStep(capability.endpoint, params, schoolId);
}

async function executeReadStep(
  endpoint: string,
  params: Record<string, unknown>,
  schoolId: string,
): Promise<unknown> {
  // Read steps use the service client directly — same as the API routes
  const supabase = getServiceClient();

  // Platform-level reads carry no school context.
  if (endpoint === "/api/super-admin/schools") {
    return listAllSchools(params);
  }

  // Website configuration and content are not tables — they are read through the
  // same entitled, school-scoped loaders the website engine uses.
  if (endpoint === "/api/school-admin/website/config") {
    return readWebsiteConfig(schoolId);
  }
  if (endpoint === "/api/school-admin/website/content") {
    return readWebsiteContent(schoolId, params.kind);
  }

  // Map endpoint to table
  const tableMap: Record<string, string> = {
    "/api/school-admin/students": "students",
    "/api/school-admin/teachers": "teachers",
    "/api/school-admin/classes": "classes",
    "/api/school-admin/subjects": "subjects",
    "/api/school-admin/sessions": "academic_sessions",
    "/api/school-admin/terms": "academic_terms",
    "/api/school-admin/grading-scales": "grading_templates",
    "/api/school-admin/assessment-components": "components_templates",
    "/api/school-admin/psychomotor": "psychomotor_templates",
    "/api/school-admin/affective": "affective_templates",
    "/api/school-admin/class-subjects": "class_subjects",
    "/api/school-admin/class-teachers": "class_teachers",
    "/api/school-admin/school": "schools",
    "/api/school-admin/report-card-settings": "report_card_settings",
  };

  const table = tableMap[endpoint];
  if (!table) {
    throw new Error(`Cannot map endpoint to table: ${endpoint}`);
  }

  // `schools` is keyed by its own id — it has no `school_id` column, which is
  // why get_school_info used to fail on every call.
  if (table === "schools") {
    const { data, error } = await supabase
      .from("schools")
      .select("*")
      .eq("id", schoolId)
      .maybeSingle();
    if (error) throw new Error(`Query failed: ${error.message}`);
    return data ?? [];
  }

  // A status filter has to go through the embedded profile: `is_active` lives
  // on `profiles`, and PostgREST needs the embed in the select or the filter
  // fails with "not an embedded resource".
  const filteredByStatus = table === "students" && !!params.status && params.status !== "all";
  let select = "*";
  if (table === "grading_templates") select = "*, grading_rows(*)";
  if (table === "components_templates") select = "*, components_rows(*)";
  if (table === "psychomotor_templates") select = "*, psychomotor_rows(*)";
  if (table === "affective_templates") select = "*, affective_rows(*)";
  if (filteredByStatus) select = "*, profiles!inner(is_active)";

  let query = supabase.from(table).select(select).eq("school_id", schoolId);

  // Apply filters from params
  if (params.class_id) {
    query = query.eq("class_id", params.class_id as string);
  }
  if (filteredByStatus) {
    query = query.eq("profiles.is_active", params.status === "active");
  }

  // Every read is bounded: the model asked for a list, not for the school.
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(Math.max(1, Number(params.limit) || 100), 100);
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, error } = await query;
  if (error) throw new Error(`Query failed: ${error.message}`);

  return data || [];
}

async function executeWriteStep(
  capability: ReturnType<typeof getCapability>,
  params: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  const supabase = getServiceClient();

  // Inject school_id
  const data = { ...params, school_id: ctx.schoolId };

  // Route to the correct handler based on capability
  switch (capability!.name) {
    // ── Students ──────────────────────────────
    case "create_student":
      return createStudent(data, ctx);
    case "update_student":
      return updateStudent(data, ctx);
    case "archive_student":
      return archiveStudent(data, ctx);

    // ── Teachers ──────────────────────────────
    case "create_teacher":
      return createTeacher(data, ctx);
    case "assign_teacher_to_class":
      return assignTeacherToClass(data, ctx);
    case "assign_teacher_to_subject":
      return assignTeacherToSubject(data, ctx);

    // ── Classes ───────────────────────────────
    case "create_class":
      return insertRecord(supabase, "classes", data);

    // ── Subjects ──────────────────────────────
    case "create_subject":
      return insertRecord(supabase, "subjects", { name: params.name, school_id: ctx.schoolId });
    case "assign_subject_to_class":
      await assertSubjectInSchool(supabase, params.subject_id, ctx.schoolId);
      await assertClassInSchool(supabase, params.class_id, ctx.schoolId);
      return insertRecord(supabase, "class_subjects", {
        subject_id: params.subject_id,
        class_id: params.class_id,
        school_id: ctx.schoolId,
      });

    // ── Sessions / Terms ──────────────────────
    // NOTE: the columns are `name`, `start_date`, `end_date` — the old code
    // wrote session_name/term_name/next_term_begins, none of which exist.
    case "create_session": {
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return insertRecord(supabase, "academic_sessions", {
        name: params.name,
        school_id: ctx.schoolId,
        start_date: today,
        end_date: end,
        is_active: params.is_active ?? false,
      });
    }
    case "create_term": {
      await assertSessionInSchool(supabase, params.session_id, ctx.schoolId);
      const start = params.start_date || new Date().toISOString().slice(0, 10);
      return insertRecord(supabase, "academic_terms", {
        name: params.term_name,
        session_id: params.session_id,
        school_id: ctx.schoolId,
        start_date: start,
        end_date: params.end_date || start,
        is_active: params.is_active ?? false,
      });
    }

    // ── Assessment / Grading ──────────────────
    case "create_assessment_component": {
      let { data: compTmpl } = await supabase.from("components_templates").select("id").eq("school_id", ctx.schoolId).limit(1).single();
      let compTmplId = compTmpl?.id;
      if (!compTmplId) {
         const { data: newCompTmpl } = await supabase.from("components_templates").insert({ school_id: ctx.schoolId, name: "Default Components" }).select("id").single();
         compTmplId = newCompTmpl!.id;
      }
      return insertRecord(supabase, "components_rows", {
        template_id: compTmplId,
        name: params.name,
        maximum_score: Number(params.maximum_score),
        display_order: params.display_order ?? 1,
      });
    }
    case "create_grading_scale": {
      let { data: tmpl } = await supabase.from("grading_templates").select("id").eq("school_id", ctx.schoolId).limit(1).single();
      let templateId = tmpl?.id;
      if (!templateId) {
         const { data: newTmpl } = await supabase.from("grading_templates").insert({ school_id: ctx.schoolId, name: "Default Grading Scale" }).select("id").single();
         templateId = newTmpl!.id;
      }
      return insertRecord(supabase, "grading_rows", {
        template_id: templateId,
        grade: params.grade,
        minimum_score: Number(params.minimum_score),
        maximum_score: Number(params.maximum_score),
        remark: params.remark,
      });
    }

    // ── Psychomotor / Affective ───────────────
    case "create_psychomotor_trait": {
      let { data: pmTmpl } = await supabase.from("psychomotor_templates").select("id").eq("school_id", ctx.schoolId).limit(1).single();
      let pmTmplId = pmTmpl?.id;
      if (!pmTmplId) {
         const { data: newPmTmpl } = await supabase.from("psychomotor_templates").insert({ school_id: ctx.schoolId, name: "Default Psychomotor Traits" }).select("id").single();
         pmTmplId = newPmTmpl!.id;
      }
      return insertRecord(supabase, "psychomotor_rows", {
        template_id: pmTmplId,
        name: params.name,
        display_order: params.display_order ?? 1,
      });
    }
    case "create_affective_trait": {
      let { data: afTmpl } = await supabase.from("affective_templates").select("id").eq("school_id", ctx.schoolId).limit(1).single();
      let afTmplId = afTmpl?.id;
      if (!afTmplId) {
         const { data: newAfTmpl } = await supabase.from("affective_templates").insert({ school_id: ctx.schoolId, name: "Default Affective Traits" }).select("id").single();
         afTmplId = newAfTmpl!.id;
      }
      return insertRecord(supabase, "affective_rows", {
        template_id: afTmplId,
        name: params.name,
        display_order: params.display_order ?? 1,
      });
    }

    // ── Report Cards / Publishing ─────────────
    case "configure_report_card_settings":
      return updateRecord(supabase, "report_card_settings", params, ctx);
    case "publish_results":
      return publishResults(params, ctx);

    // ── Website ───────────────────────────────
    // Always the acting school's own website: the school id is the session's,
    // never a parameter, and the entitlement is re-checked on every write.
    case "configure_website":
      return configureWebsite(params, ctx.schoolId);
    case "update_website_section":
      return updateWebsiteSection(params, ctx.schoolId);

    // ── Super Admin (no school context) ──
    case "create_school":
      return createSchool(params);
    case "update_school":
      return updateSchool(params);
    case "list_all_schools":
      return listAllSchools(params);
    case "provision_school_admin":
      return provisionAdmin(params);

    default:
      throw new Error(`Execution not implemented for capability: ${capability!.name}`);
  }
}

// ── Specialized Handlers ───────────────────────────────────

async function createStudent(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();

  const fName = String(data.first_name || "").trim();
  const lName = String(data.last_name || "").trim();
  if (!fName && !lName) throw new Error("At least first_name or last_name is required");

  // Fetch school abbreviation for email generation
  const { data: schoolData } = await supabase
    .from("schools").select("abbreviation, name").eq("id", ctx.schoolId).single();
  const abbreviation = schoolData?.abbreviation || "school";

  const fullName = [fName, String(data.middle_name || "").trim(), lName].filter(Boolean).join(" ") || "Student";
  let cleanName = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanName) cleanName = "student";

  const email = `${cleanName}@${abbreviation}.com`;

  // Fail before creating anything if a reference is wrong or the username is taken.
  if (data.class_id) await assertClassInSchool(supabase, data.class_id, ctx.schoolId);
  await assertEmailUnused(supabase, email);

  const admissionNumber = String(data.student_id || `ADM-${Date.now().toString(36)}`);

  // A unique password, stored (and cleared on first login) the same way every
  // other creation path does it. The predictable ABBREVx3+123 string this used
  // to generate is the exact pattern the bulk-reset scripts were deleted for;
  // it must not come back through the Copilot.
  const password = await generateUniquePassword(schoolData?.name || abbreviation, "student");
  const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;

  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "student", school_id: ctx.schoolId },
    }),
  });

  if (!authRes.ok) {
    const ad = await authRes.json().catch(() => ({}));
    throw new Error(`Auth error: ${ad.msg || ad.message || authRes.status}`);
  }

  const authData = await authRes.json();
  const userId = authData.user?.id || authData.id;
  if (!userId) throw new Error("Failed to create auth user");

  // Create profile
  await supabase.from("profiles").upsert({
    id: userId,
    school_id: ctx.schoolId,
    full_name: fullName,
    first_name: fName || null,
    middle_name: String(data.middle_name || "").trim() || null,
    last_name: lName || null,
    email,
    role: "student",
    is_active: true,
  });

  // Create student record
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      school_id: ctx.schoolId,
      profile_id: userId,
      student_id: admissionNumber,
      first_name: fName || null,
      middle_name: String(data.middle_name || "").trim() || null,
      last_name: lName || null,
      class_id: data.class_id || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      parent_phone: data.parent_phone || null,
      generated_password: password,
      must_change_password: true,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Student creation failed: ${error.message}`);

  // `password` is part of the step output on purpose: the receipt is where a
  // credential is handed over, and this is the only time it can be shown.
  // Curated fields — the receipt caps how many it shows, and the password must
  // never be the field that gets cut.
  return {
    id: student.id,
    full_name: fullName,
    email,
    admission_number: admissionNumber,
    class_id: student.class_id,
    password,
  };
}

async function updateStudent(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  const id = data.id as string;
  if (!id) throw new Error("Student ID is required");

  // Partial updates must not wipe fields the caller did not mention — the old
  // handler nulled class, date of birth and gender on EVERY call — so the
  // current row is read first and only the provided keys are written.
  const { data: current, error: loadError } = await supabase
    .from("students")
    .select("id, profile_id, first_name, middle_name, last_name, class_id, date_of_birth, gender, parent_phone")
    .eq("id", id)
    .eq("school_id", ctx.schoolId)
    .maybeSingle();
  if (loadError) throw new Error(`Student lookup failed: ${loadError.message}`);
  if (!current) throw new Error("Student not found in this school");

  const updates: Record<string, unknown> = {};
  if ("class_id" in data) {
    if (data.class_id) await assertClassInSchool(supabase, data.class_id, ctx.schoolId);
    updates.class_id = data.class_id || null;
  }
  if ("date_of_birth" in data) updates.date_of_birth = data.date_of_birth || null;
  if ("gender" in data) updates.gender = data.gender || null;
  if ("parent_phone" in data) updates.parent_phone = data.parent_phone || null;
  if ("first_name" in data) updates.first_name = data.first_name || null;
  if ("last_name" in data) updates.last_name = data.last_name || null;

  if (Object.keys(updates).length === 0) {
    throw new Error(
      "Nothing to update: provide at least one of first_name, last_name, class_id, date_of_birth, gender, parent_phone",
    );
  }

  const { data: updated, error } = await supabase
    .from("students")
    .update(updates)
    .eq("id", id)
    .eq("school_id", ctx.schoolId)
    .select("*")
    .single();

  if (error) throw new Error(`Student update failed: ${error.message}`);

  // Keep `profiles.full_name` — what every other screen reads — in step with
  // the name parts, the same way the teacher-facing edit does.
  if (("first_name" in updates || "last_name" in updates) && current.profile_id) {
    const nextFirst = (updates.first_name !== undefined ? updates.first_name : current.first_name) as
      | string
      | null;
    const nextLast = (updates.last_name !== undefined ? updates.last_name : current.last_name) as
      | string
      | null;
    const fullName = [nextFirst ?? "", current.middle_name ?? "", nextLast ?? ""].filter(Boolean).join(" ");
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: fullName, first_name: nextFirst, last_name: nextLast })
      .eq("id", current.profile_id)
      .eq("school_id", ctx.schoolId);
    if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);
  }

  return updated;
}

async function archiveStudent(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  if (!data.id) throw new Error("Student ID is required");

  const { data: s } = await supabase
    .from("students").select("profile_id").eq("id", data.id as string).eq("school_id", ctx.schoolId).single();

  if (!s) throw new Error("Student not found");

  await supabase.from("profiles").update({ is_active: !!data.is_active }).eq("id", s.profile_id);
  return { success: true, is_active: data.is_active };
}

async function createTeacher(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();

  const fName = String(data.first_name || "").trim();
  const lName = String(data.last_name || "").trim();
  if (!fName && !lName) throw new Error("At least first_name or last_name is required");

  const { data: schoolData } = await supabase
    .from("schools").select("abbreviation, name").eq("id", ctx.schoolId).single();
  const abbreviation = schoolData?.abbreviation || "school";

  const fullName = [fName, lName].filter(Boolean).join(" ") || "Teacher";
  let cleanName = fullName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanName) cleanName = "teacher";

  const email =
    typeof data.email === "string" && data.email.trim() !== ""
      ? data.email.trim()
      : `${cleanName}@${abbreviation}.com`;
  await assertEmailUnused(supabase, email);
  const password = await generateUniquePassword(schoolData?.name || abbreviation, "teacher");

  const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
  const authRes = await fetch(authUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName, role: "teacher", school_id: ctx.schoolId },
    }),
  });

  if (!authRes.ok) throw new Error(`Auth error: ${authRes.status}`);

  const authData = await authRes.json();
  const userId = authData.user?.id || authData.id;
  if (!userId) throw new Error("Failed to create auth user");

  await supabase.from("profiles").upsert({
    id: userId, school_id: ctx.schoolId, full_name: fullName, email, role: "teacher", is_active: true,
  });

  const { data: teacher, error } = await supabase
    .from("teachers")
    .insert({
      school_id: ctx.schoolId,
      profile_id: userId,
      employee_id: `T-${Date.now().toString(36)}`,
      generated_password: password,
      must_change_password: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Teacher creation failed: ${error.message}`);
  // Curated: the receipt caps its list, and the one-time password must survive.
  return { id: teacher.id, full_name: fullName, email, password };
}

async function assignTeacherToClass(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  await assertTeacherInSchool(supabase, data.teacher_id, ctx.schoolId);
  await assertClassInSchool(supabase, data.class_id, ctx.schoolId);
  return insertRecord(supabase, "class_teachers", {
    teacher_id: data.teacher_id,
    class_id: data.class_id,
    role: data.role || "primary",
    school_id: ctx.schoolId,
    is_active: true,
  });
}

async function assignTeacherToSubject(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  await assertTeacherInSchool(supabase, data.teacher_id, ctx.schoolId);
  await assertSubjectInSchool(supabase, data.subject_id, ctx.schoolId);
  await assertClassInSchool(supabase, data.class_id, ctx.schoolId);
  return insertRecord(supabase, "teacher_subjects", {
    teacher_id: data.teacher_id,
    subject_id: data.subject_id,
    class_id: data.class_id,
    school_id: ctx.schoolId,
  });
}

async function publishResults(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  // Publish results for a class by setting published flags
  const { data: results, error } = await supabase
    .from("term_results")
    .update({ published: true, published_at: new Date().toISOString() })
    .eq("school_id", ctx.schoolId)
    .eq("class_id", data.class_id as string)
    .eq("term_id", data.term_id as string)
    .select("id");

  if (error) throw new Error(`Publish failed: ${error.message}`);
  return { published_count: results?.length || 0 };
}

// ── Super Admin Handlers (no school context) ──────────────

async function createSchool(params: Record<string, unknown>) {
  const supabase = getServiceClient();
  const name = String(params.name || "").trim();
  if (!name) throw new Error("School name is required");
  const email = String(params.email || "").trim();
  if (!email) throw new Error("A school contact email is required");

  const slug =
    String(params.slug || "").trim() ||
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Could not derive a URL slug from the school name — provide one explicitly");
  }

  const asText = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

  // The same path as the Super Admin "Add School" screen: school row,
  // subscription row, and the first admin account. Platform defaults are
  // awaited here so a later step can rely on them existing.
  const { school, adminEmail, adminPassword } = await createSchoolWithAdmin(
    supabase,
    {
      name,
      slug,
      email,
      phone: asText(params.phone),
      address: asText(params.address),
      motto: asText(params.motto),
    },
    { waitForDefaults: true },
  );

  // Credentials first: the receipt caps how many values it shows.
  return {
    admin_email: adminEmail,
    admin_password: adminPassword,
    school_id: school.id,
    name: school.name,
    slug: school.slug,
    abbreviation: school.abbreviation,
  };
}

async function updateSchool(params: Record<string, unknown>) {
  const supabase = getServiceClient();
  const id = params.school_id as string;
  if (!id) throw new Error("school_id is required");

  // Allow-listed fields only. `subscription_status` in particular is NOT
  // reachable here — the capability's description says so, and now the code
  // agrees with it instead of quietly accepting the field.
  const updates = schoolUpdateFrom(params);
  if (Object.keys(updates).length === 0) {
    throw new Error("Nothing to update: expected one of name, email, phone, address");
  }

  const { data, error } = await supabase
    .from("schools")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(`School update failed: ${error.message}`);
  return data;
}

async function listAllSchools(params: Record<string, unknown>) {
  const supabase = getServiceClient();
  let query = supabase.from("schools").select("*");

  if (params.archived === "true") {
    query = query.eq("is_archived", true);
  } else {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`List schools failed: ${error.message}`);
  return data || [];
}

async function provisionAdmin(params: Record<string, unknown>) {
  const supabase = getServiceClient();
  const schoolId = typeof params.school_id === "string" ? params.school_id : undefined;

  const hasAdmin = async (id: string) => {
    const { count } = await supabase
      .from("school_admins")
      .select("*", { count: "exact", head: true })
      .eq("school_id", id);
    return (count ?? 0) > 0;
  };

  if (schoolId) {
    const { data: school } = await supabase
      .from("schools")
      .select("id, name, slug")
      .eq("id", schoolId)
      .maybeSingle();
    if (!school) throw new Error("School not found");
    if (await hasAdmin(school.id)) {
      return { school_id: school.id, already_had_admin: true };
    }
    const admin = await provisionAdminForSchool(supabase, school);
    return { school_id: school.id, admin_email: admin.email, admin_password: admin.password };
  }

  // No school given: every school that is missing one.
  const { data: schools, error } = await supabase.from("schools").select("id, name, slug");
  if (error) throw new Error(`Could not list schools: ${error.message}`);

  const results: { school_id: string; admin_email: string; admin_password: string }[] = [];
  for (const school of schools ?? []) {
    if (await hasAdmin(school.id)) continue;
    const admin = await provisionAdminForSchool(supabase, school);
    results.push({ school_id: school.id, admin_email: admin.email, admin_password: admin.password });
  }
  return { provisioned_count: results.length, provisioned: results };
}

// ── Helpers ────────────────────────────────────────────────

async function insertRecord(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  data: Record<string, unknown>,
) {
  const { data: result, error } = await supabase
    .from(table)
    .insert(data)
    .select("*")
    .single();

  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  return result;
}

async function updateRecord(
  supabase: ReturnType<typeof getServiceClient>,
  table: string,
  data: Record<string, unknown>,
  ctx: ExecutionContext,
) {
  const { id, ...updates } = data;
  if (!id) throw new Error("id is required for update");

  const { data: result, error } = await supabase
    .from(table)
    .update(updates)
    .eq("id", id as string)
    .eq("school_id", ctx.schoolId)
    .select("*")
    .single();

  if (error) throw new Error(`${table} update failed: ${error.message}`);
  return result;
}

// ── Dependency Resolution ──────────────────────────────────

function topologicalSort(steps: ExecutionStep[]): ExecutionStep[] {
  const sorted: ExecutionStep[] = [];
  const visited = new Set<number>();
  const stepMap = new Map(steps.map((s) => [s.order, s]));

  function visit(order: number) {
    if (visited.has(order)) return;
    visited.add(order);

    const step = stepMap.get(order);
    if (step?.dependsOn) {
      for (const dep of step.dependsOn) {
        if (stepMap.has(dep)) visit(dep);
      }
    }

    if (step) sorted.push(step);
  }

  for (const step of steps) {
    visit(step.order);
  }

  return sorted;
}

function resolveParams(
  params: Record<string, unknown>,
  results: Map<number, StepResult>,
): Record<string, unknown> {
  void results;
  // For now, params are used as-is. Future enhancement: support $ref syntax
  // to reference outputs from previous steps (e.g., $step1.id)
  return params;
}

function buildSummary(
  plan: ExecutionPlan,
  counts: { completed: number; failed: number; unknown: number },
  errors: string[],
): string {
  const total = plan.steps.length;
  const { completed, failed, unknown } = counts;

  if (failed === 0 && unknown === 0) {
    return `✅ All ${completed} operations completed successfully.\n\n${plan.summary}`;
  }

  const parts: string[] = [`⚠️ ${completed}/${total} operation(s) completed.`];
  if (failed > 0) parts.push(`${failed} step(s) FAILED.`);
  if (unknown > 0) {
    parts.push(
      `${unknown} step(s) returned NO authoritative result — treat their outcome as UNKNOWN, not success.`,
    );
  }
  if (errors.length > 0) {
    parts.push(`\n${errors.map((e) => `- ${e}`).join("\n")}`);
  }
  return `${parts.join(" ")}\n\n${plan.summary}`;
}
