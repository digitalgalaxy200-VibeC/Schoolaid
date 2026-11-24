import { describe, expect, it } from "vitest";
import { bursarRefusal, loadFinanceRole, mayChangeLedger, mayRecordPayments } from "../permissions";

/**
 * A bursar takes money and reads reports. They must not be able to change what
 * the ledger means — void, recalculate, waive, or rewrite fee setup.
 *
 * These tests pin the capability table, and the fail-open rule: an account with
 * no role (or a database without the column yet) is a full admin, so shipping
 * this code before the migration changes nothing.
 */
describe("finance capabilities", () => {
  it("only an admin may change the ledger", () => {
    expect(mayChangeLedger("admin")).toBe(true);
    expect(mayChangeLedger("bursar")).toBe(false);
  });

  it("both may record payments", () => {
    expect(mayRecordPayments("admin")).toBe(true);
    expect(mayRecordPayments("bursar")).toBe(true);
  });
});

describe("loadFinanceRole", () => {
  it("treats a missing account as admin rather than failing", async () => {
    expect(await loadFinanceRole(null)).toBe("admin");
  });
});

describe("bursarRefusal", () => {
  it("names the action and points at who can do it", async () => {
    const res = bursarRefusal("void a payment");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("bursar_not_allowed");
    expect(body.error).toContain("void a payment");
    expect(body.error).toContain("school administrator");
  });
});
