import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTemplateRows } from "@/lib/report-card";

/**
 * Published report-card configuration snapshots (Phase 11).
 *
 * THE RULE
 * --------
 *   Published = frozen results + frozen configuration + frozen ranking context.
 *
 * Publishing already froze the RESULT (`term_results`, `term_result_components`,
 * `school_admin_comments`). What was still read live on every page view was the
 * CONFIGURATION around those numbers — the component list, the grading bands, the
 * trait names, the display toggles — plus the student's position, recomputed from
 * the current roster. So a school moving its "A" band from 70 to 75, or gaining a
 * student, changed what an already-published card SAID, with nothing edited and
 * nothing in any audit log to explain it.
 *
 * This module captures that configuration at the moment of publication and
 * resolves a card from it afterwards, falling back to live configuration only for
 * cards published before the feature existed (`configuration_snapshot IS NULL`).
 *
 * WHY TWO COLUMNS
 * ---------------
 * `report_card_submissions` is UNIQUE (class_id, term_id) — one row per class and
 * term — so a single snapshot column could only hold the LATEST publication, and
 * republishing would destroy the configuration of the publication it replaced. The
 * agreed lifecycle therefore keeps the current snapshot in
 * `configuration_snapshot` and appends each retired one to `publication_history`:
 *
 *   publish   -> V1 becomes the snapshot
 *   retract   -> nothing is touched; V1 stays readable
 *   republish -> V1 is appended to history; V2 becomes the snapshot
 *
 * NOTHING HERE READS PRODUCTION. Every function takes the client it is given.
 */

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type SnapshotComponent = {
  component_id: string;
  name: string;
  display_order: number;
  maximum_score: number;
};

export type SnapshotGradingRow = {
  grade: string;
  minimum_score: number;
  maximum_score: number;
  remark: string | null;
  principal_remark: string | null;
};

export type SnapshotTrait = {
  trait_id: string;
  name: string;
  display_order: number;
};

export type ConfigurationSnapshot = {
  /** When this snapshot was taken. Readable by a human debugging a card. */
  captured_at: string;
  assessment_components: SnapshotComponent[];
  grading_scale: SnapshotGradingRow[];
  psychomotor_traits: SnapshotTrait[];
  affective_traits: SnapshotTrait[];
  settings: Record<string, unknown> | null;
  /** student_id -> rank at publication. */
  position: Record<string, number>;
  /** How many students the ranking was taken over. */
  class_size: number;
};

/** One retired publication, kept so the previous card remains reproducible. */
export type PublicationHistoryEntry = {
  cycle_id: string | null;
  published_at: string | null;
  published_by: string | null;
  retired_at: string;
  snapshot: ConfigurationSnapshot;
};

// ---------------------------------------------------------------------------
// Reading a snapshot back
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Reads a stored `configuration_snapshot`, or null.
 *
 * Returns null — meaning "render from live configuration" — for anything it does
 * not fully recognise, including a snapshot written by a future version with a
 * shape this one does not know. Degrading to today's behaviour is the safe
 * direction: a card that renders slightly differently is recoverable, a card that
 * renders blank is a parent on the phone.
 *
 * It does NOT repair a partial snapshot. Half a frozen card is worse than an
 * unfrozen one, because it would look authoritative while silently mixing sources.
 */
export function parseConfigurationSnapshot(raw: unknown): ConfigurationSnapshot | null {
  if (!isRecord(raw)) return null;

  const components = raw.assessment_components;
  const grading = raw.grading_scale;
  const psychomotor = raw.psychomotor_traits;
  const affective = raw.affective_traits;
  if (!Array.isArray(components) || !Array.isArray(grading)) return null;
  if (!Array.isArray(psychomotor) || !Array.isArray(affective)) return null;

  const position: Record<string, number> = {};
  if (isRecord(raw.position)) {
    for (const [studentId, rank] of Object.entries(raw.position)) {
      position[studentId] = num(rank);
    }
  }

  return {
    captured_at: str(raw.captured_at),
    assessment_components: components.filter(isRecord).map((c) => ({
      component_id: str(c.component_id),
      name: str(c.name),
      display_order: num(c.display_order),
      maximum_score: num(c.maximum_score),
    })),
    grading_scale: grading.filter(isRecord).map((g) => ({
      grade: str(g.grade),
      minimum_score: num(g.minimum_score),
      maximum_score: num(g.maximum_score),
      remark: typeof g.remark === "string" ? g.remark : null,
      principal_remark: typeof g.principal_remark === "string" ? g.principal_remark : null,
    })),
    psychomotor_traits: psychomotor.filter(isRecord).map((t) => ({
      trait_id: str(t.trait_id),
      name: str(t.name),
      display_order: num(t.display_order),
    })),
    affective_traits: affective.filter(isRecord).map((t) => ({
      trait_id: str(t.trait_id),
      name: str(t.name),
      display_order: num(t.display_order),
    })),
    settings: isRecord(raw.settings) ? raw.settings : null,
    position,
    class_size: num(raw.class_size),
  };
}

/** Reads `publication_history`, or an empty list. Never throws. */
export function parsePublicationHistory(raw: unknown): PublicationHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((entry) => ({
    cycle_id: typeof entry.cycle_id === "string" ? entry.cycle_id : null,
    published_at: typeof entry.published_at === "string" ? entry.published_at : null,
    published_by: typeof entry.published_by === "string" ? entry.published_by : null,
    retired_at: str(entry.retired_at),
    // A history entry whose snapshot cannot be read is kept as an empty one
    // rather than dropped: the entry itself is evidence that a publication
    // happened, and losing that would be worse than losing its details.
    snapshot:
      parseConfigurationSnapshot(entry.snapshot) ?? {
        captured_at: "",
        assessment_components: [],
        grading_scale: [],
        psychomotor_traits: [],
        affective_traits: [],
        settings: null,
        position: {},
        class_size: 0,
      },
  }));
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Competition ranking (1, 2, 2, 4) over summed term totals — identical to the
 * algorithm the report card used before this snapshot existed, so a frozen
 * position and a computed one agree for the same data.
 *
 * Extracted rather than copied: this computation lived in two places already, and
 * "the position the card shows" must not be a third opinion.
 *
 * Note the deliberate difference from `computePositions` in
 * `app/teacher/report-card/lib.ts`, which ranks the prepare/review screens by
 * AVERAGE. This one ranks what the issued card ranks: the SUM of a student's
 * published subject totals. Reconciling the two screens is a product decision and
 * is not part of freezing a card.
 *
 * Returns positions only. The class size a card prints is the ROSTER size, which
 * the caller knows and this function cannot — see `buildSnapshotPatch`.
 */
export function computePositions(
  rows: { student_id: string; total_score: number | string | null }[],
): Record<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.student_id) continue;
    totals.set(row.student_id, (totals.get(row.student_id) ?? 0) + num(row.total_score));
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const position: Record<string, number> = {};
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) currentRank = i + 1;
    position[sorted[i][0]] = currentRank;
  }

  return position;
}

// ---------------------------------------------------------------------------
// Resolving a card: snapshot first, live only as a fallback
// ---------------------------------------------------------------------------

export type ResolvedCardConfiguration = {
  source: "snapshot" | "live";
  components: unknown[];
  gradingScale: unknown[];
  psychomotorTraits: unknown[];
  affectiveTraits: unknown[];
  settings: Record<string, unknown> | null;
  position: number | null;
  classSize: number;
};

/**
 * Decides which configuration a report card renders from.
 *
 * Pure, so the acceptance rule — "changing live configuration must not alter a
 * published report" — is provable without a database, a browser or a route.
 *
 * A snapshot wins on every field it carries. The one field worth calling out is
 * `position`: it is read per student, and if a snapshot has no entry for a student
 * who sat the paper late, the live value is used rather than dropping the rank.
 */
export function resolveCardConfiguration(args: {
  studentId: string;
  snapshot: ConfigurationSnapshot | null;
  live: {
    components: unknown[];
    gradingScale: unknown[];
    psychomotorTraits: unknown[];
    affectiveTraits: unknown[];
    settings: Record<string, unknown> | null;
    position: number | null;
    classSize: number;
  };
}): ResolvedCardConfiguration {
  const { studentId, snapshot, live } = args;

  if (!snapshot) {
    return { source: "live", ...live };
  }

  const frozenPosition = snapshot.position[studentId];

  // Mapped to the shape the live templates have (`id`, not `component_id` /
  // `trait_id`), because the report-card UI already reads `.id`. A snapshot that
  // handed back different key names would render a blank card — the API boundary
  // is where the two shapes are reconciled, so the UI needs no knowledge of which
  // source it is being served from.
  return {
    source: "snapshot",
    components: snapshot.assessment_components.map((c) => ({
      id: c.component_id,
      name: c.name,
      display_order: c.display_order,
      maximum_score: c.maximum_score,
    })),
    gradingScale: snapshot.grading_scale,
    psychomotorTraits: snapshot.psychomotor_traits.map((t) => ({
      id: t.trait_id,
      name: t.name,
      display_order: t.display_order,
    })),
    affectiveTraits: snapshot.affective_traits.map((t) => ({
      id: t.trait_id,
      name: t.name,
      display_order: t.display_order,
    })),
    settings: snapshot.settings ?? live.settings,
    position: typeof frozenPosition === "number" ? frozenPosition : live.position,
    classSize: snapshot.class_size || live.classSize,
  };
}

// ---------------------------------------------------------------------------
// Reading the snapshot for a class + term
// ---------------------------------------------------------------------------

/**
 * The snapshot a published card must render from, or null.
 *
 * Null is the documented state for a card published before this feature existed,
 * and it means "render from live configuration" — today's behaviour. This is the
 * only place that decision is made, so the fallback cannot drift between callers.
 */
export async function readConfigurationSnapshot(
  supabase: SupabaseClient,
  schoolId: string,
  classId: string,
  termId: string,
): Promise<ConfigurationSnapshot | null> {
  if (!classId || !termId) return null;

  const { data } = await supabase
    .from("report_card_submissions")
    .select("configuration_snapshot")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("term_id", termId)
    .maybeSingle();

  return parseConfigurationSnapshot(data?.configuration_snapshot);
}

// ---------------------------------------------------------------------------
// Capturing a snapshot
// ---------------------------------------------------------------------------

/**
 * Builds the two column values to write when a class+term is published.
 *
 * Returns a PATCH rather than performing its own write, so the caller can set the
 * snapshot in the same UPDATE that sets `status = 'published'`. A separate write
 * would leave a window in which a card is published but has no configuration —
 * precisely the state this feature exists to remove.
 *
 * Must be called AFTER the frozen results are written, because the ranking is
 * derived from them.
 */
export async function buildSnapshotPatch(args: {
  supabase: SupabaseClient;
  schoolId: string;
  classId: string;
  termId: string;
  /** Overrides the clock in tests. */
  now?: string;
}): Promise<{
  configuration_snapshot: ConfigurationSnapshot;
  publication_history: PublicationHistoryEntry[] | null;
}> {
  const { supabase, schoolId, classId, termId } = args;
  const now = args.now ?? new Date().toISOString();

  const [components, gradingScale, psychomotorTraits, affectiveTraits, settingsRow, roster] =
    await Promise.all([
      resolveTemplateRows(schoolId, classId, "class_components_templates", "components_templates", "components_rows"),
      resolveTemplateRows(schoolId, classId, "class_grading_templates", "grading_templates", "grading_rows", "minimum_score"),
      resolveTemplateRows(schoolId, classId, "class_psychomotor_templates", "psychomotor_templates", "psychomotor_rows"),
      resolveTemplateRows(schoolId, classId, "class_affective_templates", "affective_templates", "affective_rows"),
      supabase.from("report_card_settings").select("*").eq("school_id", schoolId).maybeSingle(),
      supabase.from("students").select("id").eq("school_id", schoolId).eq("class_id", classId),
    ]);

  const studentIds = (roster.data ?? []).map((s) => s.id as string);

  // The ranking is taken over the FROZEN totals, and only for the students who
  // were in this class — not the student's current class, which is what the card
  // used to do and which changed a published card after a promotion.
  const { data: results } = studentIds.length
    ? await supabase
        .from("term_results")
        .select("student_id, total_score")
        .eq("term_id", termId)
        .in("student_id", studentIds)
    : { data: [] as { student_id: string; total_score: number | null }[] };

  const position = computePositions(
    (results ?? []).map((r) => ({ student_id: r.student_id as string, total_score: r.total_score })),
  );

  // Class size is the ROSTER, not the number of students who sat a paper. The card has
  // always read "5th of 32" from the roster while ranking only those with results — a
  // class of 32 where 5 sat the term would otherwise freeze as "1st of 5" and change
  // what an already-issued card says.
  const class_size = studentIds.length;

  const configuration_snapshot: ConfigurationSnapshot = {
    captured_at: now,
    assessment_components: (components as Record<string, unknown>[]).map((c) => ({
      component_id: String(c.id ?? ""),
      name: String(c.name ?? ""),
      display_order: num(c.display_order),
      maximum_score: num(c.maximum_score),
    })),
    grading_scale: (gradingScale as Record<string, unknown>[]).map((g) => ({
      grade: String(g.grade ?? ""),
      minimum_score: num(g.minimum_score),
      maximum_score: num(g.maximum_score),
      remark: typeof g.remark === "string" ? g.remark : null,
      principal_remark: typeof g.principal_remark === "string" ? g.principal_remark : null,
    })),
    psychomotor_traits: (psychomotorTraits as Record<string, unknown>[]).map((t) => ({
      trait_id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      display_order: num(t.display_order),
    })),
    affective_traits: (affectiveTraits as Record<string, unknown>[]).map((t) => ({
      trait_id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      display_order: num(t.display_order),
    })),
    settings: (settingsRow.data as Record<string, unknown> | null) ?? null,
    position,
    class_size,
  };

  // Retire the outgoing publication, if there is one. Reading the row here (rather
  // than trusting the caller) means the history entry carries the context of the
  // publication it is closing, not the one about to open.
  const { data: existing } = await supabase
    .from("report_card_submissions")
    .select("configuration_snapshot, publication_history, published_at, published_by, correction_cycle_id")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("term_id", termId)
    .maybeSingle();

  const previous = parseConfigurationSnapshot(existing?.configuration_snapshot);
  let publication_history: PublicationHistoryEntry[] | null =
    existing?.publication_history == null ? null : parsePublicationHistory(existing.publication_history);

  if (previous) {
    const retired: PublicationHistoryEntry = {
      cycle_id: (existing?.correction_cycle_id as string) ?? null,
      published_at: (existing?.published_at as string) ?? null,
      published_by: (existing?.published_by as string) ?? null,
      retired_at: now,
      snapshot: previous,
    };
    publication_history = [...(publication_history ?? []), retired];
  }

  return { configuration_snapshot, publication_history };
}
