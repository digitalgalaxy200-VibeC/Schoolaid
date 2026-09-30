import { describe, it, expect } from "vitest";
import { MAX_IMPORT_PAGES, parseImportedDraft } from "../ai-import";

const reply = (questions: unknown[]) =>
  JSON.stringify({ sections: [], questions, warnings: [] });

const mcq = (over: Record<string, unknown> = {}) => ({
  question_type: "mcq",
  question_text: "What is 5 × 4?",
  options: ["10", "15", "20", "25"],
  correct_index: 2,
  marks: 1,
  ...over,
});

describe("parseImportedDraft — media hints", () => {
  it("reads needs_image and source_page from the reply", () => {
    const parsed = parseImportedDraft(
      reply([mcq({ needs_image: true, source_page: 3 })]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.questions[0].needs_image).toBe(true);
    expect(parsed.draft.questions[0].source_page).toBe(3);
  });

  it("defaults to no image hint when the model said nothing", () => {
    const parsed = parseImportedDraft(reply([mcq()]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.questions[0].needs_image).toBe(false);
    expect(parsed.draft.questions[0].source_page).toBeNull();
  });

  it("refuses an out-of-range or non-numeric source_page", () => {
    const parsed = parseImportedDraft(
      reply([
        mcq({ source_page: MAX_IMPORT_PAGES + 1 }),
        mcq({ source_page: "first" }),
        mcq({ source_page: 0 }),
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const q of parsed.draft.questions) expect(q.source_page).toBeNull();
  });

  it("accepts the string 'true' for needs_image (lenient)", () => {
    const parsed = parseImportedDraft(reply([mcq({ needs_image: "true" })]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.questions[0].needs_image).toBe(true);
  });
});

describe("parseImportedDraft — core contract unchanged", () => {
  it("rejects a reply with no questions", () => {
    const parsed = parseImportedDraft(reply([]));
    expect(parsed.ok).toBe(false);
  });

  it("skips an mcq with fewer than two options and reports it", () => {
    const parsed = parseImportedDraft(reply([mcq({ options: ["only one"] })]));
    expect(parsed.ok).toBe(false); // nothing usable left
  });

  it("still reads sections and instructions", () => {
    const parsed = parseImportedDraft(
      JSON.stringify({
        sections: [{ label: "Section A", instruction: "Answer all questions." }],
        questions: [mcq({ section: "Section A" })],
        warnings: [],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.draft.sections).toEqual([
      { label: "Section A", instruction: "Answer all questions." },
    ]);
  });
});
