import { describe, it, expect } from "vitest";
import { activityLabel, formatElapsed, type ChatActivity } from "../chat-status";

/**
 * The activity strip is how a Super Admin knows Gwin is working rather than
 * stuck — and the Stop button beside it is how they end that work. The wording
 * is therefore behaviour, not decoration: these tests pin what it says.
 */

const at = (phase: ChatActivity["phase"], rest: Partial<ChatActivity> = {}): ChatActivity => ({
  phase,
  startedAt: 0,
  ...rest,
});

describe("activityLabel", () => {
  it("says what it is doing, in each phase", () => {
    expect(activityLabel(at("thinking"))).toBe("Gwin is thinking…");
    expect(activityLabel(at("writing"))).toBe("Gwin is writing the reply…");
    expect(activityLabel(at("reading", { reads: ["list_classes"] }))).toBe(
      "Gwin is looking up: list_classes…",
    );
  });

  it("names every record it is reading", () => {
    expect(activityLabel(at("reading", { reads: ["list_classes", "list_teachers"] }))).toBe(
      "Gwin is looking up: list_classes, list_teachers…",
    );
  });

  it("still says something while reading with no names to show", () => {
    expect(activityLabel(at("reading", { reads: [] }))).toBe("Gwin is looking up the school's records…");
    expect(activityLabel(at("reading", { reads: ["  "] }))).toBe(
      "Gwin is looking up the school's records…",
    );
  });

  it("does not claim a stopped reply finished itself", () => {
    const label = activityLabel(at("stopped", { endedAt: 12_000 }));
    expect(label).toContain("Stopped");
    expect(label).toContain("what was written");
  });
});

describe("formatElapsed", () => {
  it("counts in seconds below a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(1_400)).toBe("1s");
    expect(formatElapsed(59_999)).toBe("59s");
  });

  it("switches to minutes and seconds past a minute", () => {
    expect(formatElapsed(60_000)).toBe("1m 00s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(605_000)).toBe("10m 05s");
  });

  it("never shows a negative clock", () => {
    expect(formatElapsed(-5_000)).toBe("0s");
  });
});
