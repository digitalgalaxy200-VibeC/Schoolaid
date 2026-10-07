/**
 * The fields `update_school` is allowed to write, and nothing else.
 *
 * `subscription_status` is deliberately absent. The capability's own description
 * told the model never to change it, but the handler accepted the field anyway —
 * a prompt-only prohibition is not a prohibition. This list is.
 */
const UPDATE_FIELDS = ["name", "email", "phone", "address"] as const;

export function schoolUpdateFrom(params: Record<string, unknown>): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const field of UPDATE_FIELDS) {
    const value = params[field];
    if (typeof value === "string" && value.trim() !== "") {
      updates[field] = value.trim();
    }
  }
  return updates;
}
