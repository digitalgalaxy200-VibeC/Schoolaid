/**
 * The DeepSeek model id, in one place.
 *
 * Two direct DeepSeek clients exist — the copilot provider and the teacher
 * AI-import route — and each carried its own copy of this string, so changing
 * one silently left the other on the old model. Register item I17.
 *
 * `DEEPSEEK_MODEL` lets an environment pin a different model without a
 * deployment. That exists because the current id (`deepseek-flash`) has never
 * been confirmed against the provider's model list — see the ops check in the
 * copilot forensic report. If it is not served, the fix is an environment
 * variable, not another code change.
 */
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-flash";
