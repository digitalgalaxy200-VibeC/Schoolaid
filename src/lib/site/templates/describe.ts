import { ValidationErrors } from "@/lib/validate";
import { CONFIG_LIMITS } from "../config";
import { LIMITS, normaliseSectionFields, type SectionKind } from "./contracts";

/**
 * What a block of each kind needs — asked of the validator, not written down
 * twice.
 *
 * Gwin filled a testimonials block with quotes and no author names, and asked
 * for a blog block with no posts at all, because nothing told him what the
 * contracts require. The obvious fix — a hand-written list of fields per kind —
 * would be a second copy of `contracts.ts` and would rot the first time a block
 * gained a field.
 *
 * So the requirements are PROBED instead: each kind is validated with a
 * deliberately empty object, and the errors it produces ARE the required
 * fields. The probe then feeds one empty item into every list it found, and
 * the per-item errors answer the same question one level down. There is no
 * description here to drift: if a contract changes, this changes with it.
 *
 * The result is what a person would want too — `shape` is a fill-in-the-blanks
 * skeleton of the required fields only.
 */

export type SectionKindDescription = {
  kind: SectionKind;
  /** What a visible, saved block must carry. */
  required: string[];
  /** For each required list field: what every item in it must carry. */
  lists: { field: string; item_fields: string[]; min_items: number }[];
  /** The required fields, empty, with `min_items` blank items in each list. */
  shape: Record<string, unknown>;
  /**
   * The longest each field may be, PROBED from the validator exactly as the
   * required fields are — never a second copy of `contracts.ts`. Scalars are keyed
   * by field name (`body`); list items by `items[].description`. A field with no
   * maximum is simply absent.
   *
   * WHY THIS EXISTS: a writer that is told the shape but not the ceilings writes
   * good copy that the contract then refuses — a 240-character core value against a
   * 200 limit left three blocks of a live school website empty, with no hint how
   * long anything was allowed to be. Knowing the ceiling is what turns that into a
   * first-time success.
   */
  limits: Record<string, number>;
};

/** One validation run over a made-up block, returning only its complaint list. */
function probe(kind: SectionKind, value: Record<string, unknown>) {
  const errors = new ValidationErrors();
  normaliseSectionFields(value, kind, errors, { allowEmpty: false });
  return errors.list;
}

/**
 * A value long enough to trip every maximum this platform declares. The probe is
 * "send one far too long and read the ceiling back", which is the only way to learn
 * a limit from the validator rather than duplicating the number here.
 */
const TOO_LONG = "x".repeat(4000);

/** The `at most N` ceiling the validator reported for one field path, if any. */
function probedMax(errors: { field: string; message: string }[], field: string): number | undefined {
  for (const error of errors) {
    if (error.field !== field) continue;
    const match = /must be at most (\d+) characters/.exec(error.message);
    if (match) return Number(match[1]);
  }
  return undefined;
}

/** The item count a list insists on — read from its own "at least N" message. */
function minItemsFor(kind: SectionKind, field: string): number {
  const errors = probe(kind, { [field]: [] });
  const complaint = errors.find((error) => error.field === field);
  const match = complaint && /at least (\d+)/.exec(complaint.message);
  return match ? Number(match[1]) : 1;
}

export function describeSectionKind(kind: SectionKind): SectionKindDescription {
  const required = probe(kind, {})
    // Top-level fields only: a nested path contains a dot or a bracket.
    .filter((error) => error.message === "is required" && !/[.[]/.test(error.field))
    .map((error) => error.field);

  const lists: SectionKindDescription["lists"] = [];
  const shape: Record<string, unknown> = {};
  const limits: Record<string, number> = {};

  for (const field of required) {
    const withEmptyItem = probe(kind, { [field]: [{}] });
    const itemFields = withEmptyItem
      .filter((error) => error.field.startsWith(`${field}[0].`))
      .map((error) => error.field.slice(`${field}[0].`.length));

    if (itemFields.length === 0) {
      // Not a list: a scalar field, and the only thing to say is that it is
      // required. Its value is the model's job — and so is keeping it short enough,
      // which is why the ceiling is asked for and returned.
      shape[field] = "";
      const max = probedMax(probe(kind, { [field]: TOO_LONG }), field);
      if (max !== undefined) limits[field] = max;
      continue;
    }

    const minItems = minItemsFor(kind, field);
    lists.push({ field, item_fields: itemFields, min_items: minItems });
    shape[field] = Array.from({ length: minItems }, () =>
      Object.fromEntries(itemFields.map((name) => [name, ""])),
    );

    // One probe with every item field over-long answers for all of them at once.
    const errors = probe(kind, {
      [field]: [Object.fromEntries(itemFields.map((name) => [name, TOO_LONG]))],
    });
    for (const name of itemFields) {
      const max = probedMax(errors, `${field}[0].${name}`);
      if (max !== undefined) limits[`${field}[].${name}`] = max;
    }
  }

  return { kind, required, lists, shape, limits };
}

/**
 * The platform's content ceilings as a sentence a writer can obey — built from
 * the constants themselves, never typed out a second time.
 *
 * WHY THIS EXISTS: `describeSectionKind` answers the ceilings per block, probed
 * from the validator — but only after a read, and three blocks of a live school
 * website were left empty because the writer was told a block's shape and not
 * that a core value may hold 200 characters and an about body 1200. The tool
 * results now carry the numbers for the block in hand; this sentence carries
 * them into the system prompt, from the same declarations, so neither can drift.
 */
export function describeContentLimits(): string {
  return (
    [
      `Every field has a character ceiling: a block heading ${LIMITS.heading}`,
      `a hero headline ${LIMITS.headline}`,
      `a subheadline ${LIMITS.subheadline}`,
      `a paragraph of body text ${LIMITS.body}`,
      `a list item's title ${LIMITS.itemName}`,
      `a list item's description ${LIMITS.itemDescription}`,
      `badge or button text ${LIMITS.badge}`,
      `an author's name ${LIMITS.author}`,
      `a link ${LIMITS.url}`,
      `a statistic's value ${LIMITS.statValue} and its label ${LIMITS.statLabel}`,
      `the SEO title ${CONFIG_LIMITS.seoTitle}`,
      `the SEO description ${CONFIG_LIMITS.seoDescription}`,
    ].join(", ") + `. A list holds at most ${LIMITS.listMax} items.`
  );
}
