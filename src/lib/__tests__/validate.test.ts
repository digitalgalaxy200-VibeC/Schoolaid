import { describe, it, expect } from "vitest";
import {
  ValidationErrors,
  text,
  number,
  bool,
  oneOf,
  uuid,
  objectList,
} from "../validate";

describe("ValidationErrors", () => {
  it("accumulates errors instead of stopping at the first", () => {
    const errors = new ValidationErrors();
    text({}, "a", errors, { required: true });
    text({}, "b", errors, { required: true });
    expect(errors.list).toHaveLength(2);
    expect(errors.ok).toBe(false);
  });

  it("prefixes nested fields and shares the parent's list", () => {
    const errors = new ValidationErrors();
    const child = errors.child("options[0]");
    child.add("option_text", "is required");

    // The point of child(): the error lands in the PARENT list, namespaced.
    expect(errors.list).toEqual([
      { field: "options[0].option_text", message: "is required" },
    ]);
    expect(errors.ok).toBe(false);
  });

  it("composes prefixes through nested children", () => {
    const errors = new ValidationErrors();
    errors.child("a").child("b").add("c", "x");
    expect(errors.list[0].field).toBe("a.b.c");
  });

  it("summarises for an error response", () => {
    const errors = new ValidationErrors();
    errors.add("marks", "must be a number");
    errors.add("options", "needs at least two options");
    expect(errors.summary()).toBe("marks: must be a number; options: needs at least two options");
  });
});

describe("text", () => {
  it("returns null and flags a missing required field", () => {
    const errors = new ValidationErrors();
    expect(text({}, "name", errors, { required: true })).toBeNull();
    expect(errors.list[0]).toEqual({ field: "name", message: "is required" });
  });

  it("treats whitespace-only as absent", () => {
    const errors = new ValidationErrors();
    expect(text({ name: "   " }, "name", errors, { required: true })).toBeNull();
    expect(errors.ok).toBe(false);
  });

  it("trims the value", () => {
    const errors = new ValidationErrors();
    expect(text({ name: "  Basic 1  " }, "name", errors)).toBe("Basic 1");
    expect(errors.ok).toBe(true);
  });

  it("rejects a non-string", () => {
    const errors = new ValidationErrors();
    expect(text({ name: 42 }, "name", errors)).toBeNull();
    expect(errors.list[0].message).toBe("must be a string");
  });

  it("enforces min and max length", () => {
    const errors = new ValidationErrors();
    text({ a: "ab" }, "a", errors, { min: 3 });
    text({ b: "abcd" }, "b", errors, { max: 3 });
    expect(errors.list.map((e) => e.field)).toEqual(["a", "b"]);
  });
});

describe("number", () => {
  it("rejects a numeric string rather than coercing it", () => {
    const errors = new ValidationErrors();
    expect(number({ marks: "12" }, "marks", errors)).toBeNull();
    expect(errors.list[0].message).toBe("must be a number");
  });

  it("rejects NaN and Infinity", () => {
    const errors = new ValidationErrors();
    expect(number({ a: NaN }, "a", errors)).toBeNull();
    expect(number({ b: Infinity }, "b", errors)).toBeNull();
    expect(errors.list).toHaveLength(2);
  });

  it("accepts 0 as a present value", () => {
    const errors = new ValidationErrors();
    expect(number({ n: 0 }, "n", errors, { required: true })).toBe(0);
    expect(errors.ok).toBe(true);
  });

  it("enforces integer, min and max", () => {
    const errors = new ValidationErrors();
    number({ a: 1.5 }, "a", errors, { integer: true });
    number({ b: 0 }, "b", errors, { min: 1 });
    number({ c: 11 }, "c", errors, { max: 10 });
    expect(errors.list.map((e) => e.field)).toEqual(["a", "b", "c"]);
  });
});

describe("bool", () => {
  it("refuses the string 'true'", () => {
    const errors = new ValidationErrors();
    expect(bool({ flag: "true" }, "flag", errors)).toBeNull();
    expect(errors.list[0].message).toBe("must be true or false");
  });

  it("accepts a real false (not mistaken for absent)", () => {
    const errors = new ValidationErrors();
    expect(bool({ flag: false }, "flag", errors, { required: true })).toBe(false);
    expect(errors.ok).toBe(true);
  });
});

describe("oneOf", () => {
  it("accepts a listed value", () => {
    const errors = new ValidationErrors();
    expect(oneOf({ t: "mcq" }, "t", ["mcq", "theory"] as const, errors)).toBe("mcq");
  });

  it("rejects an unlisted value and names the options", () => {
    const errors = new ValidationErrors();
    expect(oneOf({ t: "essay" }, "t", ["mcq", "theory"] as const, errors)).toBeNull();
    expect(errors.list[0].message).toBe("must be one of: mcq, theory");
  });
});

describe("uuid", () => {
  it("accepts a canonical uuid and rejects a bare string", () => {
    const errors = new ValidationErrors();
    expect(uuid({ id: "512e51a1-b9c1-4682-ba3b-b4bf34d262ec" }, "id", errors)).toBe(
      "512e51a1-b9c1-4682-ba3b-b4bf34d262ec",
    );
    expect(uuid({ other: "not-a-uuid" }, "other", errors)).toBeNull();
    expect(errors.list).toHaveLength(1);
  });
});

describe("objectList", () => {
  it("flags a non-list", () => {
    const errors = new ValidationErrors();
    expect(objectList({ options: "nope" }, "options", errors)).toBeNull();
    expect(errors.list[0].message).toBe("must be a list");
  });

  it("names the offending item by index", () => {
    const errors = new ValidationErrors();
    objectList({ options: [{ a: 1 }, "bad"] }, "options", errors);
    expect(errors.list[0]).toEqual({ field: "options[1]", message: "must be an object" });
  });

  it("enforces item counts", () => {
    const errors = new ValidationErrors();
    objectList({ a: [{}] }, "a", errors, { min: 2 });
    objectList({ b: [{}, {}, {}] }, "b", errors, { max: 2 });
    expect(errors.list.map((e) => e.field)).toEqual(["a", "b"]);
  });

  it("returns the collected items when the shape is right", () => {
    const errors = new ValidationErrors();
    const out = objectList({ options: [{ x: 1 }, { y: 2 }] }, "options", errors);
    expect(out).toHaveLength(2);
    expect(errors.ok).toBe(true);
  });
});
