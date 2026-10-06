"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, ConfirmDialog, toast } from "@/components/ui";
import { AiQuestionImportModal } from "../../questions/AiQuestionImportModal";
import { QuestionFormModal } from "../../questions/QuestionFormModal";
import { AddQuestionsModal } from "./AddQuestionsModal";
import { AssessmentPreviewModal } from "./AssessmentPreviewModal";

/**
 * CBT assessment builder (Phase 17 UI) — the questions, and publishing them.
 *
 * THE TEACHER'S SCREEN IS A LIST. Every question on the assessment is shown in
 * full — text, options, the correct answer, its image — so the whole set can be
 * read, corrected and reordered without clicking through it. The
 * one-question-per-screen experience belongs to the STUDENT and to Preview; it is
 * deliberately not how the teacher works.
 *
 * A teacher does NOT pick questions from a pool here. "Add Questions" opens the one
 * chooser (PDF / picture / create manually), and whatever they add is filed under
 * this assessment's class + subject and lands in the list immediately — then ↑ ↓
 * put the questions in the order the class will sit them.
 *
 * PUBLISHING IS DECIDED SERVER-SIDE, and this page does not try to replicate the
 * rule. It calls the endpoint and renders the `problems` array the server
 * returns. A client-side copy of "every question must be approved" would drift
 * from the server's version, and would eventually either refuse something valid
 * or wave through something the server then rejects.
 *
 * The local hints below (the total against the component maximum) are ADVISORY.
 * They exist so a problem is visible before pressing Publish, not to decide it.
 */

type AssessmentStatus = "draft" | "review" | "published" | "archived";

type SelectedQuestion = {
  question_id: string;
  marks_override: number | null;
  question_text: string;
  question_type: string;
  marks: number;
  status: string;
};

type AssessmentDetail = {
  id: string;
  title: string;
  status: AssessmentStatus;
  class_id: string;
  subject_id: string | null;
  term_id: string | null;
  session_id: string | null;
  teacher_id: string | null;
  component_id: string | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: string;
  instructions: string | null;
  sections: { label: string; instruction: string | null }[] | null;
  questions: SelectedQuestion[];
  attempt_count: number;
  /** Split by what the attempts are doing — a sat paper is history, an
   *  in-progress one is re-pointed at the corrected paper on republish. */
  attempt_counts?: { in_progress: number; sat: number };
};

type PaperQuestion = {
  question_id: string;
  display_order: number;
  marks_override: number | null;
  marks: number;
  question_type: string;
  question_text: string;
  section: string | null;
  section_instruction: string | null;
  status: string;
  media_url: string | null;
  correct_option_id: string | null;
  options: { id: string; label: string | null; option_text: string }[];
};

/**
 * Section headings, in the order they read on the assessment: the saved sections
 * first, then any section that arrives with a newly added question.
 */
function deriveSectionLabels(
  saved: { label: string }[] | null,
  selectedIds: string[],
  byId: Map<string, { section: string | null }>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const label = (raw ?? "").trim();
    if (!label || seen.has(label.toLowerCase())) return;
    seen.add(label.toLowerCase());
    out.push(label);
  };
  for (const s of saved ?? []) add(s.label);
  for (const id of selectedIds) add(byId.get(id)?.section);
  return out;
}

const TYPE_LABEL: Record<string, string> = {
  mcq: "MCQ",
  true_false: "T/F",
  theory: "Theory",
};

const STATUS_VARIANT: Record<AssessmentStatus, "draft" | "info" | "success" | "default"> = {
  draft: "draft",
  review: "info",
  published: "success",
  archived: "default",
};

export default function AssessmentBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params?.id;

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  // The questions as the TEACHER sees them — full text, options, correct answer,
  // image. This screen is a list; one-question-per-screen is the student's
  // experience, reached through Preview.
  const [paper, setPaper] = useState<PaperQuestion[]>([]);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ question_id: string; marks_override: number | null }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [componentMax, setComponentMax] = useState<number | null>(null);
  // Class and subject names, for the pinned-context labels on the question and
  // AI forms opened from here.
  const [className, setClassName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [sectionInstructions, setSectionInstructions] = useState<Record<string, string>>({});
  const [savingSections, setSavingSections] = useState(false);
  // Question-authoring actions inside the builder (manual and AI).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
  // Set when the form is editing an existing question rather than adding one.
  const [editQuestionId, setEditQuestionId] = useState<string | null>(null);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Which input the AI modal should open on — set by the Add Questions chooser.
  const [aiImportMode, setAiImportMode] = useState<"document" | "image" | null>(null);

  useEffect(() => {
    fetch("/api/cbt/questions/ai-organize")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setAiEnabled(d?.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);

  const load = useCallback(async (): Promise<AssessmentDetail | null> => {
    if (!assessmentId) return null;
    setLoading(true);
    setError(null);
    try {
      const detailRes = await fetch(`/api/cbt/assessments/${assessmentId}`);
      const detail = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) {
        setError(detail.error || `Could not load the assessment (HTTP ${detailRes.status})`);
        return null;
      }

      const loaded = detail.assessment as AssessmentDetail;
      setAssessment(loaded);
      setSelected(
        (loaded.questions ?? []).map((q) => ({
          question_id: q.question_id,
          marks_override: q.marks_override,
        })),
      );

      // The full set of questions as the TEACHER edits them — text, options, the
      // correct answer and any image — so this screen can show the whole list at
      // once. The student's one-question-per-screen experience lives in Preview
      // and in the attempt itself.
      const paperRes = await fetch(`/api/cbt/assessments/${assessmentId}/questions`);
      const paperBody = await paperRes.json().catch(() => ({}));
      const loadedPaper: PaperQuestion[] = paperRes.ok
        ? ((paperBody.questions ?? []) as PaperQuestion[])
        : [];
      setPaper(loadedPaper);
      setPaperError(
        paperRes.ok
          ? null
          : paperBody.error || `Could not load the questions (HTTP ${paperRes.status})`,
      );

      // Prefill section instructions: the assessment's saved copy wins, then
      // whatever the AI import captured on the questions themselves.
      setSectionInstructions((current) => {
        const next = { ...current };
        for (const s of loaded.sections ?? []) {
          if (!(s.label in next)) next[s.label] = s.instruction ?? "";
        }
        for (const q of loadedPaper) {
          const label = (q.section ?? "").trim();
          if (!label || label in next || !q.section_instruction) continue;
          next[label] = q.section_instruction;
        }
        return next;
      });

      // The component's ceiling, so the running total is shown against something
      // real rather than in the abstract — and the class/subject names for the
      // pinned question forms.
      if (loaded.class_id) {
        const optRes = await fetch(`/api/cbt/assessments/options?class_id=${loaded.class_id}`);
        const opts = await optRes.json().catch(() => ({}));
        const match = (opts.components ?? []).find(
          (c: { id: string }) => c.id === loaded.component_id,
        );
        setComponentMax(match?.maximum_score ?? null);
        const cls = (opts.classes ?? []).find((c: { id: string }) => c.id === loaded.class_id);
        setClassName((cls?.name as string) ?? null);
        const subj = (opts.subjects ?? []).find((s: { id: string }) => s.id === loaded.subject_id);
        setSubjectName((subj?.name as string) ?? null);
      }

      return loaded;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  /**
   * Loads the question pool for the assessment's class + subject. Kept separate
   * from `load` so refreshing the pool never discards unsaved paper changes.
   */
  /**
   * Re-reads the questions after one is added or edited. Kept separate from
   * `load` so refreshing the list never discards unsaved paper changes.
   */
  const refreshPaper = useCallback(async () => {
    if (!assessmentId) return;
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/questions`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaperError(body.error || `Could not load the questions (HTTP ${res.status})`);
        return;
      }
      setPaperError(null);
      setPaper((body.questions ?? []) as PaperQuestion[]);
    } catch {
      setPaperError("Could not reach the server.");
    }
  }, [assessmentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const paperById = new Map(paper.map((q) => [q.question_id, q]));

  // A saved override wins, then the question's own value, then whatever the
  // assessment last stored — for a question that no longer resolves.
  const marksFor = (id: string, override: number | null): number => {
    if (override !== null) return override;
    const fromPaper = paperById.get(id)?.marks;
    if (fromPaper !== undefined) return fromPaper;
    const fromAssessment = assessment?.questions.find((q) => q.question_id === id)?.marks;
    return fromAssessment ?? 0;
  };

  const totalMarks = selected.reduce((sum, s) => sum + marksFor(s.question_id, s.marks_override), 0);
  const overAllocated = componentMax !== null && totalMarks > componentMax;

  const isSelected = (id: string) => selected.some((s) => s.question_id === id);

  const toggle = (id: string) => {
    setProblems([]);
    setSelected((current) =>
      isSelected(id)
        ? current.filter((s) => s.question_id !== id)
        : [...current, { question_id: id, marks_override: null }],
    );
  };

  const move = (index: number, delta: number) => {
    setSelected((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addQuestionToPaper = (questionId: string) => {
    setProblems([]);
    setSelected((current) =>
      current.some((s) => s.question_id === questionId)
        ? current
        : [...current, { question_id: questionId, marks_override: null }],
    );
  };

  // A question saved from inside the builder is filed under this assessment's
  // class + subject (pinned in the form) and appears in the list immediately — the
  // teacher opened "Add question" to use it here.
  const onQuestionSaved = (questionId: string | null) => {
    if (questionId) addQuestionToPaper(questionId);
    void refreshPaper();
  };

  // An AI import from THIS builder was opened to be used here: approving adds
  // the created questions straight onto the paper (the same behaviour as the
  // manual form), and the pool refreshes so the rows render with their text.
  const onAiImported = (questionIds: string[]) => {
    if (questionIds.length > 0) {
      setProblems([]);
      setSelected((current) => {
        const have = new Set(current.map((s) => s.question_id));
        const additions = questionIds
          .filter((id) => !have.has(id))
          .map((id) => ({ question_id: id, marks_override: null }));
        return [...current, ...additions];
      });
    }
    void refreshPaper();
  };

  const sectionLabels = deriveSectionLabels(
    assessment?.sections ?? null,
    selected.map((s) => s.question_id),
    paperById,
  );

  const sectionQuestionCount = (label: string) =>
    selected.filter(
      (s) =>
        (paperById.get(s.question_id)?.section ?? "").trim().toLowerCase() === label.toLowerCase(),
    ).length;

  const save = async () => {
    if (!assessmentId || selected.length === 0) {
      toast.error("Select at least one question");
      return;
    }
    setSaving(true);
    setProblems([]);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/questions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questions: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not save the questions");
        return;
      }
      toast.success("Questions saved");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!assessmentId) return;
    setPublishing(true);
    setProblems([]);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/publish`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's own list of what is wrong, rendered as returned.
        setProblems(body.problems ?? [body.error ?? "Could not publish"]);
        return;
      }
      toast.success(
        typeof body.in_progress_updated === "number" && body.in_progress_updated > 0
          ? `Assessment published — ${body.in_progress_updated} attempt(s) still in progress were updated and asked to review their answers`
          : "Assessment published",
      );
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  };

  /**
   * Takes a published assessment back to draft so its questions can be corrected.
   *
   * There are no readiness problems to render, unlike publishing: the server has
   * nothing to refuse, and the only gate is that the assessment IS published. Students
   * stop seeing it until it is published again; attempts already taken keep their own
   * frozen papers and stay markable.
   */
  const unpublish = async () => {
    if (!assessmentId) return;
    setUnpublishing(true);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/unpublish`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not unpublish this assessment");
        return;
      }
      setConfirmUnpublish(false);
      toast.success("Taken back to draft — fix the questions, then publish again");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setUnpublishing(false);
    }
  };

  /**
   * Saves the section instructions onto the assessment. Sent through the same
   * PATCH as any other assessment edit, so the server-side rules (frozen
   * bindings, published lock) apply here too.
   */
  const saveSections = async () => {
    if (!assessmentId || !assessment) return;
    setSavingSections(true);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: assessment.title,
          class_id: assessment.class_id,
          subject_id: assessment.subject_id,
          term_id: assessment.term_id,
          session_id: assessment.session_id,
          component_id: assessment.component_id,
          teacher_id: assessment.teacher_id,
          max_attempts: assessment.max_attempts,
          time_limit_minutes: assessment.time_limit_minutes,
          official_attempt_rule: assessment.official_attempt_rule,
          instructions: assessment.instructions,
          sections: sectionLabels.map((label) => ({
            label,
            instruction: (sectionInstructions[label] ?? "").trim() || null,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not save the sections");
        return;
      }
      toast.success("Sections saved");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingSections(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="p-4 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Assessment not found."}
        </div>
        <Button
          variant="secondary"
          className="h-11 w-full tablet:h-auto tablet:w-auto"
          onClick={() => router.push("/teacher/cbt/assessments")}
        >
          Back to assessments
        </Button>
      </div>
    );
  }

  const frozen = assessment.attempt_count > 0;
  const published = assessment.status === "published";
  // Questions and sections are editable whenever the paper is NOT published —
  // attempts no longer lock them (a submitted paper keeps its own frozen
  // snapshot; an in-progress one is re-pointed at the corrected paper on
  // republish). The BINDING still freezes once attempts exist, which the banner
  // below states separately.
  const editable = !published;
  const inProgress = assessment.attempt_counts?.in_progress ?? 0;
  const satPapers = assessment.attempt_counts?.sat ?? 0;

  // The preview reads the SAVED paper. The builder flags when its selection has
  // drifted from what is stored, so the modal can say so rather than quietly
  // showing a paper the teacher no longer has on screen.
  const selectionDirty =
    selected.length !== assessment.questions.length ||
    selected.some((s, i) => {
      const saved = assessment.questions[i];
      return (
        !saved ||
        saved.question_id !== s.question_id ||
        (saved.marks_override ?? null) !== (s.marks_override ?? null)
      );
    });

  return (
    /* One column on mobile. From `tablet:` up this is the original header row
       again: the title takes the first grid cell, and the actions — moved to the
       end of the DOM so `sticky bottom-0` can pin them on mobile — are placed
       back beside it in row 1, column 2. */
    <div className="p-4 tablet:p-8 flex flex-col gap-6 tablet:grid tablet:grid-cols-[minmax(0,1fr)_auto] tablet:items-start tablet:gap-x-4 tablet:gap-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push("/teacher/cbt/assessments")}
          className="inline-flex items-center text-caption text-text-secondary hover:text-primary transition-colors min-h-[44px] tablet:min-h-0"
        >
          ← All assessments
        </button>
        <h1 className="text-h1 font-bold text-text-primary mt-1">{assessment.title}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Badge variant={STATUS_VARIANT[assessment.status]}>{assessment.status}</Badge>
          <span className="text-caption text-text-secondary">
            {assessment.max_attempts} attempt(s)
            {assessment.time_limit_minutes
              ? ` · ${assessment.time_limit_minutes} min`
              : " · untimed"}
            {` · official: ${assessment.official_attempt_rule}`}
          </span>
        </div>
      </div>

      {published && (
        <div className="rounded-lg border border-success bg-success-bg px-4 py-3 text-body text-success tablet:col-span-2">
          This assessment is published. Students in the class can attempt it while it stays
          published.
        </div>
      )}

      {frozen && !published && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning tablet:col-span-2">
          {assessment.attempt_count} attempt(s) already exist, so this assessment&apos;s class, term
          and component can no longer be changed. The questions can still be corrected while it is
          unpublished — papers already sat keep exactly what they sat.
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 space-y-1 tablet:col-span-2">
          <p className="text-body font-semibold text-error">
            This assessment is not ready to publish:
          </p>
          <ul className="list-disc pl-5 text-body text-error">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {/* The question-setting entry point: one Add Questions chooser (PDF /
          picture / manual). Both paths file under this assessment's class +
          subject (the server enforces that context).

          It stays VISIBLE when the paper is published, disabled with the reason
          beside it — a control that vanishes reads as a bug, and "where do I add
          questions?" is the question it caused. */}
      {assessment.subject_id && (
        <div className="flex flex-wrap items-center gap-2 tablet:col-span-2">
          <Button
            variant="secondary"
            className="h-11 w-full tablet:h-auto tablet:w-auto"
            disabled={!editable}
            title={published ? "Unpublish this test to change its questions." : undefined}
            onClick={() => setChooserOpen(true)}
          >
            Add Questions
          </Button>
          {published && (
            <span className="text-caption text-text-secondary">
              Unpublish to change the questions.
            </span>
          )}
        </div>
      )}

      <Card variant="default" className="space-y-4 tablet:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2 font-semibold text-text-primary">
            Questions — {selected.length}
          </h2>
          <span
            className={`text-body font-mono ${overAllocated ? "text-error" : "text-text-secondary"}`}
          >
            {totalMarks} mark(s)
            {componentMax !== null ? ` of ${componentMax} available` : ""}
          </span>
        </div>

        {overAllocated && (
          <p className="text-caption text-error">
            The questions are worth more than the component can hold, so publishing will be
            refused.
          </p>
        )}

        {selected.length === 0 ? (
          <p className="text-body text-text-secondary">
            No questions yet. Use <span className="font-semibold">Add Questions</span> above —
            every question you add is filed under this class and subject and appears here, ready to
            be reordered or edited.
          </p>
        ) : (
          <ol className="space-y-3">
            {selected.map((s, i) => {
              const q = paperById.get(s.question_id);
              return (
                <li
                  key={s.question_id}
                  className="rounded-lg border border-border bg-surface px-3 py-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="text-caption text-text-disabled font-mono w-6 pt-1">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-body text-text-primary whitespace-pre-wrap">
                      {q?.question_text ?? "(question no longer available)"}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {TYPE_LABEL[q?.question_type ?? ""] ?? "—"}
                    </span>
                    <span className="text-caption font-mono text-text-secondary">
                      {marksFor(s.question_id, s.marks_override)} mark(s)
                    </span>
                  </div>

                  {q?.media_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={q.media_url}
                      alt=""
                      className="ml-9 max-h-40 rounded border border-border object-contain"
                    />
                  )}

                  {q && q.question_type !== "theory" && q.options.length > 0 && (
                    <ol className="space-y-1 pl-9">
                      {q.options.map((o) => {
                        const isCorrect = o.id === q.correct_option_id;
                        return (
                          <li key={o.id} className="flex items-center gap-2">
                            <span className="text-caption font-semibold text-text-secondary w-5">
                              {(o.label ?? "").trim() || "•"}
                            </span>
                            <span
                              className={
                                isCorrect
                                  ? "text-body text-success font-medium"
                                  : "text-body text-text-primary"
                              }
                            >
                              {o.option_text}
                            </span>
                            {isCorrect && (
                              <span className="text-caption text-success">✓ correct</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )}

                  {q?.question_type === "theory" && (
                    <p className="pl-9 text-caption text-text-secondary">
                      Written answer — marked by the teacher.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pl-9">
                    {q?.section && (
                      <span className="text-caption rounded-full border border-border px-2 py-0.5 text-text-secondary">
                        {q.section}
                      </span>
                    )}
                    {editable && (
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 min-w-[44px] tablet:h-auto tablet:min-w-0"
                          aria-label={`Move question ${i + 1} up`}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 min-w-[44px] tablet:h-auto tablet:min-w-0"
                          aria-label={`Move question ${i + 1} down`}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-11 tablet:h-auto"
                          onClick={() => {
                            setEditQuestionId(s.question_id);
                            setQuestionFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 tablet:h-auto"
                          onClick={() => toggle(s.question_id)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {sectionLabels.length > 0 && (
        <Card variant="default" className="space-y-4 tablet:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-h2 font-semibold text-text-primary">Sections</h2>
              <p className="text-caption text-text-secondary mt-1">
                One instruction per section heading. Captured automatically from AI imports; edit
                freely and save.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-11 tablet:h-auto"
              loading={savingSections}
              disabled={!editable}
              onClick={() => void saveSections()}
            >
              Save sections
            </Button>
          </div>

          <div className="space-y-3">
            {sectionLabels.map((label) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-surface px-3 py-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body font-semibold text-text-primary">{label}</span>
                  <span className="text-caption text-text-secondary">
                    {sectionQuestionCount(label)} question(s)
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={sectionInstructions[label] ?? ""}
                  onChange={(e) =>
                    setSectionInstructions((current) => ({ ...current, [label]: e.target.value }))
                  }
                  disabled={!editable}
                  placeholder="e.g. Answer all questions. Choose the correct option."
                  className="w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* There is deliberately no question POOL here. Adding a question inside the
          builder files it under this assessment's class + subject and puts it
          straight into the list (see onQuestionSaved), so a teacher never has to
          understand a two-step "bank then select" model — they add, then arrange
          with ↑ ↓ / Edit.

          The list is read from the assessment itself, so a failure to load it is
          surfaced rather than left as bare rows. */}
      {paperError && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error tablet:col-span-2">
          {paperError}
        </div>
      )}

      {/* Primary actions. On mobile this bar is the last element in the page
          flow, so `sticky bottom-0` keeps Save/Publish pinned while the paper
          scrolls, sitting directly above the shell's fixed bottom nav (whose
          space `main` already reserves via `mb-14`). From `tablet:` up it is a
          plain element again, placed by the grid back into the header's row. */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-surface border-t border-border tablet:static tablet:mx-0 tablet:border-0 tablet:bg-transparent tablet:px-0 tablet:py-0 tablet:col-start-2 tablet:row-start-1 tablet:self-start">
        <div className="grid grid-cols-2 gap-2 tablet:flex tablet:flex-wrap tablet:items-center tablet:justify-end tablet:gap-2">
          {/* Always available, whatever the status: the paper is what the
              teacher is assembling, and previewing it must never start an
              attempt or touch a student's record. */}
          <Button
            variant="secondary"
            className="w-full py-3 tablet:w-auto tablet:py-2.5"
            disabled={selected.length === 0}
            title={selected.length === 0 ? "Add questions to the paper first" : undefined}
            onClick={() => setPreviewOpen(true)}
          >
            Preview
          </Button>
          {/* Available regardless of status: a teacher wants to see the worklist
              before publishing too, to check who is in the class. */}
          <Button
            variant="secondary"
            className="w-full py-3 tablet:w-auto tablet:py-2.5"
            onClick={() => router.push(`/teacher/cbt/assessments/${assessmentId}/marking`)}
          >
            Marking &amp; results
          </Button>
          {/* The undo for Publish. A teacher who spots a bad question after publishing
              should not have to archive the assessment (or ask anyone) to fix it. */}
          {published && (
            <Button
              variant="warning"
              className="col-span-2 w-full py-3 tablet:w-auto tablet:py-2.5"
              loading={unpublishing}
              onClick={() => setConfirmUnpublish(true)}
            >
              Unpublish to edit
            </Button>
          )}
          {!published && (
            <>
              <Button
                variant="secondary"
                className="col-span-2 w-full py-3 tablet:w-auto tablet:py-2.5"
                loading={saving}
                disabled={!editable}
                onClick={() =>
                  assessment.attempt_count > 0 ? setConfirmSave(true) : void save()
                }
              >
                Save questions
              </Button>
              <Button
                variant="primary"
                className="col-span-2 w-full py-3 tablet:w-auto tablet:py-2.5"
                loading={publishing}
                onClick={() => (inProgress > 0 ? setConfirmPublish(true) : void publish())}
              >
                Publish
              </Button>
            </>
          )}
        </div>
      </div>

      <AssessmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        assessmentId={assessmentId}
        contextLabel={[className, subjectName].filter(Boolean).join(" · ") || null}
        dirty={selectionDirty}
      />

      <ConfirmDialog
        open={confirmUnpublish}
        title="Unpublish this assessment?"
        message={
          assessment.attempt_count > 0
            ? `Students will no longer see this test and nobody new can start it. ${assessment.attempt_count} attempt(s) already exist — papers already submitted keep exactly what they sat, and any attempt still in progress keeps the paper it started until you publish again. You can now change the questions.`
            : "Students will no longer see this test and nobody new can start it. You can then edit the questions and publish again."
        }
        confirmLabel="Unpublish"
        cancelLabel="Keep published"
        variant="warning"
        loading={unpublishing}
        onConfirm={() => void unpublish()}
        onCancel={() => setConfirmUnpublish(false)}
      />

      <ConfirmDialog
        open={confirmSave}
        title="Save the changed paper?"
        message={
          `${satPapers} paper(s) have already been submitted and keep exactly what those students sat — their marking is unchanged. ` +
          (inProgress > 0
            ? `${inProgress} attempt(s) are still in progress: they keep the paper they started, and when you publish again they receive the updated questions and are asked to review their answers.`
            : "No attempt is in progress right now.")
        }
        confirmLabel="Save paper"
        cancelLabel="Keep editing"
        variant="warning"
        loading={saving}
        onConfirm={() => {
          setConfirmSave(false);
          void save();
        }}
        onCancel={() => setConfirmSave(false)}
      />

      <ConfirmDialog
        open={confirmPublish}
        title="Publish the updated paper?"
        message={`${inProgress} attempt(s) are still being taken. Publishing now replaces their questions with the updated paper and asks those students to go through their answers again. ` +
          (satPapers > 0 ? `${satPapers} submitted paper(s) are unchanged.` : "No paper has been submitted yet.")}
        confirmLabel="Publish"
        cancelLabel="Not yet"
        variant="warning"
        loading={publishing}
        onConfirm={() => {
          setConfirmPublish(false);
          void publish();
        }}
        onCancel={() => setConfirmPublish(false)}
      />

      <AddQuestionsModal
        isOpen={chooserOpen}
        onClose={() => setChooserOpen(false)}
        aiEnabled={aiEnabled}
        onChoose={(choice) => {
          setChooserOpen(false);
          if (choice === "manual") {
            setEditQuestionId(null);
            setQuestionFormOpen(true);
          } else {
            setAiImportMode(choice === "pdf" ? "document" : "image");
            setAiImportOpen(true);
          }
        }}
      />

      <QuestionFormModal
        isOpen={questionFormOpen}
        onClose={() => {
          setQuestionFormOpen(false);
          setEditQuestionId(null);
        }}
        onSaved={onQuestionSaved}
        questionId={editQuestionId}
        classes={[]}
        fixedClassId={assessment.class_id}
        fixedSubjectId={assessment.subject_id}
        fixedLabel={[className, subjectName].filter(Boolean).join(" · ") || null}
      />

      <AiQuestionImportModal
        isOpen={aiImportOpen}
        onClose={() => setAiImportOpen(false)}
        classOptions={[]}
        onSaved={onAiImported}
        fixedClassId={assessment.class_id}
        fixedSubjectId={assessment.subject_id}
        fixedLabel={[className, subjectName].filter(Boolean).join(" · ") || null}
        initialMode={aiImportMode}
        documentTypes="pdf"
      />
    </div>
  );
}
