import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildSnapshotPatch,
  computePositions,
  parseConfigurationSnapshot,
  parsePublicationHistory,
  resolveCardConfiguration,
  type ConfigurationSnapshot,
} from "../report-card-snapshot";
import { fakeSupabase, type QuerySpec } from "../ai/__tests__/fake-supabase";

/**
 * The acceptance rule for Phase 11, in one sentence:
 *
 *   Changing a school's live configuration must not alter an already-published
 *   report card.
 *
 * `resolveCardConfiguration` is where that rule lives, so it is asserted here
 * directly rather than only through a route that needs a database, a session and
 * a browser.
 *
 * `buildSnapshotPatch` is the other half: it decides WHAT gets frozen at the
 * moment of publication. It is asserted against the shared fake client, with only
 * the template resolver mocked — the loop that actually produced the drift was
 * "read the live templates at publication, then read them again at render time",
 * so the templates are the one collaborator worth substituting.
 */

const templates = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/lib/report-card", () => ({
  resolveTemplateRows: async (
    _schoolId: string,
    _classId: string,
    _linkTable: string,
    _templateTable: string,
    rowsTable: string,
  ) => templates.rows[rowsTable] ?? [],
}));

const V1 = {
  captured_at: "2026-03-01T10:00:00.000Z",
  assessment_components: [
    { component_id: "c1", name: "CA1", display_order: 1, maximum_score: 20 },
    { component_id: "c2", name: "CA2", display_order: 2, maximum_score: 20 },
    { component_id: "c3", name: "Exam", display_order: 3, maximum_score: 60 },
  ],
  grading_scale: [
    { grade: "A", minimum_score: 70, maximum_score: 100, remark: "excellent", principal_remark: null },
    { grade: "B", minimum_score: 60, maximum_score: 69, remark: "very good", principal_remark: null },
  ],
  psychomotor_traits: [
    { trait_id: "p1", name: "Attentiveness", display_order: 1 },
    { trait_id: "p2", name: "Neatness", display_order: 2 },
  ],
  affective_traits: [{ trait_id: "a1", name: "Politeness", display_order: 1 }],
  settings: { show_grading_key: true, show_position: true },
  position: { student1: 5 },
  class_size: 32,
};

const snapshotOf = (raw: unknown): ConfigurationSnapshot => {
  const parsed = parseConfigurationSnapshot(raw);
  if (!parsed) throw new Error(`expected a parseable snapshot, got null for ${JSON.stringify(raw)}`);
  return parsed;
};

describe("parseConfigurationSnapshot", () => {
  it("parses a complete snapshot and coerces its numbers", () => {
    const parsed = snapshotOf({ ...V1, class_size: "32", position: { student1: "5" } });

    expect(parsed.assessment_components).toHaveLength(3);
    expect(parsed.assessment_components[0]).toEqual({
      component_id: "c1",
      name: "CA1",
      display_order: 1,
      maximum_score: 20,
    });
    expect(parsed.position).toEqual({ student1: 5 });
    expect(parsed.class_size).toBe(32);
  });

  it("refuses anything that is not an object", () => {
    for (const raw of [null, undefined, [], "{}", 7, false]) {
      expect(parseConfigurationSnapshot(raw)).toBeNull();
    }
  });

  it("refuses a PARTIAL snapshot rather than half-freezing a card", () => {
    // Precondition: the same object, complete, DOES parse — so this is about the
    // missing key, not about a malformed fixture.
    expect(parseConfigurationSnapshot(V1)).not.toBeNull();

    const withoutGrading: Record<string, unknown> = { ...V1 };
    delete withoutGrading.grading_scale;
    expect(parseConfigurationSnapshot(withoutGrading)).toBeNull();
    expect(parseConfigurationSnapshot({ ...V1, assessment_components: undefined })).toBeNull();
    expect(parseConfigurationSnapshot({ ...V1, psychomotor_traits: "none" })).toBeNull();
  });

  it("drops junk entries inside an array instead of failing the whole snapshot", () => {
    const parsed = snapshotOf({
      ...V1,
      assessment_components: [...V1.assessment_components, null, "CA3", 42],
    });
    expect(parsed.assessment_components).toHaveLength(3);
  });

  it("treats a non-object settings value as absent", () => {
    expect(snapshotOf({ ...V1, settings: "on" }).settings).toBeNull();
    expect(snapshotOf({ ...V1, settings: null }).settings).toBeNull();
  });
});

describe("parsePublicationHistory", () => {
  it("returns an empty list for anything that is not an array", () => {
    expect(parsePublicationHistory(null)).toEqual([]);
    expect(parsePublicationHistory({})).toEqual([]);
    expect(parsePublicationHistory("V1")).toEqual([]);
  });

  it("keeps an entry whose snapshot cannot be read, rather than dropping the evidence", () => {
    const history = parsePublicationHistory([
      { cycle_id: "cyc-1", published_at: "2026-03-01T00:00:00.000Z", published_by: "u1", retired_at: "2026-04-01T00:00:00.000Z", snapshot: "corrupt" },
    ]);

    expect(history).toHaveLength(1);
    expect(history[0].cycle_id).toBe("cyc-1");
    expect(history[0].snapshot.assessment_components).toEqual([]);
  });
});

describe("computePositions", () => {
  it("sums a student's subjects before ranking", () => {
    // a sits two papers (40 + 35 = 75) and overtakes b on one (60). If the
    // ranking used a single row rather than the sum, b would come first.
    const position = computePositions([
      { student_id: "a", total_score: 40 },
      { student_id: "a", total_score: 35 },
      { student_id: "b", total_score: 60 },
    ]);

    expect(position).toEqual({ a: 1, b: 2 });
  });

  it("gives tied totals the same rank and skips the next, as the card always has", () => {
    const position = computePositions([
      { student_id: "a", total_score: 90 },
      { student_id: "b", total_score: 80 },
      { student_id: "c", total_score: 80 },
      { student_id: "d", total_score: 70 },
    ]);

    expect(position).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });

  it("handles an empty roster", () => {
    expect(computePositions([])).toEqual({});
  });

  it("coerces numeric strings and ignores unusable totals rather than producing NaN ranks", () => {
    const position = computePositions([
      { student_id: "a", total_score: "55" },
      { student_id: "b", total_score: null },
      { student_id: "", total_score: 10 },
    ]);

    expect(position).toEqual({ a: 1, b: 2 });
    expect(Object.values(position).every((r) => Number.isFinite(r))).toBe(true);
  });
});

describe("resolveCardConfiguration — the Phase 11 rule", () => {
  const liveV1 = {
    components: [{ name: "LIVE CA1" }],
    gradingScale: [{ grade: "LIVE A", minimum_score: 70 }],
    psychomotorTraits: [{ name: "LIVE Attentiveness" }],
    affectiveTraits: [{ name: "LIVE Politeness" }],
    settings: { show_grading_key: true },
    position: 99,
    classSize: 99,
  };

  it("renders a published card from the snapshot, not from live configuration", () => {
    const resolved = resolveCardConfiguration({
      studentId: "student1",
      snapshot: snapshotOf(V1),
      live: liveV1,
    });

    expect(resolved.source).toBe("snapshot");
    // Mapped to the UI's shape: `id`, matching the live template rows.
    expect(resolved.components).toEqual([
      { id: "c1", name: "CA1", display_order: 1, maximum_score: 20 },
      { id: "c2", name: "CA2", display_order: 2, maximum_score: 20 },
      { id: "c3", name: "Exam", display_order: 3, maximum_score: 60 },
    ]);
    expect(resolved.gradingScale).toEqual(V1.grading_scale);
    expect(resolved.psychomotorTraits).toEqual([
      { id: "p1", name: "Attentiveness", display_order: 1 },
      { id: "p2", name: "Neatness", display_order: 2 },
    ]);
    expect(resolved.affectiveTraits).toEqual([{ id: "a1", name: "Politeness", display_order: 1 }]);
    // Never the live values.
    expect(JSON.stringify(resolved)).not.toContain("LIVE");
  });

  it("THE ACCEPTANCE TEST: changing every part of the live configuration alters nothing", () => {
    const snapshot = snapshotOf(V1);

    const before = resolveCardConfiguration({ studentId: "student1", snapshot, live: liveV1 });

    // Exactly the spec's "after publication" changes: the A band moves, the
    // components are replaced, the psychomotor traits are replaced, and the
    // affective traits change too.
    const liveV2 = {
      components: [{ name: "Test" }, { name: "Exam" }],
      gradingScale: [{ grade: "A", minimum_score: 75, maximum_score: 100 }],
      psychomotorTraits: [{ name: "Concentration" }, { name: "Personal Hygiene" }],
      affectiveTraits: [{ name: "Diligence" }],
      settings: { show_grading_key: false },
      position: 5,
      classSize: 35,
    };
    const after = resolveCardConfiguration({ studentId: "student1", snapshot, live: liveV2 });

    expect(after).toEqual(before);
    expect(after.classSize).toBe(32);
    expect(after.position).toBe(5);
  });

  it("uses live configuration only when there is no snapshot", () => {
    const resolved = resolveCardConfiguration({
      studentId: "student1",
      snapshot: null,
      live: liveV1,
    });

    expect(resolved.source).toBe("live");
    expect(resolved.components).toEqual(liveV1.components);
    expect(resolved.position).toBe(99);
  });

  it("freezes the position, and falls back to live only for a student the snapshot missed", () => {
    const snapshot = snapshotOf(V1);

    const known = resolveCardConfiguration({ studentId: "student1", snapshot, live: liveV1 });
    expect(known.position).toBe(5);

    const late = resolveCardConfiguration({ studentId: "student-late", snapshot, live: liveV1 });
    expect(late.position).toBe(99);
    expect(late.source).toBe("snapshot");
  });
});

// ---------------------------------------------------------------------------
// What publication freezes
// ---------------------------------------------------------------------------

const PUBLISHED_AT = "2026-03-01T09:00:00.000Z";
const REPUBLISHED_AT = "2026-04-01T09:00:00.000Z";

/** Answers the four reads `buildSnapshotPatch` makes for itself. */
function fakeDb(
  fixture: {
    settings?: Record<string, unknown> | null;
    roster?: { id: string }[];
    totals?: { student_id: string; total_score: number | string | null }[];
    submission?: Record<string, unknown> | null;
  } = {},
) {
  return fakeSupabase({
    select: (spec: QuerySpec) => {
      let rows: unknown[] = [];
      if (spec.table === "report_card_settings") rows = fixture.settings ? [fixture.settings] : [];
      else if (spec.table === "students") rows = fixture.roster ?? [];
      else if (spec.table === "term_results") rows = fixture.totals ?? [];
      else if (spec.table === "report_card_submissions") rows = fixture.submission ? [fixture.submission] : [];
      return { data: rows, error: null };
    },
  });
}

describe("buildSnapshotPatch — what publication freezes", () => {
  beforeEach(() => {
    templates.rows = {
      components_rows: [{ id: "c1", name: "CA1", display_order: 1, maximum_score: 20 }],
      grading_rows: [
        { grade: "A", minimum_score: 70, maximum_score: 100, remark: "excellent", principal_remark: "{name} had {average}%" },
      ],
      psychomotor_rows: [{ id: "p1", name: "Attentiveness", display_order: 1 }],
      affective_rows: [{ id: "a1", name: "Politeness", display_order: 1 }],
    };
  });

  it("captures the configuration the card renders with, and writes nothing itself", async () => {
    const db = fakeDb({ settings: { show_grading_key: true } });

    const patch = await buildSnapshotPatch({
      supabase: db.client, schoolId: "s1", classId: "cl1", termId: "t1", now: PUBLISHED_AT,
    });

    expect(patch.configuration_snapshot).toEqual({
      captured_at: PUBLISHED_AT,
      assessment_components: [{ component_id: "c1", name: "CA1", display_order: 1, maximum_score: 20 }],
      grading_scale: [
        { grade: "A", minimum_score: 70, maximum_score: 100, remark: "excellent", principal_remark: "{name} had {average}%" },
      ],
      psychomotor_traits: [{ trait_id: "p1", name: "Attentiveness", display_order: 1 }],
      affective_traits: [{ trait_id: "a1", name: "Politeness", display_order: 1 }],
      settings: { show_grading_key: true },
      position: {},
      class_size: 0,
    });

    // A PATCH, not a write: the caller must publish and freeze in one UPDATE, or a
    // card can exist that is visible to students with no configuration behind it.
    expect(db.updates).toEqual([]);

    // What we hand to PostgREST has to be JSONB-safe, and has to survive the parser
    // the renderer will put it through.
    const roundTripped = parseConfigurationSnapshot(JSON.parse(JSON.stringify(patch.configuration_snapshot)));
    expect(roundTripped).toEqual(patch.configuration_snapshot);
  });

  it("ranks the class from the frozen totals, and counts the ROSTER as the class size", async () => {
    const db = fakeDb({
      // Four students are in the class; three sat the term. The card says "of 4" —
      // ranking three students must not silently shrink the class the card reports.
      roster: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      // a sits two papers (40 + 35 = 75) and leads c on one (70). Summing before
      // ranking is what makes that true.
      totals: [
        { student_id: "a", total_score: 40 },
        { student_id: "a", total_score: 35 },
        { student_id: "b", total_score: 60 },
        { student_id: "c", total_score: 70 },
      ],
    });

    const patch = await buildSnapshotPatch({
      supabase: db.client, schoolId: "s1", classId: "cl1", termId: "t1", now: PUBLISHED_AT,
    });

    expect(patch.configuration_snapshot.position).toEqual({ a: 1, c: 2, b: 3 });
    expect(patch.configuration_snapshot.class_size).toBe(4);

    // Ranking is scoped to the students of THIS class, so the reader must have asked
    // for the frozen totals of the roster it was given.
    const totalsQuery = db.selects.find((s) => s.table === "term_results");
    expect(totalsQuery?.filters).toContainEqual(["term_id", "t1"]);
    expect(totalsQuery?.filters).toContainEqual(["student_id", ["a", "b", "c", "d"]]);
  });

  it("retires the outgoing publication into history and keeps the earlier cycles", async () => {
    const db = fakeDb({
      submission: {
        configuration_snapshot: V1,
        publication_history: [
          {
            cycle_id: "cycle-0",
            published_at: "2026-01-01T00:00:00.000Z",
            published_by: "u0",
            retired_at: "2026-02-01T00:00:00.000Z",
            snapshot: { ...V1, captured_at: "2026-01-01T00:00:00.000Z" },
          },
        ],
        published_at: "2026-02-10T00:00:00.000Z",
        published_by: "u1",
        correction_cycle_id: "cycle-1",
      },
    });

    const patch = await buildSnapshotPatch({
      supabase: db.client, schoolId: "s1", classId: "cl1", termId: "t1", now: REPUBLISHED_AT,
    });

    // The retired configuration is NOT the one that becomes current: republishing
    // opens a new publication state rather than rewriting the old one.
    expect(patch.configuration_snapshot.captured_at).toBe(REPUBLISHED_AT);
    expect(patch.configuration_snapshot).not.toEqual(V1);

    const history = parsePublicationHistory(patch.publication_history);
    expect(history).toHaveLength(2);
    expect(history[0].cycle_id).toBe("cycle-0"); // untouched, still first
    expect(history[1]).toEqual({
      cycle_id: "cycle-1",
      published_at: "2026-02-10T00:00:00.000Z",
      published_by: "u1",
      retired_at: REPUBLISHED_AT,
      snapshot: snapshotOf(V1),
    });
  });

  it("invents no history when there was no previous publication to retire", async () => {
    const first = await buildSnapshotPatch({
      supabase: fakeDb({ submission: null }).client,
      schoolId: "s1", classId: "cl1", termId: "t1", now: PUBLISHED_AT,
    });
    expect(first.publication_history).toBeNull();

    // The legacy row: published before this feature existed, so both columns are
    // NULL. Republishing it must not fabricate a configuration nobody ever saw.
    const legacy = await buildSnapshotPatch({
      supabase: fakeDb({
        submission: { configuration_snapshot: null, publication_history: null, published_at: PUBLISHED_AT, published_by: "u1", correction_cycle_id: null },
      }).client,
      schoolId: "s1", classId: "cl1", termId: "t1", now: REPUBLISHED_AT,
    });

    expect(legacy.publication_history).toBeNull();
    expect(legacy.configuration_snapshot.captured_at).toBe(REPUBLISHED_AT);
  });
});
