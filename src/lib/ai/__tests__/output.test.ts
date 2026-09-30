import { describe, it, expect } from "vitest";
import {
  MAX_MODEL_OUTPUT_CHARS,
  isPlainObject,
  parseModelJson,
  parseModelText,
  stripCodeFences,
} from "../output";

const okValue = (result: ReturnType<typeof parseModelJson>) => {
  if (!result.ok) throw new Error(`expected success, got: ${result.reason}`);
  return result.value;
};

describe("stripCodeFences", () => {
  it("removes a fence that wraps the whole reply", () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFences('~~~json\n{"a":1}\n~~~')).toBe('{"a":1}');
  });

  it("leaves an unfenced reply alone", () => {
    expect(stripCodeFences('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("does not touch a fence that is only part of the reply", () => {
    // A student's answer quoting code must not be surgically rewritten.
    const text = 'Here is the answer:\n```\nif (x) { y(); }\n```\nDone.';
    expect(stripCodeFences(text)).toBe(text.trim());
  });
});

describe("isPlainObject", () => {
  it("accepts only a plain object", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(4)).toBe(false);
  });
});

describe("parseModelJson", () => {
  it("parses a plain object", () => {
    expect(okValue(parseModelJson('{"marks": 24, "student": "John"}'))).toEqual({
      marks: 24,
      student: "John",
    });
  });

  it("parses a fenced object", () => {
    expect(okValue(parseModelJson('```json\n{"marks": 24}\n```'))).toEqual({ marks: 24 });
  });

  it("parses an object embedded in prose", () => {
    const reply = 'Sure! Here are the scores:\n{"marks": 24, "note": "clear"}\nLet me know.';
    expect(okValue(parseModelJson(reply))).toEqual({ marks: 24, note: "clear" });
  });

  it("fails closed on empty or non-text input", () => {
    expect(parseModelJson("").ok).toBe(false);
    expect(parseModelJson("   \n ").ok).toBe(false);
    expect(parseModelJson(null).ok).toBe(false);
    expect(parseModelJson(undefined).ok).toBe(false);
    expect(parseModelJson(42).ok).toBe(false);
  });

  it("fails closed on invalid JSON rather than guessing at the intent", () => {
    const result = parseModelJson('{"marks": 24,}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("did not contain a JSON object");
  });

  it("rejects valid JSON that is not an object", () => {
    const array = parseModelJson("[1,2,3]");
    expect(array.ok).toBe(false);
    expect(array.ok === false && array.reason).toContain("not a JSON object");

    const scalar = parseModelJson('"just a string"');
    expect(scalar.ok).toBe(false);
  });

  it("rejects a reply over the size limit before parsing it", () => {
    const huge = `{"a":"${"x".repeat(50)}"}`;
    const result = parseModelJson(huge, { maxChars: 20 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("over the 20 limit");
  });

  it("uses the default limit when none is given", () => {
    const huge = "x".repeat(MAX_MODEL_OUTPUT_CHARS + 1);
    expect(parseModelJson(huge).ok).toBe(false);
  });

  it("rejects a prototype-polluting key at the top level", () => {
    const result = parseModelJson('{"__proto__": {"polluted": true}}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("__proto__");
  });

  it("rejects a prototype-polluting key nested inside an object", () => {
    const result = parseModelJson('{"a": {"b": {"constructor": {}}}}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("constructor");
  });

  it("rejects a dangerous key hidden inside an array", () => {
    const result = parseModelJson('{"items": [{"ok": 1}, {"prototype": "x"}]}');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("prototype");
  });

  it("does not pollute Object.prototype when the reply is merged", () => {
    // The concrete consequence the check exists for: Object.assign uses [[Set]].
    const result = parseModelJson('{"__proto__": {"polluted": true}}');
    expect(result.ok).toBe(false);

    const target: Record<string, unknown> = {};
    if (result.ok) Object.assign(target, result.value);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("handles deeply nested output without blowing the stack", () => {
    // A recursive scan would overflow here; the check must be iterative.
    const depth = 2000;
    const nested = `${"[".repeat(depth)}1${"]".repeat(depth)}`;
    const result = parseModelJson(`{"deep": ${nested}}`);
    expect(result.ok).toBe(true);
  });
});

describe("parseModelText", () => {
  it("returns trimmed non-empty text", () => {
    const result = parseModelText("  a clear explanation  ");
    expect(result).toEqual({ ok: true, value: "a clear explanation" });
  });

  it("fails closed on empty or whitespace-only text", () => {
    expect(parseModelText("").ok).toBe(false);
    expect(parseModelText("   ").ok).toBe(false);
    expect(parseModelText(null).ok).toBe(false);
  });

  it("enforces a minimum length", () => {
    expect(parseModelText("short", { minChars: 10 }).ok).toBe(false);
    expect(parseModelText("long enough", { minChars: 10 }).ok).toBe(true);
  });

  it("enforces a maximum length", () => {
    const result = parseModelText("x".repeat(20), { maxChars: 10 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("over the 10 limit");
  });
});
