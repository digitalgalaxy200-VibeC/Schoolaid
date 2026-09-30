/**
 * AI question import — the extraction contract.
 *
 * The model receives the teacher's pasted exam text (fenced as untrusted data,
 * never as instructions) and returns a JSON object describing sections and
 * questions. NOTHING it returns is written to the database here: the route hands
 * the parsed proposals to a review screen, and only what the teacher approves
 * goes through the ordinary question writer (`createQuestion`).
 *
 * The academic context (class + subject) is chosen by the teacher BEFORE the
 * paste and is never part of the document — the model is told the context, and
 * the server injects the ids, so the model can neither guess nor change them.
 */

import { buildGuardedMessages } from "@/lib/ai/prompt";
import { isPlainObject, parseModelJson } from "@/lib/ai/output";
import type { AiMessage } from "@/lib/ai/types";
import type { QuestionType } from "./questions";

/** A hard cap on one import. A 400-question paste is a review nobody performs. */
export const MAX_IMPORT_QUESTIONS = 100;

export type ImportedSection = { label: string; instruction: string | null };

export type ImportedQuestion = {
  section: string | null;
  question_type: QuestionType;
  question_text: string;
  options: string[];
  /** 0-based index into `options`; null when the document did not say. */
  correct_index: number | null;
  marks: number;
  topic: string | null;
  model_answer: string | null;
};

export type ImportedDraft = {
  sections: ImportedSection[];
  questions: ImportedQuestion[];
  warnings: string[];
};

/** Builds the guarded prompt. Instructions are trusted; only the document is fenced. */
export function buildOrganizeMessages(args: {
  className: string;
  subjectName: string;
  documentText: string;
}): AiMessage[] {
  const instructions = [
    "You organise pasted examination text into a school's question bank for its Computer-Based Testing (CBT) system.",
    `The teacher has already chosen the academic context — class "${args.className}", subject "${args.subjectName}". Do not guess or change it; it is not part of the document.`,
    "",
    "Read the fenced document and extract EVERY question it contains, keeping the original wording (names, currency, notation). Group questions under the document's sections when it has them.",
    "",
    "Rules:",
    '- question_type is "mcq" (lettered/numbered options), "true_false", or "theory" (written answer).',
    '- For "mcq": copy ALL options, in order, into "options"; set "correct_index" to the 0-based position of the correct option. If the document does not state the answer, use null.',
    '- For "true_false": options are ["True","False"] and "correct_index" is 0 for True, 1 for False.',
    '- For "theory": leave options empty; put a model answer in "model_answer" only if the document provides one.',
    '- "marks": the document\'s mark value when stated, otherwise 1.',
    '- "section": the section label exactly as printed ("Section A", "Part 1"), or null when the document has none.',
    "- If the document lists answers separately (an answer key), apply them to the matching questions.",
    "- Never invent questions, options or answers that are not in the document.",
  ].join("\n");

  const outputContract = [
    "Return ONE JSON object and nothing else:",
    "{",
    '  "sections": [ { "label": "Section A", "instruction": "Answer all questions. Choose the correct answer from A-D." } ],',
    '  "questions": [',
    '    { "section": "Section A", "question_type": "mcq", "question_text": "...",',
    '      "options": ["...", "...", "...", "..."], "correct_index": 2,',
    '      "marks": 1, "topic": null, "model_answer": null }',
    "  ],",
    '  "warnings": ["anything you could not organise"]',
    "}",
    "",
    "Every question in the document must appear in \"questions\". Use null for values the document does not provide.",
  ].join("\n");

  return buildGuardedMessages({
    instructions,
    outputContract,
    untrusted: [{ label: "EXAM DOCUMENT", content: args.documentText }],
  });
}

/** True only for a usable answer position. */
function resolveCorrectIndex(raw: Record<string, unknown>, options: string[]): number | null {
  const numeric = [raw.correct_index, raw.answer_index, raw.correct_option_index];
  for (const candidate of numeric) {
    const n =
      typeof candidate === "number"
        ? candidate
        : typeof candidate === "string" && /^\d+$/.test(candidate.trim())
          ? Number(candidate.trim())
          : NaN;
    if (Number.isInteger(n) && n >= 0 && n < options.length) return n;
  }

  const textual = [raw.correct_letter, raw.answer, raw.correct_answer, raw.correct_option];
  for (const candidate of textual) {
    if (typeof candidate !== "string") continue;
    const t = candidate.trim();
    if (/^[a-zA-Z]$/.test(t)) {
      const idx = t.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) return idx;
    }
    const match = options.findIndex((o) => o.trim().toLowerCase() === t.toLowerCase());
    if (match >= 0) return match;
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Parses and validates the model's reply into a draft the review screen can show.
 *
 * Lenient where leniency is safe (a missing type is inferred and flagged), strict
 * where it is not (no question text, or an mcq with fewer than two options, is
 * skipped). Anything skipped or guessed is reported in `warnings` — a review
 * screen that silently drops rows is a review nobody can trust.
 */
export function parseImportedDraft(
  reply: unknown,
): { ok: true; draft: ImportedDraft } | { ok: false; reason: string } {
  const parsed = parseModelJson(reply);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const value = parsed.value;
  const warnings: string[] = [];

  const sections: ImportedSection[] = [];
  const rawSections = Array.isArray(value.sections) ? value.sections : [];
  for (const raw of rawSections) {
    if (!isPlainObject(raw)) continue;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) continue;
    const instruction =
      typeof raw.instruction === "string" && raw.instruction.trim()
        ? raw.instruction.trim().slice(0, 2000)
        : null;
    if (!sections.some((s) => s.label.toLowerCase() === label.toLowerCase())) {
      sections.push({ label: label.slice(0, 120), instruction });
    }
  }

  const rawQuestions = Array.isArray(value.questions) ? value.questions : [];
  if (rawQuestions.length === 0) return { ok: false, reason: "the reply contained no questions" };

  const questions: ImportedQuestion[] = [];
  for (let i = 0; i < rawQuestions.length; i++) {
    if (questions.length >= MAX_IMPORT_QUESTIONS) break;
    const raw = rawQuestions[i];
    const n = i + 1;

    if (!isPlainObject(raw)) {
      warnings.push(`Item ${n}: was not a question and was skipped.`);
      continue;
    }

    const questionText = typeof raw.question_text === "string" ? raw.question_text.trim() : "";
    if (!questionText) {
      warnings.push(`Item ${n}: had no question text and was skipped.`);
      continue;
    }

    let questionType: QuestionType;
    const rawType = typeof raw.question_type === "string" ? raw.question_type.trim().toLowerCase() : "";
    if (rawType === "mcq" || rawType === "true_false" || rawType === "theory") {
      questionType = rawType;
    } else {
      const inferredOptions = toStringArray(raw.options).filter((o) => o.trim());
      const looksTrueFalse =
        inferredOptions.length === 2 && inferredOptions.every((o) => /^(true|false)$/i.test(o.trim()));
      questionType = looksTrueFalse ? "true_false" : inferredOptions.length >= 2 ? "mcq" : "theory";
      warnings.push(`Question ${n}: the type was unclear and was read as ${questionType} — check it.`);
    }

    let options: string[];
    if (questionType === "true_false") {
      options = ["True", "False"];
    } else if (questionType === "theory") {
      options = [];
    } else {
      options = toStringArray(raw.options)
        .map((o) => o.trim().slice(0, 1000))
        .filter((o) => o.length > 0)
        .slice(0, 10);
      if (options.length < 2) {
        warnings.push(`Question ${n}: multiple choice with fewer than two options and was skipped.`);
        continue;
      }
    }

    let correctIndex = resolveCorrectIndex(raw, options);
    if (questionType === "true_false" && correctIndex === null) {
      const t = String(raw.correct_answer ?? raw.answer ?? "").toLowerCase();
      if (t.includes("true")) correctIndex = 0;
      else if (t.includes("false")) correctIndex = 1;
    }
    if (questionType === "theory") {
      correctIndex = null;
    } else if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      correctIndex = null;
      warnings.push(`Question ${n}: the correct answer was not identified — choose it on the review screen.`);
    }

    const marksRaw = Number(raw.marks);
    const marks = Number.isFinite(marksRaw) && marksRaw > 0 && marksRaw <= 100 ? marksRaw : 1;

    let section =
      typeof raw.section === "string" && raw.section.trim() ? raw.section.trim().slice(0, 120) : null;
    if (section && !sections.some((s) => s.label.toLowerCase() === section!.toLowerCase())) {
      sections.push({ label: section, instruction: null });
    }

    questions.push({
      section,
      question_type: questionType,
      question_text: questionText.slice(0, 10000),
      options,
      correct_index: correctIndex,
      marks,
      topic:
        typeof raw.topic === "string" && raw.topic.trim()
          ? raw.topic.trim().slice(0, 200)
          : null,
      model_answer:
        typeof raw.model_answer === "string" && raw.model_answer.trim()
          ? raw.model_answer.trim().slice(0, 8000)
          : null,
    });
  }

  if (questions.length === 0) return { ok: false, reason: "no usable questions were found in the reply" };
  if (rawQuestions.length > MAX_IMPORT_QUESTIONS) {
    warnings.push(`Only the first ${MAX_IMPORT_QUESTIONS} questions were kept.`);
  }
  if (Array.isArray(value.warnings)) {
    for (const w of value.warnings) {
      if (typeof w === "string" && w.trim()) warnings.push(w.trim().slice(0, 300));
    }
  }

  return { ok: true, draft: { sections, questions, warnings } };
}
