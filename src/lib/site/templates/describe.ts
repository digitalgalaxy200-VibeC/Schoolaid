import { ValidationErrors } from "@/lib/validate";
import { normaliseSectionFields, type SectionKind } from "./contracts";

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
};

/** One validation run over a made-up block, returning only its complaint list. */
function probe(kind: SectionKind, value: Record<string, unknown>) {
  const errors = new ValidationErrors();
  normaliseSectionFields(value, kind, errors, { allowEmpty: false });
  return errors.list;
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

  for (const field of required) {
    const withEmptyItem = probe(kind, { [field]: [{}] });
    const itemFields = withEmptyItem
      .filter((error) => error.field.startsWith(`${field}[0].`))
      .map((error) => error.field.slice(`${field}[0].`.length));

    if (itemFields.length === 0) {
      // Not a list: a scalar field, and the only thing to say is that it is
      // required. Its value is the model's job.
      shape[field] = "";
      continue;
    }

    const minItems = minItemsFor(kind, field);
    lists.push({ field, item_fields: itemFields, min_items: minItems });
    shape[field] = Array.from({ length: minItems }, () =>
      Object.fromEntries(itemFields.map((name) => [name, ""])),
    );
  }

  return { kind, required, lists, shape };
}
