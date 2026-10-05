"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, toast } from "@/components/ui";
import { AiQuestionImportModal } from "../../questions/AiQuestionImportModal";
import { QuestionFormModal } from "../../questions/QuestionFormModal";
import { AddQuestionsModal } from "./AddQuestionsModal";
import { AssessmentPreviewModal } from "./AssessmentPreviewModal";

/**
 * CBT assessment builder (Phase 17 UI) — the paper, and publishing it.
 *
 * This is the screen that makes the question bank worth having: choose the
 * questions, see what the paper is worth against the component's ceiling, and
 * publish.
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

type QuestionStatus = "draft" | "review" | "approved" | "archived";
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
};

type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  status: QuestionStatus;
  section: string | null;
  section_instruction: string | null;
  has_image?: boolean;
};

/**
 * Section headings, in the order they will read on the paper: the saved
 * sections first, then any section that arrives with a newly added question.
 */
function deriveSectionLabels(
  saved: { label: string }[] | null,
  selectedIds: string[],
  bankById: Map<string, BankQuestion>,
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
  for (const id of selectedIds) add(bankById.get(id)?.section);
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
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [selected, setSelected] = useState<{ question_id: string; marks_override: number | null }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [componentMax, setComponentMax] = useState<number | null>(null);
  // Class and subject names, for the pinned-context labels on the question and
  // AI forms opened from here.
  const [className, setClassName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  // The pool is the assessment's class + subject (server-enforced). Legacy
  // questions with no class/subject are deliberately not offered here — they
  // cannot be attributed to this paper's context.
  const [poolError, setPoolError] = useState<string | null>(null);
  // Pool checkboxes STAGE questions; "Add selected" appends them to the paper.
  const [poolSelection, setPoolSelection] = useState<string[]>([]);
  const [sectionInstructions, setSectionInstructions] = useState<Record<string, string>>({});
  const [savingSections, setSavingSections] = useState(false);
  // Question-authoring actions inside the builder (manual and AI).
  const [aiEnabled, setAiEnabled] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [questionFormOpen, setQuestionFormOpen] = useState(false);
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
  const loadPool = useCallback(async (detail: AssessmentDetail) => {
    setPoolError(null);
    try {
      const params = new URLSearchParams({ status: "approved" });
      if (detail.class_id) params.set("class_id", detail.class_id);
      if (detail.subject_id) params.set("subject_id", detail.subject_id);

      const res = await fetch(`/api/cbt/questions?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBank([]);
        setPoolError(body.error || `Could not load the question pool (HTTP ${res.status})`);
        return;
      }

      const pool = (body.questions ?? []) as BankQuestion[];
      setBank(pool);

      // Prefill section instructions: the assessment's saved copy wins, then
      // whatever the AI import captured on the questions themselves.
      setSectionInstructions((current) => {
        const next = { ...current };
        for (const s of detail.sections ?? []) {
          if (!(s.label in next)) next[s.label] = s.instruction ?? "";
        }
        for (const q of pool) {
          const label = (q.section ?? "").trim();
          if (!label || label in next || !q.section_instruction) continue;
          next[label] = q.section_instruction;
        }
        return next;
      });
    } catch {
      setBank([]);
      setPoolError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const loaded = await load();
      if (loaded) await loadPool(loaded);
    });
  }, [load, loadPool]);

  const bankById = new Map(bank.map((q) => [q.id, q]));

  // A saved override wins, then the bank's own value, then whatever the
  // assessment last stored — for a question that is no longer approved.
  const marksFor = (id: string, override: number | null): number => {
    if (override !== null) return override;
    const fromBank = bankById.get(id)?.marks;
    if (fromBank !== undefined) return fromBank;
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

  // Bulk-add: everything in the pool that is not already on the paper, in pool
  // order, appended so the teacher's existing order is untouched.
  const addAll = () => {
    setProblems([]);
    setPoolSelection([]);
    setSelected((current) => {
      const have = new Set(current.map((s) => s.question_id));
      const additions = bank
        .filter((q) => !have.has(q.id))
        .map((q) => ({ question_id: q.id, marks_override: null }));
      return [...current, ...additions];
    });
  };

  const togglePoolPick = (id: string) => {
    setPoolSelection((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  };

  // Option B: add exactly the questions the teacher ticked, in pool order.
  const addSelected = () => {
    if (poolSelection.length === 0) return;
    setProblems([]);
    const picks = poolSelection;
    setPoolSelection([]);
    setSelected((current) => {
      const have = new Set(current.map((s) => s.question_id));
      const additions = bank
        .filter((q) => picks.includes(q.id) && !have.has(q.id))
        .map((q) => ({ question_id: q.id, marks_override: null }));
      return [...current, ...additions];
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
  // class + subject (pinned in the form) and goes straight onto the paper — the
  // teacher opened "Add question" to use it here.
  const onQuestionSaved = (questionId: string | null) => {
    if (questionId) addQuestionToPaper(questionId);
    if (assessment) void loadPool(assessment);
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
    if (assessment) void loadPool(assessment);
  };

  const poolAdditions = bank.filter((q) => !isSelected(q.id)).length;
  const sectionLabels = deriveSectionLabels(
    assessment?.sections ?? null,
    selected.map((s) => s.question_id),
    bankById,
  );

  const sectionQuestionCount = (label: string) =>
    selected.filter(
      (s) =>
        (bankById.get(s.question_id)?.section ?? "").trim().toLowerCase() === label.toLowerCase(),
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
      toast.success("Assessment published");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPublishing(false);
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
      <div className="p-6 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="p-6 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Assessment not found."}
        </div>
        <Button variant="secondary" onClick={() => router.push("/teacher/cbt/assessments")}>
          Back to assessments
        </Button>
      </div>
    );
  }

  const frozen = assessment.attempt_count > 0;
  const published = assessment.status === "published";
  const editable = !frozen && !published;

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
    <div className="p-6 tablet:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push("/teacher/cbt/assessments")}
            className="text-caption text-text-secondary hover:text-primary transition-colors"
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
        <div className="flex flex-wrap gap-2">
          {/* Always available, whatever the status: the paper is what the
              teacher is assembling, and previewing it must never start an
              attempt or touch a student's record. */}
          <Button
            variant="secondary"
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
            onClick={() => router.push(`/teacher/cbt/assessments/${assessmentId}/marking`)}
          >
            Marking &amp; results
          </Button>
          {!published && (
            <>
              <Button
                variant="secondary"
                loading={saving}
                disabled={!editable}
                onClick={() => void save()}
              >
                Save questions
              </Button>
              <Button variant="primary" loading={publishing} onClick={() => void publish()}>
                Publish
              </Button>
            </>
          )}
        </div>
      </div>

      {published && (
        <div className="rounded-lg border border-success bg-success-bg px-4 py-3 text-body text-success">
          This assessment is published. Students in the class can attempt it while it stays
          published.
        </div>
      )}

      {frozen && !published && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          {assessment.attempt_count} attempt(s) already exist, so this assessment&apos;s class,
          term, component and questions can no longer be changed.
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 space-y-1">
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
          subject (the server enforces that context). */}
      {editable && assessment.subject_id && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setChooserOpen(true)}>
            Add Questions
          </Button>
        </div>
      )}

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2 font-semibold text-text-primary">
            Paper — {selected.length} question(s)
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
            No questions yet. Pick from the approved questions below.
          </p>
        ) : (
          <ol className="space-y-2">
            {selected.map((s, i) => {
              const q = bankById.get(s.question_id);
              return (
                <li
                  key={s.question_id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="text-caption text-text-disabled font-mono w-6">{i + 1}</span>
                  <span className="flex-1 text-body text-text-primary line-clamp-2">
                    {q?.question_text ?? "(question no longer approved)"}
                  </span>
                  {q?.section && (
                    <span className="text-caption rounded-full border border-border px-2 py-0.5 text-text-secondary">
                      {q.section}
                    </span>
                  )}
                  <span className="text-caption text-text-secondary">
                    {TYPE_LABEL[q?.question_type ?? ""] ?? "—"}
                  </span>
                  <span className="text-caption font-mono text-text-secondary">
                    {marksFor(s.question_id, s.marks_override)}
                  </span>
                  {editable && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>
                        ↑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>
                        ↓
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(s.question_id)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {sectionLabels.length > 0 && (
        <Card variant="default" className="space-y-4">
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

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">Question pool</h2>
            <p className="text-caption text-text-secondary mt-1">
              Approved questions filed under this assessment&apos;s class and subject.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={!editable || poolSelection.length === 0}
              onClick={addSelected}
            >
              Add selected{poolSelection.length > 0 ? ` (${poolSelection.length})` : ""}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!editable || poolAdditions === 0}
              onClick={addAll}
            >
              Add all{poolAdditions > 0 ? ` (${poolAdditions})` : ""}
            </Button>
          </div>
        </div>

        {poolError && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {poolError}
          </div>
        )}

        {bank.length === 0 ? (
          <p className="text-body text-text-secondary">
            No saved questions for this class and subject yet. Add some with Add Questions
            above, or create them in the question bank.
          </p>
        ) : (
          <div className="space-y-2">
            {bank.map((q) => (
              <label
                key={q.id}
                className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors ${
                  editable && !isSelected(q.id) ? "cursor-pointer hover:bg-clay" : "opacity-70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected(q.id) || poolSelection.includes(q.id)}
                  disabled={!editable || isSelected(q.id)}
                  onChange={() => togglePoolPick(q.id)}
                />
                <span className="flex-1 text-body text-text-primary line-clamp-2">
                  {q.question_text}
                </span>
                {isSelected(q.id) && (
                  <span className="text-caption rounded-full border border-success bg-success-bg px-2 py-0.5 text-success">
                    On the paper
                  </span>
                )}
                {q.has_image && (
                  <span className="text-caption rounded-full border border-border px-2 py-0.5 text-text-secondary">
                    Image
                  </span>
                )}
                {q.section && (
                  <span className="text-caption rounded-full border border-border px-2 py-0.5 text-text-secondary">
                    {q.section}
                  </span>
                )}
                <span className="text-caption text-text-secondary">
                  {TYPE_LABEL[q.question_type]}
                </span>
                <span className="text-caption font-mono text-text-secondary">{q.marks}</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      <AssessmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        assessmentId={assessmentId}
        contextLabel={[className, subjectName].filter(Boolean).join(" · ") || null}
        dirty={selectionDirty}
      />

      <AddQuestionsModal
        isOpen={chooserOpen}
        onClose={() => setChooserOpen(false)}
        aiEnabled={aiEnabled}
        onChoose={(choice) => {
          setChooserOpen(false);
          if (choice === "manual") {
            setQuestionFormOpen(true);
          } else {
            setAiImportMode(choice === "pdf" ? "document" : "image");
            setAiImportOpen(true);
          }
        }}
      />

      <QuestionFormModal
        isOpen={questionFormOpen}
        onClose={() => setQuestionFormOpen(false)}
        onSaved={onQuestionSaved}
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
