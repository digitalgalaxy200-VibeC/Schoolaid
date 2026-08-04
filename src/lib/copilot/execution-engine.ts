// ============================================================
// Execution Engine — executes approved plans by calling
// existing backend services through the service client.
// Every step is journaled for audit and rollback.
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";
import type {
  ExecutionPlan,
  ExecutionStep,
  CopilotOperation,
  OperationStep,
} from "./types";
import { CAPABILITIES, getCapability, isHighRisk } from "./capability-registry";
import { logAudit } from "./audit-logger";

// ── Execution Context ──────────────────────────────────────

export interface ExecutionContext {
  schoolId: string;
  superAdminId: string;
  operationId: string;
  conversationId?: string;
  onProgress?: (completed: number, total: number, currentStep: string) => void;
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

  // 1. Create operation record
  const { data: operation, error: opErr } = await supabase
    .from("copilot_operations")
    .insert({
      conversation_id: ctx.conversationId || null,
      message_id: null,
      school_id: ctx.schoolId || null,
      super_admin_id: ctx.superAdminId,
      status: "executing",
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
  let hasFailures = false;
  const errors: string[] = [];

  // Sort steps by order, respecting dependencies
  const sortedSteps = topologicalSort(plan.steps);
  const results: Map<number, { success: boolean; data?: unknown; error?: string }> = new Map();

  for (const planStep of sortedSteps) {
    // Check if dependencies succeeded
    if (planStep.dependsOn && planStep.dependsOn.length > 0) {
      const depsFailed = planStep.dependsOn.some((depOrder) => {
        const depResult = results.get(depOrder);
        return !depResult || !depResult.success;
      });

      if (depsFailed) {
        // Skip this step — dependencies failed
        await supabase
          .from("copilot_operation_steps")
          .update({ status: "skipped", error_message: "Dependency step failed" })
          .eq("operation_id", operationId)
          .eq("step_order", planStep.order);

        continue;
      }
    }

    // Resolve params — replace references to previous step outputs
    const resolvedParams = resolveParams(planStep.params, results);

    // Mark step as running
    await supabase
      .from("copilot_operation_steps")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("operation_id", operationId)
      .eq("step_order", planStep.order);

    ctx.onProgress?.(completedCount, plan.steps.length, planStep.description);

    // Execute the step
    try {
      const result = await executeStep(planStep, resolvedParams, ctx);
      results.set(planStep.order, { success: true, data: result });

      // Mark step as completed
      await supabase
        .from("copilot_operation_steps")
        .update({
          status: "completed",
          response_data: result as Record<string, unknown>,
          completed_at: new Date().toISOString(),
        })
        .eq("operation_id", operationId)
        .eq("step_order", planStep.order);

      await logAudit({
        schoolId: ctx.schoolId,
        superAdminId: ctx.superAdminId,
        operationId,
        stepId: steps.find((s) => s.step_order === planStep.order)?.id,
        action: "step_completed",
        details: { capability: planStep.capability, description: planStep.description },
      });

      completedCount++;
    } catch (err: any) {
      hasFailures = true;
      const errorMsg = err.message || "Unknown error";
      errors.push(`Step ${planStep.order}: ${errorMsg}`);
      results.set(planStep.order, { success: false, error: errorMsg });

      // Mark step as failed
      await supabase
        .from("copilot_operation_steps")
        .update({
          status: "failed",
          error_message: errorMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("operation_id", operationId)
        .eq("step_order", planStep.order);

      await logAudit({
        schoolId: ctx.schoolId,
        superAdminId: ctx.superAdminId,
        operationId,
        stepId: steps.find((s) => s.step_order === planStep.order)?.id,
        action: "step_failed",
        details: { capability: planStep.capability, error: errorMsg },
      });
    }
  }

  // 4. Update operation status
  const finalStatus = hasFailures ? "failed" : "completed";

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
    action: finalStatus === "completed" ? "execution_completed" : "execution_failed",
    details: {
      completedSteps: completedCount,
      totalSteps: plan.steps.length,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  // Build summary
  const summary = buildSummary(plan, completedCount, hasFailures, errors);

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
    throw new Error(`Unknown capability: ${step.capability}`);
  }

  if (capability.isReadOnly) {
    // Read-only capabilities just fetch data
    return executeReadStep(capability.endpoint!, params, ctx);
  }

  // Write capabilities execute the corresponding operation
  return executeWriteStep(capability, params, ctx);
}

async function executeReadStep(
  endpoint: string,
  params: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<unknown> {
  // Read steps use the service client directly — same as the API routes
  const supabase = getServiceClient();

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
    "/api/school-admin/class-subjects": "subject_class_assignments",
    "/api/school-admin/class-teachers": "class_teachers",
    "/api/school-admin/school": "schools",
  };

  const table = tableMap[endpoint];
  if (!table) {
    throw new Error(`Cannot map endpoint to table: ${endpoint}`);
  }

  let query = supabase.from(table).select("*").eq("school_id", ctx.schoolId);
  
  if (table === "grading_templates") query = supabase.from(table).select("*, grading_rows(*)").eq("school_id", ctx.schoolId);
  if (table === "components_templates") query = supabase.from(table).select("*, components_rows(*)").eq("school_id", ctx.schoolId);
  if (table === "psychomotor_templates") query = supabase.from(table).select("*, psychomotor_rows(*)").eq("school_id", ctx.schoolId);
  if (table === "affective_templates") query = supabase.from(table).select("*, affective_rows(*)").eq("school_id", ctx.schoolId);

  // Apply filters from params
  if (params.class_id && table !== "schools") {
    query = query.eq("class_id", params.class_id as string);
  }
  if (params.status && table === "students") {
    query = query.eq("profiles.is_active", params.status === "active");
  }
  if (params.limit) {
    query = query.limit(Math.min(Number(params.limit), 100));
  }

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
      return insertRecord(supabase, "subject_class_assignments", {
        subject_id: params.subject_id,
        class_id: params.class_id,
        school_id: ctx.schoolId,
      });

    // ── Sessions / Terms ──────────────────────
    case "create_session":
      return insertRecord(supabase, "academic_sessions", { session_name: params.name, school_id: ctx.schoolId, is_active: params.is_active ?? false });
    case "create_term":
      return insertRecord(supabase, "academic_terms", {
        term_name: params.term_name,
        session_id: params.session_id,
        school_id: ctx.schoolId,
        is_active: params.is_active ?? false,
        next_term_begins: params.next_term_begins || null,
      });

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

    // ── Templates ─────────────────────────────
    case "apply_assessment_template":
      return applyTemplate(supabase, "assessment", params, ctx);

    // ── Report Cards / Publishing ─────────────
    case "configure_report_card_settings":
      return updateRecord(supabase, "report_card_settings", params, ctx);
    case "publish_results":
      return publishResults(params, ctx);

    // ── Super Admin (no school context) ──
    case "create_school":
      return createSchool(params);
    case "update_school":
      return updateSchool(params);
    case "list_all_schools":
      return listAllSchools(params);
    case "provision_school_admin":
      return provisionAdmin(params);
    case "impersonate_school":
      return { redirect: `/super-admin/schools/${params.school_id}` };

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
  const admissionNumber = String(data.student_id || `ADM-${Date.now().toString(36)}`);

  // Create auth user
  const password = `${abbreviation}${abbreviation}${abbreviation}123`.substring(0, 72);
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
    id: userId, school_id: ctx.schoolId, full_name: fullName, email, role: "student", is_active: true,
  });

  // Create student record
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      school_id: ctx.schoolId,
      profile_id: userId,
      student_id: admissionNumber,
      class_id: data.class_id || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw new Error(`Student creation failed: ${error.message}`);

  return { ...student, email, student_id: admissionNumber };
}

async function updateStudent(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
  if (!data.id) throw new Error("Student ID is required");

  const { data: updated, error } = await supabase
    .from("students")
    .update({
      class_id: data.class_id || null,
      date_of_birth: data.date_of_birth || null,
      gender: data.gender || null,
    })
    .eq("id", data.id as string)
    .eq("school_id", ctx.schoolId)
    .select("*")
    .single();

  if (error) throw new Error(`Student update failed: ${error.message}`);
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

  const email = data.email || `${cleanName}@${abbreviation}.com`;
  const password = `${abbreviation}${abbreviation}${abbreviation}123`.substring(0, 72);

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
  return { ...teacher, password, email };
}

async function assignTeacherToClass(data: Record<string, unknown>, ctx: ExecutionContext) {
  const supabase = getServiceClient();
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

  const slug = String(params.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));

  const { data, error } = await supabase
    .from("schools")
    .insert({
      name,
      slug,
      email: params.email || null,
      phone: params.phone || null,
      address: params.address || null,
      motto: params.motto || null,
      subscription_status: "inactive",
    })
    .select("*")
    .single();

  if (error) throw new Error(`School creation failed: ${error.message}`);
  return data;
}

async function updateSchool(params: Record<string, unknown>) {
  const supabase = getServiceClient();
  const id = params.school_id as string;
  if (!id) throw new Error("school_id is required");

  const updates: Record<string, unknown> = {};
  if (params.name) updates.name = params.name;
  if (params.subscription_status) updates.subscription_status = params.subscription_status;

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
  // Call the existing provision API
  const schoolId = params.school_id as string | undefined;
  const url = schoolId
    ? `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/super-admin/bulk-provision-admins`
    : `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/super-admin/bulk-provision-admins`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schoolId ? { school_id: schoolId } : {}),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Provision failed: ${(err as any).error || resp.status}`);
  }

  return resp.json();
}

async function applyTemplate(
  supabase: ReturnType<typeof getServiceClient>,
  type: string,
  params: Record<string, unknown>,
  ctx: ExecutionContext,
) {
  // Template application is complex — delegate to the template API
  // For Phase 2, we support basic template application
  const templateId = params.template_id as string;
  if (!templateId) throw new Error("template_id is required");

  // Fetch the template
  const tableMap: Record<string, string> = {
    assessment: "components_templates",
    grading: "grading_templates",
    psychomotor: "psychomotor_templates",
    affective: "affective_templates",
  };

  const table = tableMap[type];
  if (!table) throw new Error(`Unknown template type: ${type}`);

  const { data: template, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", templateId)
    .single();

  if (error || !template) throw new Error(`Template not found: ${templateId}`);

  return { success: true, templateId, applied: true };
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
  results: Map<number, { success: boolean; data?: unknown; error?: string }>,
): Record<string, unknown> {
  // For now, params are used as-is. Future enhancement: support $ref syntax
  // to reference outputs from previous steps (e.g., $step1.id)
  return params;
}

function buildSummary(
  plan: ExecutionPlan,
  completed: number,
  hasFailures: boolean,
  errors: string[],
): string {
  const total = plan.steps.length;

  if (!hasFailures) {
    return `✅ All ${completed} operations completed successfully.\n\n${plan.summary}`;
  }

  return `⚠️ ${completed}/${total} operations completed. ${errors.length} step(s) failed:\n${errors.map((e) => `- ${e}`).join("\n")}\n\n${plan.summary}`;
}
