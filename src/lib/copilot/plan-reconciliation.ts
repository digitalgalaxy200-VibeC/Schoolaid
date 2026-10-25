// ============================================================
// Plan status reconciliation
//
// A message's `plan_status` is written three times: `pending` when the plan is
// produced, `executing` when it is approved, and the outcome when execution
// returns. The last write can be lost — the serverless function can be cut
// short, the tab can close mid-approval, or the update itself can fail. When
// that happens the message stays `pending` forever and reopening the
// conversation offers "Approve & Execute" again for work that already ran.
//
// `copilot_operations` is the record of what actually happened, so it is the
// source of truth. Before history is returned, an open plan whose operation has
// reached a terminal state inherits that state. A plan with no operation (never
// approved) and an operation that is still running are left exactly as they
// are — reconciliation only ever moves a plan FORWARD out of an open state.
// ============================================================

import { getServiceClient } from "@/lib/supabase/service";
import { logAudit } from "./audit-logger";
import type { CopilotMessage } from "./types";

type PlanStatus = CopilotMessage["plan_status"];

/** Statuses that still claim the plan has not finished. */
export const OPEN_PLAN_STATUSES = new Set<string>(["pending", "approved", "executing"]);

/** Statuses that mean execution began but has not finished. */
const IN_FLIGHT_OPERATION_STATUSES = new Set<string>([
  "pending",
  "approved",
  "executing",
]);

export interface OperationSnapshot {
  id: string;
  message_id: string | null;
  conversation_id: string;
  status: string;
  plan_summary: string | null;
  started_at: string | null;
}

/**
 * The plan status an operation's terminal status implies. `null` means "not
 * terminal — say nothing": a running operation must not be described as an
 * outcome, and `unknown` is never promoted to `completed`.
 */
export function planStatusForOperation(status: string): PlanStatus | null {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "unknown":
      return "unknown";
    // The plan ran and the whole operation was then undone. It must not offer
    // approval again; `completed` is the only truthful value the column accepts
    // (there is no `rolled_back` plan status).
    case "rolled_back":
      return "completed";
    default:
      return null;
  }
}

function timeOf(value: string | null): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function latest(operations: OperationSnapshot[]): OperationSnapshot | null {
  if (operations.length === 0) return null;
  return operations.reduce((best, current) =>
    timeOf(current.started_at) >= timeOf(best.started_at) ? current : best,
  );
}

/** The summary text stored on the message's plan, if there is one. */
function planSummaryText(message: CopilotMessage): string | null {
  const summary = (message.plan_summary as { summary?: unknown } | null)?.summary;
  return typeof summary === "string" ? summary : null;
}

/**
 * The operation that carried out this message's plan, if any.
 *
 * Rows written before `message_id` was persisted are matched on the plan they
 * executed: same conversation, same summary text, started at or after the
 * message was written. The timestamp guard is what stops a NEW pending plan
 * that repeats an old summary from inheriting the OLD operation's outcome.
 */
export function findOperationFor(
  message: CopilotMessage,
  operations: OperationSnapshot[],
): OperationSnapshot | null {
  const byMessage = latest(
    operations.filter((op) => op.message_id !== null && op.message_id === message.id),
  );
  if (byMessage) return byMessage;

  const summary = planSummaryText(message);
  if (!summary) return null;

  const wroteAt = timeOf(message.created_at);
  if (Number.isNaN(wroteAt)) return null;

  return latest(
    operations.filter((op) => {
      if (op.message_id) return false;
      if (op.conversation_id !== message.conversation_id) return false;
      if (op.plan_summary !== summary) return false;
      const startedAt = timeOf(op.started_at);
      if (Number.isNaN(startedAt)) return false;
      return startedAt >= wroteAt;
    }),
  );
}

/**
 * Pure reconciliation: returns the messages with any open plan corrected to the
 * outcome of the operation that ran it. Messages that disagree with nothing are
 * returned untouched (same object, so callers can diff by identity).
 */
export function reconcilePlanStatuses(
  messages: CopilotMessage[],
  operations: OperationSnapshot[],
): CopilotMessage[] {
  if (operations.length === 0) return messages;

  return messages.map((message) => {
    if (!message.has_plan || !message.plan_status) return message;
    if (!OPEN_PLAN_STATUSES.has(message.plan_status)) return message;

    const operation = findOperationFor(message, operations);
    if (!operation) return message;

    const next = planStatusForOperation(operation.status);
    if (!next || next === message.plan_status) return message;

    return { ...message, plan_status: next };
  });
}

/**
 * Read a conversation's operations and repair message statuses that disagree
 * with them. The corrected messages are returned even if persisting the fix
 * fails — the operator must never be shown a finished plan as approvable
 * because of a write error.
 */
export async function reconcileConversationPlanStatuses(
  conversationId: string,
  messages: CopilotMessage[],
): Promise<CopilotMessage[]> {
  const needsCheck = messages.some(
    (m) => m.has_plan && m.plan_status !== null && OPEN_PLAN_STATUSES.has(m.plan_status),
  );
  if (!needsCheck) return messages;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("copilot_operations")
    .select("id, message_id, conversation_id, status, plan_summary, started_at")
    .eq("conversation_id", conversationId);

  if (error) {
    console.error("[copilot] could not load operations for reconciliation:", error.message);
    return messages;
  }

  const reconciled = reconcilePlanStatuses(
    messages,
    (data || []) as OperationSnapshot[],
  );

  await Promise.all(
    reconciled.map(async (message, index) => {
      if (message === messages[index]) return;
      const { error: updateError } = await supabase
        .from("copilot_messages")
        .update({ plan_status: message.plan_status })
        .eq("id", message.id);
      if (updateError) {
        console.error(
          `[copilot] could not persist reconciled plan status for ${message.id}:`,
          updateError.message,
        );
      }
    }),
  );

  return reconciled;
}

/**
 * Called when approval started but execution threw.
 *
 * An operation row exists only after the plan passed validation and execution
 * began. If there is one, its outcome was never established — the plan is
 * `unknown` (never `failed`, and never silently `completed`). If there is none,
 * nothing ran, so the plan goes back to `pending` and can be retried or
 * cancelled instead of vanishing.
 */
export async function settleInterruptedExecution(params: {
  messageId?: string | null;
  schoolId: string | null | undefined;
  superAdminId: string;
  reason: string;
}): Promise<void> {
  const messageId = params.messageId;
  if (!messageId) return;

  const supabase = getServiceClient();

  const { data: operations } = await supabase
    .from("copilot_operations")
    .select("id, status, started_at")
    .eq("message_id", messageId)
    .order("started_at", { ascending: false });

  const rows = (operations || []) as { id: string; status: string; started_at: string | null }[];
  const inFlight = rows.find((op) => IN_FLIGHT_OPERATION_STATUSES.has(op.status));

  if (!inFlight) {
    const { error } = await supabase
      .from("copilot_messages")
      .update({ plan_status: "pending" })
      .eq("id", messageId);
    if (error) {
      console.error(
        `[copilot] could not restore pending plan ${messageId}:`,
        error.message,
      );
    }
    return;
  }

  const { error: opError } = await supabase
    .from("copilot_operations")
    .update({ status: "unknown", completed_at: new Date().toISOString() })
    .eq("id", inFlight.id);
  if (opError) {
    console.error(
      `[copilot] could not mark operation ${inFlight.id} unknown:`,
      opError.message,
    );
  }

  const { error: messageError } = await supabase
    .from("copilot_messages")
    .update({ plan_status: "unknown" })
    .eq("id", messageId);
  if (messageError) {
    console.error(
      `[copilot] could not mark plan ${messageId} unknown:`,
      messageError.message,
    );
  }

  await logAudit({
    schoolId: params.schoolId,
    superAdminId: params.superAdminId,
    operationId: inFlight.id,
    action: "execution_unknown",
    resultStatus: "unknown",
    error: params.reason,
    details: { messageId },
  });
}
