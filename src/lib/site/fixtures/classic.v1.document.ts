import type { PublishedSiteDocument } from "../types";

/**
 * TEMPORARY SCAFFOLDING — Website Engine.
 *
 * The first published document, held in code because the CMS that authors real
 * documents does not exist yet. It is typed as the real contract
 * (`PublishedSiteDocument`) and it is validated against the section contracts
 * on every request, so the storage-backed implementation drops in behind the
 * same interface without touching the resolver, the route or the rendering.
 *
 * REMOVE WHEN: the publishing/revision slice lands and published documents come
 * from the database. No school content may ever be added to this file — it is a
 * fixture, not a content store. See the scaffolding register (Part 2, T7).
 *
 * The text deliberately contains no school-specific facts. Identity — name,
 * motto, contact details — is resolved from `schools` at render time, so this
 * file can never duplicate canonical data or leak one school's details onto
 * another's site. For the same reason the principal's message carries no
 * attribution: a person's name belongs to the staff listing, and recording it
 * here would create a second place for it to be wrong.
 */

export const CLASSIC_V1: PublishedSiteDocument = {
  templateKey: "classic",
  templateVersion: "1",
  sections: [
    {
      kind: "hero",
      headline: "A place to learn, grow and belong",
      subheadline: "Welcome to our school — we are glad you are here.",
    },
    {
      kind: "about",
      heading: "About our school",
      body:
        "We provide a caring, well-rounded education that helps every child build " +
        "strong foundations in literacy, numeracy and character. Our teachers know " +
        "every learner by name, and our classrooms are built on curiosity, " +
        "discipline and encouragement.",
    },
    {
      kind: "programs",
      heading: "Our programmes",
      items: [
        {
          name: "Early Years",
          description: "A warm, play-rich start that builds confidence and early literacy.",
        },
        {
          name: "Primary",
          description: "Strong foundations in reading, writing, mathematics and science.",
        },
        {
          name: "Secondary",
          description: "Subject depth, exam preparation and preparation for life beyond school.",
        },
      ],
    },
    {
      kind: "principal_message",
      heading: "A word from our principal",
      message:
        "Thank you for taking the time to learn about our school. We believe every " +
        "child carries something worth developing, and our work is to find it, " +
        "nurture it, and hold our learners to a standard they can be proud of.",
    },
    {
      kind: "contact",
      heading: "Contact us",
      intro: "We are always happy to hear from parents and prospective families.",
    },
  ],
};

/** The single lookup the resolver uses. An unknown template key resolves to nothing. */
export function loadFixtureDocument(templateKey: string): unknown | null {
  return templateKey === CLASSIC_V1.templateKey ? CLASSIC_V1 : null;
}
