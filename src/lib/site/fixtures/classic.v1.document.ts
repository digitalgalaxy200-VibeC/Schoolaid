import type { PublishedSiteDocument } from "../types";

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
