import { describe, it, expect } from "vitest";
import { MAX_IMPORT_PAGES, parseImportedDraft, readImportContext } from "../ai-import";

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

describe("readImportContext — the page-import form's context", () => {
  const CLASS = "512e51a1-b9c1-4682-ba3b-b4bf34d262ec";
  const SUBJECT = "5fabda1e-2c76-4e5c-a2c4-18f2c7f9d001";

  it("reads the form's own class_id and subject_id fields", () => {
    // The regression this pins: the values used to be validated under the
    // wrong key (a `{ v: … }` wrapper asked for by `class_id`), so an upload
    // with a perfectly good context was refused as missing it — every
    // PDF/photo import failed before it could reach the model.
    const form = new FormData();
    form.append("class_id", CLASS);
    form.append("subject_id", SUBJECT);
    const { classId, subjectId, errors } = readImportContext(form);
    expect(classId).toBe(CLASS);
    expect(subjectId).toBe(SUBJECT);
    expect(errors.ok).toBe(true);
  });

  it("reports an absent context as 'is required'", () => {
    const { classId, subjectId, errors } = readImportContext(new FormData());
    expect(classId).toBeNull();
    expect(subjectId).toBeNull();
    expect(errors.summary()).toBe("class_id: is required; subject_id: is required");
  });

  it("reports a malformed context precisely, not as missing", () => {
    const form = new FormData();
    form.append("class_id", "not-a-uuid");
    form.append("subject_id", SUBJECT);
    const { classId, errors } = readImportContext(form);
    expect(classId).toBeNull();
    expect(errors.summary()).toBe("class_id: must be a valid id");
  });
});
