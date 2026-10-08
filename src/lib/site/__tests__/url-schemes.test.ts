import { describe, it, expect } from "vitest";
import { validateContentSubmission } from "../content";
import { validateDocument } from "../templates/contracts";
import { loadTemplate, type SiteTemplate } from "../templates/registry";

/**
 * URL fields are where a page can be pointed somewhere else — a button, an
 * image, a prospectus. The rule these cases pin: normal shapes (https://,
 * http://, #anchors, paths, mailto:, tel:) pass untouched, and the four
 * schemes that execute or leave the web (javascript:, data:, vbscript:,
 * file:) are refused — on save AND on read, so a stored one can never reach a
 * visitor. React would block a javascript: href at render today; this rule
 * does not depend on that.
 */

const CLASSIC: SiteTemplate = (() => {
  const template = loadTemplate("classic");
  if (!template) throw new Error("the classic template is missing from the registry");
  return template;
})();

const contact = () => ({
  kind: "contact",
  is_visible: true,
  heading: "Contact us",
  intro: "We are happy to hear from you.",
});

const submit = (sections: unknown[]) => validateContentSubmission({ sections }, CLASSIC);

const notice = (linkUrl: string) => ({
  kind: "notice",
  is_visible: true,
  message: "Admissions are open.",
  linkUrl,
});

const errorsOf = (result: ReturnType<typeof submit>): string => {
  if (result.ok) throw new Error("expected the submission to be refused");
  return result.errors.join("; ");
};

describe("URL fields — refused schemes", () => {
  const refused = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ];

  it.each(refused)("refuses %s wherever a link can live", (value) => {
    expect(errorsOf(submit([contact(), notice(value)]))).toContain("linkUrl");

    const gallery = submit([
      contact(),
      { kind: "gallery", is_visible: true, heading: "Campus", items: [{ imageUrl: value }] },
    ]);
    expect(errorsOf(gallery)).toContain("imageUrl");
  });

  it("covers every URL field, not only the notice", () => {
    const hero = { kind: "hero", is_visible: true, headline: "Welcome", subheadline: "Hello" };
    const cases: [Record<string, unknown>, string][] = [
      [{ ...hero, ctaLink: "javascript:alert(1)" }, "ctaLink"],
      [{ ...hero, secondaryCtaLink: "javascript:alert(1)" }, "secondaryCtaLink"],
      [{ ...hero, imageUrl: "javascript:alert(1)" }, "imageUrl"],
      [{ kind: "about", is_visible: true, heading: "About", body: "Body", imageUrl: "javascript:alert(1)" }, "imageUrl"],
      [
        {
          kind: "programs",
          is_visible: true,
          heading: "Programmes",
          items: [{ name: "Primary", description: "Ages 5–11", imageUrl: "javascript:alert(1)" }],
        },
        "imageUrl",
      ],
      [
        {
          kind: "facilities",
          is_visible: true,
          heading: "Facilities",
          items: [{ title: "Library", description: "Books", imageUrl: "javascript:alert(1)" }],
        },
        "imageUrl",
      ],
      [
        { kind: "principal_message", is_visible: true, heading: "Welcome", message: "Hello", imageUrl: "javascript:alert(1)" },
        "imageUrl",
      ],
      [
        {
          kind: "testimonials",
          is_visible: true,
          heading: "Voices",
          items: [{ quote: "Great school", authorName: "A Parent", role: "Parent", avatarUrl: "javascript:alert(1)" }],
        },
        "avatarUrl",
      ],
      [
        {
          kind: "admissions_steps",
          is_visible: true,
          heading: "How to join",
          items: [{ stepNumber: "1", title: "Apply", description: "Fill the form" }],
          prospectusUrl: "javascript:alert(1)",
        },
        "prospectusUrl",
      ],
      [
        { kind: "blog", is_visible: true, heading: "News", posts: [{ title: "Sports day", imageUrl: "javascript:alert(1)" }] },
        "imageUrl",
      ],
    ];

    for (const [section, field] of cases) {
      expect(errorsOf(submit([contact(), section]))).toContain(field);
    }
  });

  it("refuses a dangerous link even in a hidden draft — nothing dangerous is stored", () => {
    const errors = errorsOf(
      submit([contact(), { kind: "notice", is_visible: false, message: "Draft", linkUrl: "javascript:alert(1)" }]),
    );
    expect(errors).toContain("linkUrl");
  });
});

describe("URL fields — normal shapes still pass", () => {
  const accepted = [
    "https://school.example/admissions",
    "http://oldschool.example",
    "#contact",
    "/admissions",
    "mailto:admissions@school.example",
    "tel:+2348030000000",
    // No scheme, no code: untidy is not dangerous, and the platform only
    // blocks what executes.
    "Admissions page",
  ];

  it.each(accepted)("accepts %s in a link", (value) => {
    const result = submit([contact(), notice(value)]);
    if (!result.ok) throw new Error(`unexpected refusal: ${result.errors.join("; ")}`);

    const stored = result.sections.find((section) => section.kind === "notice");
    expect((stored?.content as Record<string, unknown>).linkUrl).toBe(value);
  });
});

describe("URL fields — the published document refuses a stored dangerous link", () => {
  it("refuses to render a document whose stored link would execute", () => {
    const result = validateDocument({
      templateKey: "classic",
      templateVersion: "1",
      sections: [{ kind: "notice", message: "Admissions are open.", linkUrl: "javascript:alert(1)" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("; ")).toContain("linkUrl");
  });

  it("renders the same document once the link is a normal address", () => {
    const result = validateDocument({
      templateKey: "classic",
      templateVersion: "1",
      sections: [{ kind: "notice", message: "Admissions are open.", linkUrl: "https://school.example" }],
    });
    expect(result.ok).toBe(true);
  });
});
