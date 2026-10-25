// ============================================================
// Id helpers for the Copilot.
//
// The panel renders an optimistic assistant bubble with a placeholder id
// (`s-<timestamp>`) before the row exists. A placeholder is not a uuid, so a
// PostgREST update filtered by it matches nothing — or errors — and any
// bookkeeping silently does not happen. Every server route that receives an id
// from the client checks it with `isUuid` first.
// ============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
