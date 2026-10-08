import { describe, it, expect } from "vitest";
import { canonicalize, idempotencyKeyFor, stableHash } from "../idempotency";

/**
 * P1 — idempotency.
 *
 * A retry is only safe once it cannot double-apply. These pin the property the
 * key must have: the SAME logical write always maps to the SAME key, and two
 * different writes do not collide.
 */

describe("canonicalize", () => {
  it("is order-insensitive for object keys", () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });

  it("distinguishes different values", () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: 2 }));
  });

  it("handles nested objects and arrays deterministically", () => {
    expect(canonicalize({ b: [1, { y: 2, x: 3 }], a: null })).toBe(
      canonicalize({ a: null, b: [1, { x: 3, y: 2 }] }),
    );
  });
});

describe("idempotencyKeyFor", () => {
  it("is deterministic for the same tenant, capability and params", () => {
    const step = { capability: "create_class", params: { name: "Basic 1" } };
    expect(idempotencyKeyFor("school_1", step)).toBe(idempotencyKeyFor("school_1", step));
  });

  it("is order-insensitive within params", () => {
    const a = idempotencyKeyFor("s", { capability: "c", params: { a: 1, b: 2 } });
    const b = idempotencyKeyFor("s", { capability: "c", params: { b: 2, a: 1 } });
    expect(a).toBe(b);
  });

  it("differs across tenant, capability and params", () => {
    const base = idempotencyKeyFor("s1", { capability: "c", params: { a: 1 } });
    expect(idempotencyKeyFor("s2", { capability: "c", params: { a: 1 } })).not.toBe(base);
    expect(idempotencyKeyFor("s1", { capability: "d", params: { a: 1 } })).not.toBe(base);
    expect(idempotencyKeyFor("s1", { capability: "c", params: { a: 2 } })).not.toBe(base);
  });

  it("honours an explicit idempotencyKey above the derived one", () => {
    const a = idempotencyKeyFor("s", {
      capability: "c",
      params: { a: 1 },
      idempotencyKey: "k1",
    });
    const b = idempotencyKeyFor("other", {
      capability: "d",
      params: { z: 9 },
      idempotencyKey: "k1",
    });
    expect(a).toBe(b);
  });

  it("produces a short, prefixed key", () => {
    expect(idempotencyKeyFor("s", { capability: "c", params: {} })).toMatch(/^idem_[0-9a-f]{8}$/);
    expect(stableHash("abc")).toBe(stableHash("abc"));
  });
});
