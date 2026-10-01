/**
 * PostgREST expresses `.in()` as a comma-separated list **in the query string**,
 * so the URL grows with the number of ids.
 *
 * This is not a theoretical limit. GS Apex (136 students, 828 bill lines) asked
 * for allocations with 828 line ids in one request — roughly 30KB of URL. The
 * gateway rejected it with `400 Bad Request` *before it reached the database*,
 * and the caller ignored the error, so it read as "nobody has paid" and rendered
 * ₦0 against every student. The per-student workspace was unaffected because it
 * only ever asks about one bill, which is exactly why the two screens disagreed.
 *
 * 150 ids is about 5.5KB — comfortably inside the usual 8KB header limit, and
 * small enough that the batch count stays reasonable on a large school.
 *
 * Use this for any `.in()` whose list grows with the number of students, bills
 * or lines. A list bounded by configuration (fee heads, classes, terms) does not
 * need it.
 */
export const IN_CHUNK_SIZE = 150;

export function chunkIds<T>(ids: readonly T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (size <= 0) throw new Error("chunkIds: size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
