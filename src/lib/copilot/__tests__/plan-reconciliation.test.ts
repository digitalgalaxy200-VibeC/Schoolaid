import { describe, it, expect } from "vitest";
import {
  OPEN_PLAN_STATUSES,
  findOperationFor,
  planStatusForOperation,
  reconcilePlanStatuses,
  type OperationSnapshot,
} from "../plan-reconciliation";
import type { CopilotMessage } from "../types";

/**
 * The regression this pins: a plan the operator approved and that already ran
 * came back as "Awaiting Approval" after leaving and reopening the panel. The
 * status write is a cache of `copilot_operations`; when it is lost, history must
 * be reconciled from the operation record instead of re-offering the plan.
 */

const message = (over: Partial<CopilotMessage> = {}): CopilotMessage => ({
  id: "msg_1",
  conversation_id: "conv_1",
  role: "assistant",
  content: "Here is the plan.",
  has_plan: true,
  plan_status: "pending",
  plan_summary: {
    summary: "Create Basic 1",
    steps: [],
    estimatedOperations: 1,
    mode: "operations",
  },
  created_at: "2026-10-20T10:00:00.000Z",
  ...over,
});

const operation = (over: Partial<OperationSnapshot> = {}): OperationSnapshot => ({
  id: "op_1",
  message_id: "msg_1",
  conversation_id: "conv_1",
  status: "completed",
  plan_summary: "Create Basic 1",
  started_at: "2026-10-20T10:00:30.000Z",
  ...over,
});

describe("planStatusForOperation", () => {
  it("maps terminal operation states to plan states", () => {
    expect(planStatusForOperation("completed")).toBe("completed");
    expect(planStatusForOperation("failed")).toBe("failed");
    expect(planStatusForOperation("unknown")).toBe("unknown");
  });

  it("treats a rolled-back operation as finished, never as approvable", () => {
    // There is no `rolled_back` plan status; what matters is that it is no
    // longer open.
    expect(planStatusForOperation("rolled_back")).toBe("completed");
  });

  it("says nothing about an operation that is still running", () => {
    expect(planStatusForOperation("executing")).toBeNull();
    expect(planStatusForOperation("pending")).toBeNull();
    expect(planStatusForOperation("approved")).toBeNull();
  });

  it("never promotes unknown to completed", () => {
    expect(planStatusForOperation("unknown")).not.toBe("completed");
  });
});

describe("reconcilePlanStatuses", () => {
  it("does not bring back a plan whose operation completed", () => {
    const [result] = reconcilePlanStatuses([message()], [operation()]);
    expect(result.plan_status).toBe("completed");
  });

  it("carries a failed outcome across", () => {
    const [result] = reconcilePlanStatuses([message()], [operation({ status: "failed" })]);
    expect(result.plan_status).toBe("failed");
  });

  it("carries an unknown outcome across", () => {
    const [result] = reconcilePlanStatuses([message()], [operation({ status: "unknown" })]);
    expect(result.plan_status).toBe("unknown");
  });

  it("repairs a message stuck at `executing` too", () => {
    const [result] = reconcilePlanStatuses(
      [message({ plan_status: "executing" })],
      [operation()],
    );
    expect(result.plan_status).toBe("completed");
  });

  it("leaves a genuinely unattempted plan pending", () => {
    const original = message();
    const [result] = reconcilePlanStatuses([original], []);
    expect(result).toBe(original);
    expect(result.plan_status).toBe("pending");
  });

  it("leaves a plan pending while its operation is still running", () => {
    const original = message();
    const [result] = reconcilePlanStatuses(
      [original],
      [operation({ status: "executing" })],
    );
    expect(result).toBe(original);
    expect(result.plan_status).toBe("pending");
  });

  it("never overwrites a cancelled or already-finished plan", () => {
    const cancelled = message({ plan_status: "cancelled" });
    const completed = message({ id: "msg_2", plan_status: "completed" });
    const result = reconcilePlanStatuses(
      [cancelled, completed],
      [operation(), operation({ id: "op_2", message_id: "msg_2", status: "failed" })],
    );
    expect(result).toEqual([cancelled, completed]);
  });

  it("ignores messages that only quote a plan without having one", () => {
    const quote = message({ has_plan: false });
    const [result] = reconcilePlanStatuses([quote], [operation()]);
    expect(result).toBe(quote);
  });

  it("open statuses are exactly pending, approved and executing", () => {
    expect([...OPEN_PLAN_STATUSES].sort()).toEqual(["approved", "executing", "pending"]);
  });
});

describe("findOperationFor — legacy rows without message_id", () => {
  it("matches on the plan summary when it started after the message", () => {
    const op = operation({ message_id: null });
    expect(findOperationFor(message(), [op])?.id).toBe("op_1");
  });

  it("does not match an operation that started BEFORE a newer plan with the same summary", () => {
    // The operator asked for the same thing twice. The first run completed; the
    // second plan is still untouched and must stay approvable.
    const newer = message({
      id: "msg_2",
      created_at: "2026-10-20T12:00:00.000Z",
    });
    const olderOp = operation({
      message_id: null,
      started_at: "2026-10-20T10:00:30.000Z",
    });
    expect(findOperationFor(newer, [olderOp])).toBeNull();
    expect(reconcilePlanStatuses([newer], [olderOp])[0].plan_status).toBe("pending");
  });

  it("does not match on a different summary", () => {
    const op = operation({ message_id: null, plan_summary: "Create Basic 2" });
    expect(findOperationFor(message(), [op])).toBeNull();
  });

  it("prefers an exact message_id match over a summary match", () => {
    const legacy = operation({ id: "op_legacy", message_id: null, status: "failed" });
    const exact = operation({ id: "op_exact", message_id: "msg_1", status: "completed" });
    expect(findOperationFor(message(), [legacy, exact])?.id).toBe("op_exact");
  });

  it("picks the newest operation when a plan was approved twice", () => {
    const first = operation({ id: "op_1", status: "failed", started_at: "2026-10-20T10:00:30.000Z" });
    const second = operation({ id: "op_2", status: "completed", started_at: "2026-10-20T10:05:00.000Z" });
    expect(findOperationFor(message(), [first, second])?.id).toBe("op_2");
  });

  it("ignores legacy operations from another conversation", () => {
    const op = operation({ message_id: null, conversation_id: "conv_other" });
    expect(findOperationFor(message(), [op])).toBeNull();
  });
});
