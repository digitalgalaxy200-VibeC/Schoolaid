import { describe, it, expect } from "vitest";
import { chunkIds, IN_CHUNK_SIZE } from "../chunk";

/**
 * This helper exists because of a real production bug, so the tests are written
 * around that case rather than around the general idea of splitting an array.
 *
 * GS Apex: 136 students, 828 bill lines. The student list asked for allocations
 * with all 828 line ids in one `.in()`, which PostgREST renders into the QUERY
 * STRING — roughly 30KB. The gateway answered "400 Bad Request" before the
 * database saw it, and because the caller ignored the error it read as "nobody
 * has paid" and showed ₦0 against every student.
 */

/** The shape of the ids PostgREST would put in the URL. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A conservative gateway limit; Supabase's sits around 8KB. */
const URL_BUDGET = 8000;

describe("chunkIds", () => {
  it("keeps every batch inside the URL budget for a real school", () => {
    // The exact numbers that broke production.
    const lineIds = Array.from({ length: 828 }, (_, i) => uuid(i));

    for (const batch of chunkIds(lineIds)) {
      const urlChars = batch.join(",").length;
      expect(urlChars).toBeLessThan(URL_BUDGET);
    }
  });

  it("splits 828 ids into batches covering every id exactly once", () => {
    const lineIds = Array.from({ length: 828 }, (_, i) => uuid(i));
    const batches = chunkIds(lineIds);

    expect(batches.length).toBe(Math.ceil(828 / IN_CHUNK_SIZE));
    expect(batches.flat()).toEqual(lineIds);
  });

  it("preserves order, so batching cannot reorder anything", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for nothing, so callers can loop unconditionally", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("does not emit a trailing empty batch on an exact multiple", () => {
    expect(chunkIds([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("keeps a small list in one request — this must not add round trips", () => {
    // A single bill's lines, the case that always worked.
    expect(chunkIds(Array.from({ length: 9 }, (_, i) => uuid(i))).length).toBe(1);
  });

  it("refuses a size that would loop forever", () => {
    expect(() => chunkIds([1, 2, 3], 0)).toThrow();
    expect(() => chunkIds([1, 2, 3], -5)).toThrow();
  });

  it("defaults to 150 — the value the routes rely on", () => {
    expect(IN_CHUNK_SIZE).toBe(150);
    expect(chunkIds(Array.from({ length: 151 }, (_, i) => i)).length).toBe(2);
  });
});
