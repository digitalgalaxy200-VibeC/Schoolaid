// ============================================================
// Platform Defaults — Single source of truth for the default
// academic configuration provisioned to every new school.
//
// Schools may customise these after creation. The originals
// here are never modified — they are always copied on first use.
// ============================================================

export const PLATFORM_DEFAULTS = {
  /** Default assessment components (CA1 + CA2 + Exam = 100 pts) */
  components: [
    { name: "CA 1", maximum_score: 30, display_order: 1 },
    { name: "CA 2", maximum_score: 30, display_order: 2 },
    { name: "Examination", maximum_score: 40, display_order: 3 },
  ],

  /** Default grade bands with professional principal remark templates */
  grading: [
    {
      grade: "A",
      minimum_score: 80,
      maximum_score: 100,
      remark: "Excellent",
      principal_remark:
        "{name} has demonstrated outstanding academic performance this term, achieving an average score of {average}%. {He/She} has shown dedication, discipline, and a strong commitment to learning. I encourage {him/her} to maintain this excellent standard.",
    },
    {
      grade: "B",
      minimum_score: 70,
      maximum_score: 79,
      remark: "Very Good",
      principal_remark:
        "{name} performed very well this term with an average of {average}%. {He/She} has shown good academic potential. With continued effort and consistency, even greater achievements are possible.",
    },
    {
      grade: "C",
      minimum_score: 60,
      maximum_score: 69,
      remark: "Good",
      principal_remark:
        "{name} has had a good academic performance this term. There is noticeable progress, but {he/she} should remain focused and continue working hard to achieve even better results.",
    },
    {
      grade: "D",
      minimum_score: 50,
      maximum_score: 59,
      remark: "Fair",
      principal_remark:
        "{name} has demonstrated fair performance this term. Greater concentration, regular study habits, and improved commitment will help {him/her} perform much better next term.",
    },
    {
      grade: "E",
      minimum_score: 40,
      maximum_score: 49,
      remark: "Poor",
      principal_remark:
        "{name} needs to improve academically. Additional effort, regular attendance, and closer attention to classroom activities will greatly improve {his/her} performance.",
    },
    {
      grade: "F",
      minimum_score: 0,
      maximum_score: 39,
      remark: "Very Poor",
      principal_remark:
        "{name} has experienced academic difficulties this term. I strongly encourage {him/her} to work closely with teachers and parents to improve performance in the coming term.",
    },
  ],

  /** Default psychomotor domain traits */
  psychomotor: [
    { name: "Handwriting", display_order: 1 },
    { name: "Drawing & Painting", display_order: 2 },
    { name: "Sports & Games", display_order: 3 },
    { name: "Craft Work", display_order: 4 },
    { name: "Musical Skills", display_order: 5 },
  ],

  /** Default affective domain traits */
  affective: [
    { name: "Punctuality", display_order: 1 },
    { name: "Neatness", display_order: 2 },
    { name: "Honesty", display_order: 3 },
    { name: "Cooperation", display_order: 4 },
    { name: "Attentiveness", display_order: 5 },
  ],
} as const;

/** Supported placeholder tokens and their descriptions (for UI display) */
export const REMARK_PLACEHOLDERS = [
  { label: "{name}", desc: "Student first name" },
  { label: "{average}", desc: "Overall average score (e.g. 84.5)" },
  { label: "{grade}", desc: "Letter grade (e.g. A)" },
  { label: "{He/She}", desc: "Gender pronoun — He or She" },
  { label: "{His/Her}", desc: "Possessive — His or Her" },
  { label: "{him/her}", desc: "Object pronoun — him or her" },
] as const;

/**
 * Replace all supported placeholders in a remark template.
 * Used by the report-card API when generating automated principal remarks.
 */
export function compilePrincipalRemark(opts: {
  template: string;
  firstName: string;
  average: number;
  grade: string;
  gender?: string | null;
}): string {
  const { template, firstName, average, grade, gender } = opts;

  const isFemale = gender?.toLowerCase() === "female" || gender?.toLowerCase() === "f";
  const isMale   = gender?.toLowerCase() === "male"   || gender?.toLowerCase() === "m";

  const heShe      = isFemale ? "She"  : isMale ? "He"  : "They";
  const heSheLower = isFemale ? "she"  : isMale ? "he"  : "they";
  const hisHer     = isFemale ? "Her"  : isMale ? "His" : "Their";
  const hisHerLower= isFemale ? "her"  : isMale ? "his" : "their";
  const himHerLower= isFemale ? "her"  : isMale ? "him" : "them";

  return template
    .replace(/{name}/gi, firstName)
    .replace(/{average}/gi, average.toFixed(1))
    .replace(/{grade}/gi, grade)
    .replace(/{He\/She}/g, heShe)
    .replace(/{he\/she}/g, heSheLower)
    .replace(/{His\/Her}/g, hisHer)
    .replace(/{his\/her}/gi, hisHerLower)
    .replace(/{him\/her}/gi, himHerLower);
}

/**
 * Generate a live preview of a remark template (used in the UI).
 * Uses placeholder example values (John / Mary, 85.0, A).
 */
export function previewPrincipalRemark(template: string, gender: "male" | "female"): string {
  return compilePrincipalRemark({
    template,
    firstName: gender === "female" ? "Mary" : "John",
    average: 85.0,
    grade: "A",
    gender,
  });
}
