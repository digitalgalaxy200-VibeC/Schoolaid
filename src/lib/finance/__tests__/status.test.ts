import { describe, expect, it } from "vitest";
import { accountStatus, billStatusText, workspaceStatusText } from "../status";

/**
 * One vocabulary: Paid · Part-paid · Unpaid. The stored keys never change —
 * only the words a bursar reads.
 */
describe("accountStatus", () => {
  it("reads figures, counting applied credit as money received", () => {
    expect(accountStatus(60000, 0, 0)).toBe("unpaid");
    expect(accountStatus(60000, 25000)).toBe("part_paid");
    expect(accountStatus(60000, 60000)).toBe("paid");
    expect(accountStatus(60000, 10000, 50000)).toBe("paid");
    expect(accountStatus(60000, 0, 25000)).toBe("part_paid");
  });

  it("treats a zero or credit bill as settled, not unpaid", () => {
    expect(accountStatus(0, 0)).toBe("paid");
  });
});

describe("status text", () => {
  it("maps stored bill statuses", () => {
    expect(billStatusText("paid")).toBe("Paid");
    expect(billStatusText("partial")).toBe("Part-paid");
    expect(billStatusText("pending")).toBe("Unpaid");
    expect(billStatusText("unpaid")).toBe("Unpaid");
  });

  it("maps the workspace enum, including COMPLETED", () => {
    expect(workspaceStatusText("PAID")).toBe("Paid");
    expect(workspaceStatusText("COMPLETED")).toBe("Paid");
    expect(workspaceStatusText("PARTIALLY PAID")).toBe("Part-paid");
    expect(workspaceStatusText("NOT PAID")).toBe("Unpaid");
  });

  it("passes an unknown value through instead of hiding it", () => {
    expect(billStatusText("something-new")).toBe("something-new");
  });
});
