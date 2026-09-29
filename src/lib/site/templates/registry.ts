import { SECTION_KINDS, type SectionKind } from "./contracts";

/**
 * The template registry — platform-owned design, declared in code.
 *
 * A template is not data. Schools choose one, they never author or alter one,
 * so the registry lives in this repository and ships with a deploy. That is
 * what makes "improve Template A once, every school on it improves" a normal
 * consequence of releasing rather than a migration project.
 *
 * The registry declares only what a template IS: its key, its version, and the
 * section kinds it can render. It deliberately does NOT hold content — the
 * document comes from the school's stored pages and sections, and `version`
 * exists so a document can be recorded against the design it was authored for
 * when publishing arrives.
 *
 * Adding a template is a code change with review, exactly like adding a section
 * kind. Nothing here is per-school and nothing here is editable at runtime.
 */

export type SiteTemplate = {
  /** Stable identifier stored on the school's configuration row. */
  key: string;
  /** Bumped when this template's design or contracts change (see the roadmap). */
  version: string;
  /** Human label for operator screens. */
  label: string;
  /** The section kinds this template declares it can render. */
  sectionKinds: readonly SectionKind[];
};

const TEMPLATES: Record<string, SiteTemplate> = {
  classic: {
    key: "classic",
    version: "1",
    label: "Classic",
    sectionKinds: SECTION_KINDS,
  },
};

/**
 * Resolves a template by key, or null.
 *
 * The `hasOwnProperty` guard matters: a bare lookup would return a function for
 * keys like `constructor` or `toString`, and the caller — which treats null as
 * "no website configured" — would instead be handed something truthy. The
 * lookup is a whitelist, not a property access.
 */
export function loadTemplate(key: string): SiteTemplate | null {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, key) ? TEMPLATES[key] : null;
}
