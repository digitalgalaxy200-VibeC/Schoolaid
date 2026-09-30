"use client";

import { useState } from "react";
import { Badge, Button, Modal, toast } from "@/components/ui";
import { MAX_PDF_PAGES, downscaleImage, renderPdfPages } from "@/lib/cbt/pdf-pages";

/**
 * AI question import — pick class + subject, provide the exam (paste text,
 * upload a PDF, or upload a photo), review what the AI organised, correct
 * anything, then Approve to save into the bank.
 *
 * The rule this screen exists to uphold: THE AI ORGANISES, THE TEACHER APPROVES.
 * Nothing the model produces is saved until a human has seen it — and a
 * multiple-choice question whose answer the model could not identify cannot be
 * saved until the teacher picks one.
 *
 * Uploads never leave the browser as documents: a PDF is rendered to page
 * images HERE, and only those images are sent for analysis. All failures are
 * reported in-app (error text / toasts) — never browser dialogs.
 */

type QuestionType = "mcq" | "true_false" | "theory";

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };

type SectionDraft = { label: string; instruction: string };

type ImportMode = "text" | "pdf" | "image";

/** One prepared page image (rendered from a PDF, or a downscaled photo). */
type PreparedPage = { blob: Blob; url: string; name: string };

/** What the teacher attached to a review row, if anything. */
type RowAttachment =
  | { kind: "page"; index: number; url: string }
  | { kind: "device"; file: File; url: string };

type ReviewRow = {
  key: string;
  section: string; // "" = none
  question_type: QuestionType;
  question_text: string;
  options: string[];
  correct_index: number | null;
  marks: string;
  topic: string;
  model_answer: string;
  /** The model flagged this question as depending on a figure/diagram. */
  needs_image: boolean;
  /** 1-based page the question was read from, when the model knew. */
  source_page: number | null;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  theory: "Theory",
};

const TEXTAREA_CLASS =
  "w-full mt-1 px-3 py-2 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors";
const INPUT_CLASS =
  "w-full px-3 py-2 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors";

let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

export function AiQuestionImportModal({
  isOpen,
  onClose,
  classOptions,
  onSaved,
  fixedClassId = null,
  fixedSubjectId = null,
  fixedLabel = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  classOptions: ClassOption[];
  onSaved: () => void;
  /** Pinned context (the assessment builder): hides the class/subject pickers. */
  fixedClassId?: string | null;
  fixedSubjectId?: string | null;
  /** Display text for the pinned context, e.g. "Basic 1 · Mathematics". */
  fixedLabel?: string | null;
}) {
  const pinned = Boolean(fixedClassId && fixedSubjectId);
  const [phase, setPhase] = useState<"setup" | "organizing" | "review" | "saving">("setup");
  const [mode, setMode] = useState<ImportMode>("text");
  const [classId, setClassId] = useState(fixedClassId ?? "");
  const [subjectId, setSubjectId] = useState(fixedSubjectId ?? "");
  const [documentText, setDocumentText] = useState("");
  const [pages, setPages] = useState<PreparedPage[]>([]);
  const [pdfInfo, setPdfInfo] = useState<{ name: string; totalPages: number; truncated: boolean } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [attachments, setAttachments] = useState<Record<string, RowAttachment>>({});
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const reset = () => {
    setPhase("setup");
    setMode("text");
    setClassId(fixedClassId ?? "");
    setSubjectId(fixedSubjectId ?? "");
    setDocumentText("");
    for (const page of pages) URL.revokeObjectURL(page.url);
    for (const attachment of Object.values(attachments)) {
      if (attachment) URL.revokeObjectURL(attachment.url);
    }
    setPages([]);
    setPdfInfo(null);
    setAttachments({});
    setError(null);
    setSections([]);
    setRows([]);
    setWarnings([]);
  };

  const disabled = phase === "organizing" || phase === "saving";

  const close = () => {
    reset();
    onClose();
  };

  /** A PDF is rendered to page images HERE; only images are ever uploaded. */
  const choosePdf = async (file: File) => {
    setError(null);
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      setError("Choose a PDF file.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("That PDF is larger than 50 MB. Split it, or upload page photos instead.");
      return;
    }
    setRendering(true);
    try {
      const rendered = await renderPdfPages(file);
      if (rendered.pages.length === 0) {
        setError("That PDF has no readable pages.");
        return;
      }
      for (const page of pages) URL.revokeObjectURL(page.url);
      setPages(
        rendered.pages.map((p, i) => ({
          blob: p.blob,
          url: URL.createObjectURL(p.blob),
          name: `page-${i + 1}.jpg`,
        })),
      );
      setPdfInfo({ name: file.name, totalPages: rendered.totalPages, truncated: rendered.truncated });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That PDF could not be read.");
    } finally {
      setRendering(false);
    }
  };

  /** A photo of an exam — downscaled in the browser before it is ever sent. */
  const chooseImage = async (file: File) => {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is larger than 8 MB.");
      return;
    }
    try {
      const blob = await downscaleImage(file);
      for (const page of pages) URL.revokeObjectURL(page.url);
      setPages([{ blob, url: URL.createObjectURL(blob), name: "image-1.jpg" }]);
      setPdfInfo({ name: file.name, totalPages: 1, truncated: false });
    } catch {
      setError("That image could not be prepared. Try another file.");
    }
  };

  /** A per-question image uploaded from the device during review. */
  const attachDevice = async (rowKey: string, file: File) => {
    setError(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is larger than 8 MB.");
      return;
    }
    try {
      const blob = await downscaleImage(file);
      const prepared = new File([blob], "question-image.jpg", { type: "image/jpeg" });
      setAttachments((current) => {
        const previous = current[rowKey];
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          ...current,
          [rowKey]: { kind: "device", file: prepared, url: URL.createObjectURL(blob) },
        };
      });
    } catch {
      setError("That image could not be prepared. Try another file.");
    }
  };

  /** Turns the model's reply into review rows + default image suggestions. */
  const applyDraft = (body: Record<string, unknown>, pageUrls: PreparedPage[]) => {
    setSections(
      (Array.isArray(body.sections) ? body.sections : []).map((s: Record<string, unknown>) => ({
        label: String(s.label ?? ""),
        instruction: s.instruction == null ? "" : String(s.instruction),
      })),
    );

    const reviewRows = (Array.isArray(body.questions) ? body.questions : []).map(
      (q: Record<string, unknown>): ReviewRow => {
        const type = (q.question_type ?? "mcq") as QuestionType;
        const rawOptions = Array.isArray(q.options) ? q.options.map(String) : [];
        return {
          key: nextKey(),
          section: q.section == null ? "" : String(q.section),
          question_type: type,
          question_text: String(q.question_text ?? ""),
          options:
            rawOptions.length > 0
              ? rawOptions
              : type === "mcq"
                ? ["", ""]
                : type === "true_false"
                  ? ["True", "False"]
                  : [],
          correct_index: typeof q.correct_index === "number" ? q.correct_index : null,
          marks: String(q.marks ?? 1),
          topic: q.topic == null ? "" : String(q.topic),
          model_answer: q.model_answer == null ? "" : String(q.model_answer),
          needs_image: q.needs_image === true,
          source_page:
            typeof q.source_page === "number" && q.source_page >= 1 && q.source_page <= pageUrls.length
              ? q.source_page
              : null,
        };
      },
    );

    setRows(reviewRows);

    // Pre-attach the source page for questions the model flagged as
    // figure-dependent, so approving usually needs no extra work. The teacher
    // can change or remove any of it on the review screen.
    const defaults: Record<string, RowAttachment> = {};
    for (const row of reviewRows) {
      if (row.needs_image && row.source_page && pageUrls[row.source_page - 1]) {
        const index = row.source_page - 1;
        defaults[row.key] = { kind: "page", index, url: pageUrls[index].url };
      }
    }
    setAttachments(defaults);

    setWarnings(Array.isArray(body.warnings) ? body.warnings.map(String) : []);
  };

  const organize = async () => {
    setError(null);
    if (!classId) return setError("Choose the class first.");
    if (!subjectId) return setError("Choose the subject first.");
    if (mode === "text" && !documentText.trim()) return setError("Paste the exam text first.");
    if (mode !== "text" && pages.length === 0) {
      return setError(mode === "pdf" ? "Choose a PDF first." : "Choose an image first.");
    }
    setPhase("organizing");
    try {
      let res: Response;
      if (mode === "text") {
        res = await fetch("/api/cbt/questions/ai-organize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ class_id: classId, subject_id: subjectId, text: documentText }),
        });
      } else {
        const form = new FormData();
        form.append("class_id", classId);
        form.append("subject_id", subjectId);
        for (const page of pages) {
          form.append("pages", new File([page.blob], page.name, { type: "image/jpeg" }));
        }
        res = await fetch("/api/cbt/questions/ai-organize", { method: "POST", body: form });
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.error ||
            `The AI could not organise this ${mode === "text" ? "text" : "document"} (HTTP ${res.status}).`,
        );
        setPhase("setup");
        return;
      }

      applyDraft(body, mode === "text" ? [] : pages);
      setPhase("review");
    } catch {
      setError("Could not reach the server.");
      setPhase("setup");
    }
  };

  const updateRow = (key: string, patch: Partial<ReviewRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setError(null);
    if (!classId || !subjectId) {
      setError("The class and subject are missing — start again.");
      return;
    }
    if (rows.length === 0) {
      setError("There is nothing to save.");
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.question_text.trim()) {
        setError(`Question ${i + 1}: the text is empty.`);
        return;
      }
      if (r.question_type !== "theory") {
        const filled = r.options.map((o) => o.trim()).filter(Boolean);
        if (filled.length < 2) {
          setError(`Question ${i + 1}: needs at least two options.`);
          return;
        }
        if (
          r.correct_index === null ||
          r.correct_index < 0 ||
          r.correct_index >= r.options.length ||
          !r.options[r.correct_index]?.trim()
        ) {
          setError(`Question ${i + 1}: choose the correct answer before saving.`);
          return;
        }
      }
    }

    setPhase("saving");
    try {
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        sections: sections.map((s) => ({
          label: s.label,
          instruction: s.instruction.trim() || null,
        })),
        questions: rows.map((r) => {
          const base: Record<string, unknown> = {
            question_type: r.question_type,
            question_text: r.question_text.trim(),
            marks: Number(r.marks) || 1,
            topic: r.topic.trim() || null,
            section: r.section || null,
          };
          if (r.question_type === "theory") {
            base.model_answer = r.model_answer.trim() || null;
          } else {
            base.options = r.options
              .map((o) => ({ option_text: o.trim() }))
              .filter((o) => o.option_text);
            base.correct_option_index = r.correct_index;
          }
          return base;
        }),
      };

      const res = await fetch("/api/cbt/questions/ai-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not save (HTTP ${res.status}).`);
        setPhase("review");
        return;
      }

      // Attach the images the teacher kept in review. The questions are already
      // saved at this point, so a failed attachment is a reported partial
      // outcome — never a silent one — and can be redone from the bank.
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      let attached = 0;
      let attachFailures = 0;
      for (let i = 0; i < rows.length; i++) {
        const attachment = attachments[rows[i].key];
        const questionId = ids[i];
        if (!attachment || !questionId) continue;
        if (attachment.kind === "page" && !pages[attachment.index]) continue;
        try {
          const file =
            attachment.kind === "page"
              ? new File([pages[attachment.index].blob], `page-${attachment.index + 1}.jpg`, {
                  type: "image/jpeg",
                })
              : attachment.file;
          const mediaForm = new FormData();
          mediaForm.append("file", file);
          const mediaRes = await fetch(`/api/cbt/questions/${questionId}/media`, {
            method: "POST",
            body: mediaForm,
          });
          if (mediaRes.ok) attached += 1;
          else attachFailures += 1;
        } catch {
          attachFailures += 1;
        }
      }

      toast.success(`${body.created ?? rows.length} question(s) saved to the question bank`);
      if (attached > 0) toast.success(`${attached} image(s) attached`);
      if (attachFailures > 0) {
        toast.error(
          `${attachFailures} image(s) could not be attached — attach them from the question bank.`,
        );
      }
      reset();
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
      setPhase("review");
    }
  };

  const sectionChoices = sections.map((s) => s.label);

  return (
    <Modal
      isOpen={isOpen}
      onClose={disabled ? () => undefined : close}
      title="AI question import"
      size="lg"
      footer={
        phase === "review" || phase === "saving" ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPhase("setup")} disabled={disabled}>
              Back
            </Button>
            <Button variant="primary" loading={phase === "saving"} onClick={() => void save()} disabled={disabled}>
              Approve &amp; save {rows.length} question{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={disabled}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={phase === "organizing"}
              onClick={() => void organize()}
              disabled={disabled}
            >
              Organise with AI
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {error}
          </div>
        )}

        {phase === "setup" || phase === "organizing" ? (
          <>
            <p className="text-body text-text-secondary">
              {pinned
                ? "Provide the exam — paste the text, upload a PDF, or upload a photo. The AI organises it; nothing is saved until you review and approve."
                : "Choose the class and subject first, then provide the exam — paste the text, upload a PDF, or upload a photo. Nothing is saved until you review and approve."}
            </p>

            <div className="flex flex-wrap gap-2">
              {(["text", "pdf", "image"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-caption font-semibold border transition-colors ${
                    mode === m
                      ? "bg-primary text-text-inverse border-primary"
                      : "bg-surface text-text-secondary border-border hover:bg-clay"
                  }`}
                >
                  {m === "text" ? "Paste text" : m === "pdf" ? "Upload PDF" : "Upload image"}
                </button>
              ))}
            </div>

            {pinned ? (
              <div className="rounded-lg border border-border bg-clay px-3 py-2">
                <p className="text-caption text-text-secondary">
                  Filing under{" "}
                  <span className="font-semibold text-text-primary">
                    {fixedLabel ?? "this assessment's class and subject"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                <div>
                  <label className="text-caption font-semibold text-text-secondary">Class</label>
                  <select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setSubjectId("");
                    }}
                    className={`${INPUT_CLASS} mt-1`}
                  >
                    <option value="">Select class…</option>
                    {classOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-caption font-semibold text-text-secondary">Subject</label>
                  <select
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={!classId}
                    className={`${INPUT_CLASS} mt-1 disabled:opacity-50`}
                  >
                    <option value="">Select subject…</option>
                    {(classOptions.find((c) => c.id === classId)?.subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {mode === "text" && (
              <div>
                <label className="text-caption font-semibold text-text-secondary">Exam text</label>
                <textarea
                  rows={12}
                  value={documentText}
                  onChange={(e) => setDocumentText(e.target.value)}
                  placeholder={
                    "SECTION A – OBJECTIVE\n\nInstruction: Answer all questions.\n\n1. What is 5 × 4?\nA. 10\nB. 15\nC. 20\nD. 25\nAnswer: C"
                  }
                  className={TEXTAREA_CLASS}
                />
              </div>
            )}

            {mode === "pdf" && (
              <div className="space-y-3">
                <div>
                  <label className="text-caption font-semibold text-text-secondary">
                    PDF document
                  </label>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void choosePdf(file);
                      e.target.value = "";
                    }}
                    className="w-full mt-1 text-body"
                  />
                  <p className="text-caption text-text-secondary mt-1">
                    Up to {MAX_PDF_PAGES} pages are analysed. Pages are turned into images in your
                    browser — the PDF itself is never uploaded.
                  </p>
                </div>

                {rendering && <p className="text-caption text-text-secondary">Rendering pages…</p>}

                {pdfInfo && (
                  <p className="text-caption text-text-secondary">
                    {pdfInfo.name} — {pdfInfo.totalPages} page(s)
                    {pdfInfo.truncated ? `; the first ${MAX_PDF_PAGES} will be analysed` : ""}
                  </p>
                )}

                {pages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pages.map((page, i) => (
                      <div key={page.url} className="relative">
                        <img
                          src={page.url}
                          alt=""
                          className="h-24 w-20 object-cover rounded border border-border"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-caption text-center">
                          {i + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode === "image" && (
              <div className="space-y-3">
                <div>
                  <label className="text-caption font-semibold text-text-secondary">
                    Photo or image of the exam
                  </label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void chooseImage(file);
                      e.target.value = "";
                    }}
                    className="w-full mt-1 text-body"
                  />
                  <p className="text-caption text-text-secondary mt-1">
                    PNG, JPEG or WebP. Large photos are resized in your browser before upload.
                  </p>
                </div>

                {pages.length > 0 && (
                  <img
                    src={pages[0].url}
                    alt=""
                    className="max-h-44 rounded border border-border"
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {warnings.length > 0 && (
              <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-caption text-warning space-y-1">
                {warnings.slice(0, 6).map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
                {warnings.length > 6 && <p>…and {warnings.length - 6} more.</p>}
              </div>
            )}

            {sections.length > 0 && (
              <div className="space-y-2">
                <p className="text-caption font-semibold text-text-secondary">Sections</p>
                {sections.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2 space-y-1">
                    <p className="text-caption font-semibold">{s.label}</p>
                    <textarea
                      rows={2}
                      value={s.instruction}
                      placeholder="Section instruction (optional)"
                      onChange={(e) =>
                        setSections((current) =>
                          current.map((x, j) => (j === i ? { ...x, instruction: e.target.value } : x)),
                        )
                      }
                      className={TEXTAREA_CLASS}
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="text-caption text-text-secondary">
              {rows.length} question{rows.length === 1 ? "" : "s"} organised — review and correct
              anything before saving.
            </p>

            <div className="space-y-3">
              {rows.map((r, index) => {
                const attachment = attachments[r.key] ?? null;
                return (
                <div key={r.key} className="rounded-lg border border-border bg-surface px-3 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-bold">Q{index + 1}</span>
                    <Badge variant="info">{TYPE_LABELS[r.question_type]}</Badge>
                    {sectionChoices.length > 0 && (
                      <select
                        value={r.section}
                        onChange={(e) => updateRow(r.key, { section: e.target.value })}
                        className="px-2 py-1 rounded border border-border text-caption bg-surface"
                      >
                        <option value="">No section</option>
                        {sectionChoices.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="text-caption text-text-secondary ml-auto flex items-center gap-1">
                      Marks
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={r.marks}
                        onChange={(e) => updateRow(r.key, { marks: e.target.value })}
                        className="w-20 px-2 py-1 rounded border border-border text-caption bg-surface"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                    >
                      Remove
                    </Button>
                  </div>

                  {/* Optional companion image for this question. */}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-clay px-3 py-2">
                    <span className="text-caption font-semibold text-text-secondary">Image</span>
                    {attachment ? (
                      <>
                        <img
                          src={attachment.url}
                          alt=""
                          className="h-12 w-16 object-cover rounded border border-border"
                        />
                        <span className="text-caption text-text-secondary">
                          {attachment.kind === "page"
                            ? `Page ${attachment.index + 1}`
                            : "Uploaded image"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setAttachments((current) => {
                              const previous = current[r.key];
                              if (previous) URL.revokeObjectURL(previous.url);
                              const next = { ...current };
                              delete next[r.key];
                              return next;
                            })
                          }
                        >
                          Remove
                        </Button>
                      </>
                    ) : (
                      <span className="text-caption text-text-secondary">None</span>
                    )}

                    {pages.length > 0 && (
                      <select
                        value={attachment?.kind === "page" ? String(attachment.index) : ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setAttachments((current) => {
                            const previous = current[r.key];
                            if (previous) URL.revokeObjectURL(previous.url);
                            const next = { ...current };
                            if (value === "") delete next[r.key];
                            else
                              next[r.key] = {
                                kind: "page",
                                index: Number(value),
                                url: pages[Number(value)].url,
                              };
                            return next;
                          });
                        }}
                        className="px-2 py-1 rounded border border-border text-caption bg-surface"
                      >
                        <option value="">Use a page…</option>
                        {pages.map((page, i) => (
                          <option key={page.url} value={i}>
                            Page {i + 1}
                          </option>
                        ))}
                      </select>
                    )}

                    <label className="text-caption text-primary cursor-pointer hover:underline">
                      Upload image
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void attachDevice(r.key, file);
                          e.target.value = "";
                        }}
                      />
                    </label>

                    {r.needs_image && !attachment && (
                      <span className="text-caption text-warning">
                        Refers to a diagram — attach its image.
                      </span>
                    )}
                  </div>

                  <textarea
                    rows={2}
                    value={r.question_text}
                    onChange={(e) => updateRow(r.key, { question_text: e.target.value })}
                    className={TEXTAREA_CLASS}
                  />

                  {r.question_type === "theory" ? (
                    <textarea
                      rows={2}
                      value={r.model_answer}
                      placeholder="Model answer (optional)"
                      onChange={(e) => updateRow(r.key, { model_answer: e.target.value })}
                      className={TEXTAREA_CLASS}
                    />
                  ) : (
                    <div className="space-y-1">
                      {r.options.map((option, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${r.key}`}
                            checked={r.correct_index === oi}
                            onChange={() => updateRow(r.key, { correct_index: oi })}
                            className="accent-[var(--color-primary)]"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) =>
                              updateRow(r.key, {
                                options: r.options.map((o, j) => (j === oi ? e.target.value : o)),
                              })
                            }
                            className="flex-1 px-3 py-1.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      ))}
                      {r.correct_index === null && (
                        <p className="text-caption text-warning">
                          The correct answer was not identified — select it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
