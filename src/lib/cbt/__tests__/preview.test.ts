import { describe, it, expect } from "vitest";
import { assemblePreviewQuestions, type PreviewOptionRow } from "../preview";

const q = (over: Partial<Parameters<typeof assemblePreviewQuestions>[0][number]> = {}) => ({
  question_id: "q1",
  question_type: "mcq",
  question_text: "2 + 2 = ?",
  marks: 2,
  marks_override: null as number | null,
  section: null as string | null,
  media_url: null as string | null,
  ...over,
});

const opt = (over: Partial<PreviewOptionRow> = {}): PreviewOptionRow => ({
  id: "o1",
  question_id: "q1",
  label: "A",
  option_text: "4",
  display_order: 0,
  ...over,
});

describe("assemblePreviewQuestions", () => {
  it("keeps the assessment's question order", () => {
    const out = assemblePreviewQuestions(
      [q({ question_id: "first" }), q({ question_id: "second" }), q({ question_id: "third" })],
      [],
    );
    expect(out.map((p) => p.question_id)).toEqual(["first", "second", "third"]);
  });

  it("groups options under their own question, in display order", () => {
    const out = assemblePreviewQuestions(
      [q({ question_id: "q1" }), q({ question_id: "q2" })],
      [
        opt({ id: "b", question_id: "q1", label: "B", option_text: "5", display_order: 1 }),
        opt({ id: "a", question_id: "q1", label: "A", option_text: "4", display_order: 0 }),
        opt({ id: "x", question_id: "q2", label: "A", option_text: "10" }),
      ],
    );
    expect(out[0].options).toEqual([
      { id: "a", label: "A", text: "4" },
      { id: "b", label: "B", text: "5" },
    ]);
    expect(out[1].options).toEqual([{ id: "x", label: "A", text: "10" }]);
  });

  it("prefers the marks override, because that is what the student is marked against", () => {
    const out = assemblePreviewQuestions([q({ marks: 2, marks_override: 5 })], []);
    expect(out[0].marks).toBe(5);
  });

  it("carries the section and the signed media url through", () => {
    const out = assemblePreviewQuestions(
      [q({ section: "Section A", media_url: "https://example.test/signed" })],
      [],
    );
    expect(out[0].section).toBe("Section A");
    expect(out[0].media_url).toBe("https://example.test/signed");
  });

  it("a question with no options (theory, or a removed bank row) still comes through", () => {
    const out = assemblePreviewQuestions([q({ question_type: "theory" })], []);
    expect(out).toHaveLength(1);
    expect(out[0].options).toEqual([]);
  });

  it("has NO field that could carry an answer key", () => {
    // The preview must stay structurally incapable of disclosing the key. If a
    // future field is added here, this test forces it to be a deliberate choice.
    const out = assemblePreviewQuestions([q()], [opt()]);
    expect(Object.keys(out[0]).sort()).toEqual(
      ["marks", "media_url", "options", "question_id", "question_text", "question_type", "section"].sort(),
    );
    expect(Object.keys(out[0].options[0]).sort()).toEqual(["id", "label", "text"]);
  });
});
