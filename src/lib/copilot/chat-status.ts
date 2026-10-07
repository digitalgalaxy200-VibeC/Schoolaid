/**
 * What the activity strip says while Gwin is working.
 *
 * Gwin can spend a long time between "send" and the first word of a reply: the
 * model thinks, then it may stop to look records up, then it writes. Until now
 * the panel only said "Thinking…", so a reply that was actually reading the
 * database looked identical to one that was stuck, and there was no way to tell
 * either of them from work that was going to take another minute.
 *
 * These strings are the whole point of that strip, so they live in one pure
 * place with tests rather than being spread through JSX.
 */

export type ChatPhase = "thinking" | "reading" | "writing" | "stopped";

export type ChatActivity = {
  phase: ChatPhase;
  /** The capabilities being looked up, for the reading phase. */
  reads?: string[];
  /** When the reply started, so the strip can count. */
  startedAt: number;
  /** Set when the phase is over, so the count stops where the work did. */
  endedAt?: number;
};

/** The plain-English label. Phases are named for the person, not the machine. */
export function activityLabel(activity: ChatActivity): string {
  switch (activity.phase) {
    case "thinking":
      return "Gwin is thinking…";
    case "reading": {
      const names = (activity.reads ?? []).map((name) => name.trim()).filter(Boolean);
      return names.length > 0
        ? `Gwin is looking up: ${names.join(", ")}…`
        : "Gwin is looking up the school's records…";
    }
    case "writing":
      return "Gwin is writing the reply…";
    case "stopped":
      return "Stopped — what you see above is what was written.";
  }
}

/** A ticking clock that never reads as minutes of silence: `7s`, `1m 05s`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const seconds = total % 60;
  return `${Math.floor(total / 60)}m ${String(seconds).padStart(2, "0")}s`;
}
