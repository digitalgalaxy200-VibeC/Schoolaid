import { describe, it, expect } from "vitest";
import { UPLOAD_POLICY } from "@/lib/ai/uploads";
import {
  MEDIA_BUCKET,
  MEDIA_LIMITS,
  gcEligible,
  mediaPath,
  publicMediaUrl,
  quotaExceeded,
  tombstonePatch,
} from "../media";

const OPAQUE_PATH = /^site\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/;

describe("mediaPath", () => {
  it("is opaque — a random id and the verified extension, and nothing else", () => {
    expect(OPAQUE_PATH.test(mediaPath("png"))).toBe(true);
  });

  it("carries the extension it is given, not one derived from a name", () => {
    expect(mediaPath("webp").endsWith(".webp")).toBe(true);
    expect(mediaPath("jpg").endsWith(".jpg")).toBe(true);
  });

  it("never repeats, so two uploads of the same file cannot collide", () => {
    expect(mediaPath("png")).not.toBe(mediaPath("png"));
  });
});

describe("quotaExceeded", () => {
  const limit = MEDIA_LIMITS.schoolBytes;

  it("allows a file that lands exactly on the ceiling", () => {
    expect(quotaExceeded(0, limit)).toBe(false);
    expect(quotaExceeded(limit - 10, 10)).toBe(false);
  });

  it("refuses a file that would cross it", () => {
    expect(quotaExceeded(0, limit + 1)).toBe(true);
    expect(quotaExceeded(limit - 10, 11)).toBe(true);
  });

  it("takes the per-file ceiling from the platform's image policy", () => {
    // If these ever differ, the route validates against one number and reports
    // against another.
    expect(MEDIA_LIMITS.fileBytes).toBe(UPLOAD_POLICY.image.maxBytes);
  });
});

describe("tombstonePatch", () => {
  it("marks the row deleted and records when", () => {
    const when = new Date("2026-09-27T10:00:00.000Z");
    expect(tombstonePatch(when)).toEqual({
      status: "tombstone",
      deleted_at: "2026-09-27T10:00:00.000Z",
    });
  });
});

describe("gcEligible", () => {
  const grace = MEDIA_LIMITS.graceMs;
  const now = Date.UTC(2026, 8, 27);

  it("never collects an active row", () => {
    expect(gcEligible({ status: "active", deleted_at: null }, now)).toBe(false);
  });

  it("leaves a tombstone inside the grace period alone", () => {
    const justDeleted = new Date(now - 1000).toISOString();
    expect(gcEligible({ status: "tombstone", deleted_at: justDeleted }, now)).toBe(false);
  });

  it("collects a tombstone past the grace period", () => {
    const old = new Date(now - grace - 1).toISOString();
    expect(gcEligible({ status: "tombstone", deleted_at: old }, now)).toBe(true);
  });

  it("treats a missing or unreadable timestamp as not eligible", () => {
    expect(gcEligible({ status: "tombstone", deleted_at: null }, now)).toBe(false);
    expect(gcEligible({ status: "tombstone", deleted_at: "not a date" }, now)).toBe(false);
  });
});

describe("publicMediaUrl", () => {
  it("points at the public object path in the site-assets bucket", () => {
    expect(publicMediaUrl("https://example.supabase.co", "site/abc.png")).toBe(
      `https://example.supabase.co/storage/v1/object/public/${MEDIA_BUCKET}/site/abc.png`,
    );
  });
});
