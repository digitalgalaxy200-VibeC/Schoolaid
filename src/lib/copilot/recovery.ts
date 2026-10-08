/**
 * Recovery — what to do with an operation that got stranded.
 *
 * WHY THIS EXISTS
 * ---------------
 * If the process dies mid-execution, the operation is left in `executing` and
 * its in-flight step in `running`, forever. Before this module the state simply
 * rotted: nobody re-drove it, and the panel kept showing a spinner.
 *
 * The honest resolution is NOT to retry blindly and NOT to call it completed —
 * it is to mark the unknown parts `unknown`. We do not know whether those
 * dispatches landed, and saying otherwise would be the exact lie P0 removed.
 *
 * `isStranded` is pure (and tested); `recoverStrandedOperations` performs the
 * database sweep.
 */

import { getServiceClient } from "@/lib/supabase/service";
import { logAudit } from "./audit-logger";

/** How long an operation may sit in `executing` before it counts as stranded. */
export const DEFAULT_STRAND_THRESHOLD_MS = 10 * 60 * 1000;

/** Step states that mean "dispatched or about to be, with no result yet". */
export const STRANDED_STEP_STATUSES = ["pending", "running"] as const;

/**
 * True when an operation has been in `executing` past the threshold. An
 * operation with no `started_at` cannot be aged, so it is treated as stranded
 * — a comfortable assumption wastes nothing, whereas the opposite leaves a
 * spinner forever.
 */
export function isStranded(
  status: string,
  startedAt: string | null | undefined,
  nowMs: number,
  thresholdMs: number = DEFAULT_STRAND_THRESHOLD_MS,
): boolean {
  if (status !== "executing") return false;
  if (!startedAt) return true;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return true;
  return nowMs - started > thresholdMs;
}

export interface RecoverySummary {
  recovered: number;
  recoveredOperationIds: string[];
}

/**
 * Sweep operations stranded in `executing`: mark their in-flight steps
 * `unknown`, and the operation `unknown`. Never `completed`.
 */
export async function recoverStrandedOperations(
  options: { olderThanMs?: number; nowMs?: number } = {},
): Promise<RecoverySummary> {
  const threshold = options.olderThanMs ?? DEFAULT_STRAND_THRESHOLD_MS;
  const nowMs = options.nowMs ?? Date.now();

  const supabase = getServiceClient();

  const { data: ops, error } = await supabase
    .from("copilot_operations")
    .select("*")
    .eq("status", "executing");

  if (error) throw new Error(`Could not list executing operations: ${error.message}`);

  const recoveredOperationIds: string[] = [];
  const completedAt = new Date(nowMs).toISOString();

  for (const op of ops ?? []) {
    if (!isStranded(op.status, op.started_at, nowMs, threshold)) continue;

    await supabase
      .from("copilot_operation_steps")
      .update({
        status: "unknown",
        error_message:
          "Recovered: the operation was stranded and no authoritative result was received.",
        completed_at: completedAt,
      })
      .eq("operation_id", op.id)
      .in("status", STRANDED_STEP_STATUSES as unknown as string[]);

    await supabase
      .from("copilot_operations")
      .update({ status: "unknown", completed_at: completedAt })
      .eq("id", op.id);

    await logAudit({
      schoolId: op.school_id ?? null,
      superAdminId: op.super_admin_id,
      operationId: op.id,
      action: "operation_recovered_unknown",
      details: { threshold_ms: threshold },
    });

    recoveredOperationIds.push(op.id);
  }

  return { recovered: recoveredOperationIds.length, recoveredOperationIds };
}
