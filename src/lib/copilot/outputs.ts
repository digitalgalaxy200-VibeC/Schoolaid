/**
 * The scalars a step produced, ready for the receipt.
 *
 * `response_data` holds whatever the handler returned: a single record for a
 * create/update (ids, email, a one-time password), or an array of rows for a
 * read. Reads are not "results" a human checks off, so arrays and nested
 * objects are skipped — only flat scalars are surfaced.
 */
export function scalarOutputs(data: unknown, max = 12): { key: string; value: string }[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const out: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    out.push({ key, value: String(value) });
    if (out.length >= max) break;
  }
  return out;
}
