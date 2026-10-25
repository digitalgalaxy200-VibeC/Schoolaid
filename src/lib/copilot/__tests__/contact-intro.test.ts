import { describe, it, expect } from "vitest";
import { contactDetailsInIntro } from "../website-handlers";

/**
 * The Contact block holds a heading and a short welcome line. Email, phone and
 * address are rendered as cards from the school record, so writing them into
 * the intro produces exactly what a school owner reported: one flat paragraph
 * with the cards empty.
 */
describe("contactDetailsInIntro", () => {
  const reported =
    "Have questions about Creamsville School or enrolling your child? We'd love to hear from you.\n\n" +
    "Email: creamsvilles@gmail.com\n\n" +
    "Phone: 09011526026 · 08033742717 · 08033371699\n\n" +
    "Address: 10, Omu-Aran Street, Pure-Water Bus Stop, Oko-Afo, Badagry, Lagos.";

  it("finds every detail in the intro that was reported", () => {
    expect(contactDetailsInIntro(reported)).toEqual([
      "an email address",
      "a phone number",
      "an address",
    ]);
  });

  it("catches an email on its own", () => {
    expect(contactDetailsInIntro("Write to us: hello@school.edu.ng")).toEqual([
      "an email address",
    ]);
  });

  it("catches phone numbers in the spellings families use", () => {
    for (const number of ["09011526026", "0901 152 6026", "+234 901 152 6026", "2349011526026"]) {
      expect(contactDetailsInIntro(`Call ${number}`), number).toContain("a phone number");
    }
  });

  it("catches a labelled address", () => {
    expect(contactDetailsInIntro("Our address: 12 Road, Lagos")).toContain("an address");
    expect(contactDetailsInIntro("Location - Off Market Road")).toContain("an address");
  });

  it("leaves ordinary welcome prose alone", () => {
    expect(
      contactDetailsInIntro(
        "We are happy to answer questions about admissions, fees and transport. Visit us during school hours.",
      ),
    ).toEqual([]);
  });

  it("does not mistake a year or a short number for a contact detail", () => {
    expect(contactDetailsInIntro("Established in 2014, we serve 350 pupils.")).toEqual([]);
  });

  it("treats a missing or non-string intro as clean", () => {
    expect(contactDetailsInIntro(undefined)).toEqual([]);
    expect(contactDetailsInIntro(null)).toEqual([]);
    expect(contactDetailsInIntro("")).toEqual([]);
    expect(contactDetailsInIntro(42)).toEqual([]);
  });
});
