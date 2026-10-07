import { describe, it, expect } from "vitest";
import { formatMessageBlocks, stripJsonBlocks } from "../message-format";

/**
 * Gwin's replies are markdown-ish prose, and they used to reach the screen with
 * their `**` and `###` intact. These tests pin the small set of shapes a reply
 * actually uses, and — more importantly — that nothing is silently dropped:
 * an unrecognised line must survive as text.
 */

describe("stripJsonBlocks", () => {
  it("removes a fenced plan and keeps the prose around it", () => {
    const content = "Here is the plan:\n\n```json\n{\"plan\":{\"steps\":[]}}\n```\n\nApprove to continue.";
    const stripped = stripJsonBlocks(content);
    expect(stripped).not.toContain('"plan"');
    expect(stripped).not.toContain("```");
    expect(stripped).toContain("Approve to continue.");
  });

  it("removes a reads block too", () => {
    const content = "Looking that up now.\n\n```json\n{\"reads\":[{\"capability\":\"list_classes\"}]}\n```";
    expect(stripJsonBlocks(content)).toBe("Looking that up now.");
  });
});

describe("formatMessageBlocks", () => {
  it("returns nothing for a reply that was only a plan", () => {
    expect(formatMessageBlocks("```json\n{\"plan\":{\"steps\":[]}}\n```")).toEqual([]);
  });

  it("makes paragraphs, joining wrapped lines", () => {
    expect(formatMessageBlocks("First line\ncontinues here.\n\nSecond paragraph.")).toEqual([
      { type: "paragraph", text: "First line continues here." },
      { type: "paragraph", text: "Second paragraph." },
    ]);
  });

  it("reads headings at all three levels", () => {
    expect(formatMessageBlocks("# One\n## Two\n### Three")).toEqual([
      { type: "heading", level: 1, text: "One" },
      { type: "heading", level: 2, text: "Two" },
      { type: "heading", level: 3, text: "Three" },
    ]);
  });

  it("groups bullets into one list and leaves the bold markers for the renderer", () => {
    expect(formatMessageBlocks("- **Classes**: 12\n- Teachers: 24\n\nDone.")).toEqual([
      { type: "list", ordered: false, items: ["**Classes**: 12", "Teachers: 24"] },
      { type: "paragraph", text: "Done." },
    ]);
  });

  it("groups numbered items into an ordered list", () => {
    expect(formatMessageBlocks("1. Read the block\n2. Change the heading\n3. Approve")).toEqual([
      { type: "list", ordered: true, items: ["Read the block", "Change the heading", "Approve"] },
    ]);
  });

  it("does not confuse a divider with a bullet", () => {
    expect(formatMessageBlocks("Before\n\n---\n\nAfter")).toEqual([
      { type: "paragraph", text: "Before" },
      { type: "divider" },
      { type: "paragraph", text: "After" },
    ]);
  });

  it("reads a pipe table, but only when its separator row is there", () => {
    const table = "| Item | Amount |\n|---|---|\n| Tuition | ₦30,000 |\n| Uniform | ₦15,000 |";
    expect(formatMessageBlocks(table)).toEqual([
      {
        type: "table",
        headers: ["Item", "Amount"],
        rows: [
          ["Tuition", "₦30,000"],
          ["Uniform", "₦15,000"],
        ],
      },
    ]);

    // Without the separator it is just text that happens to contain pipes.
    const notATable = "| this is prose |";
    expect(formatMessageBlocks(notATable)).toEqual([{ type: "paragraph", text: "| this is prose |" }]);
  });

  it("shows a non-JSON code fence as code", () => {
    expect(formatMessageBlocks("Example:\n\n```\nSELECT 1;\n```")).toEqual([
      { type: "paragraph", text: "Example:" },
      { type: "code", text: "SELECT 1;" },
    ]);
  });

  it("never drops a line it does not understand", () => {
    const odd = ">>> quoted-looking text\n\tindented line";
    expect(formatMessageBlocks(odd)).toEqual([
      { type: "paragraph", text: ">>> quoted-looking text indented line" },
    ]);
  });
});
