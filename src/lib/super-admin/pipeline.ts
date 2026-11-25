/**
 * The partnership pipeline — one list, used by the API, the school page and the
 * dashboard.
 *
 * WHY A SINGLE SOURCE: the stage is written by a form, validated by a route,
 * counted on the dashboard and printed in a badge. Four places spelling eight
 * strings is four places to disagree, and a typo would silently create a stage
 * that no screen groups.
 *
 * The order mirrors the seven-step journey on the marketing site. `first_term` is
 * a stage, not a milestone: a school is at its most fragile during the first term
 * of real use, and we want to see who is still in it.
 */
export const PIPELINE_STAGES = [
  "applied",
  "assessed",
  "discovery",
  "proposal",
  "setup",
  "training",
  "live",
  "first_term",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** Short label for tables and badges. */
export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  applied: "Applied",
  assessed: "Assessed",
  discovery: "Discovery call",
  proposal: "Proposal",
  setup: "Setup & migration",
  training: "Training & go-live",
  live: "Live",
  first_term: "First term complete",
};

/** Badge styling for the app's existing tone tokens. */
export const PIPELINE_STAGE_TONE: Record<
  PipelineStage,
  "default" | "info" | "warning" | "success"
> = {
  applied: "warning",
  assessed: "warning",
  discovery: "info",
  proposal: "info",
  setup: "info",
  training: "info",
  live: "success",
  first_term: "success",
};

export function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** 0-based position, or -1 when the school has not been triaged. */
export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return -1;
  return (PIPELINE_STAGES as readonly string[]).indexOf(stage);
}
