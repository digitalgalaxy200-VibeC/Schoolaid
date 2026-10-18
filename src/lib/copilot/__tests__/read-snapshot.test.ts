import { describe, it, expect } from "vitest";
import {
  MAX_SNAPSHOT_CHARS,
  buildReadSnapshot,
  isSnapshotFresh,
} from "../read-protocol";

/**
 * Read snapshots are what stop the next turn from re-reading the same data and
 * re-planning it. Two properties matter: the snapshot stays inside the context
 * budget, and a stale or malformed record is never silently trusted.
 */

const NOW = "2026-10-18T12:00:00.000Z";

type Snapshot = {
  at?: unknown;
  results?: { capability?: unknown; data?: unknown; error?: unknown }[];
};

describe("buildReadSnapshot", () => {
  it("returns null when the reply read nothing", () => {
    expect(buildReadSnapshot([], NOW)).toBeNull();
  });

  it("includes the capability, its data, and the timestamp", () => {
    const snapshot = buildReadSnapshot(
      [{ capability: "list_classes", data: [{ name: "Basic 1" }] }],
      NOW,
    ) as Snapshot;

    expect(snapshot.at).toBe(NOW);
    expect(snapshot.results).toHaveLength(1);
    expect(snapshot.results?.[0]?.capability).toBe("list_classes");
    expect(snapshot.results?.[0]?.data).toEqual([{ name: "Basic 1" }]);
  });

  it("keeps errors as errors", () => {
    const snapshot = buildReadSnapshot(
      [{ capability: "list_teachers", error: "no school selected" }],
      NOW,
    ) as Snapshot;

    expect(snapshot.results?.[0]).toMatchObject({
      capability: "list_teachers",
      error: "no school selected",
    });
  });

  it("keeps the serialised snapshot inside MAX_SNAPSHOT_CHARS", () => {
    const results = Array.from({ length: 40 }, () => ({
      capability: "list_students",
      data: "x".repeat(10_000),
    }));

    const snapshot = buildReadSnapshot(results, NOW);

    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(MAX_SNAPSHOT_CHARS);
  });
});

describe("isSnapshotFresh", () => {
  const nowMs = Date.parse(NOW);

  it("accepts a snapshot from within the window", () => {
    const snapshot = { at: new Date(nowMs - 60_000).toISOString(), results: [] };
    expect(isSnapshotFresh(snapshot, nowMs)).toBe(true);
  });

  it("rejects a snapshot older than the window", () => {
    const snapshot = {
      at: new Date(nowMs - 11 * 60 * 1000).toISOString(),
      results: [],
    };
    expect(isSnapshotFresh(snapshot, nowMs)).toBe(false);
  });

  it("rejects malformed snapshots", () => {
    expect(isSnapshotFresh(null, nowMs)).toBe(false);
    expect(isSnapshotFresh({}, nowMs)).toBe(false);
    expect(isSnapshotFresh({ at: "not a date" }, nowMs)).toBe(false);
    expect(isSnapshotFresh({ at: 1234567890 }, nowMs)).toBe(false);
    expect(isSnapshotFresh("2026-10-18T12:00:00.000Z", nowMs)).toBe(false);
  });
});
