/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 (Sri: the Trust page read "Omega Services's Trust Score") --
 * one helper makes a name possessive (lib/copy/possessive.ts), and no copy adds "'s" to an interpolated name
 * itself. The Trust page's rationale under "Not measured yet" no longer starts with "Not measured yet." again.
 */
import { describe, expect, it } from "vitest";
import { fillJourneyPrompt } from "@/lib/conversational/journey-runner";
import { possessive } from "@/lib/copy/possessive";
import { ExplainabilityService } from "@/lib/platform/explainability";
import {
  NON_TEST_ROOTS,
  readSourcesBeforeAll,
  sourceFiles,
  sourceText,
} from "@/tests/helpers/source-files";

readSourcesBeforeAll([...NON_TEST_ROOTS]);

describe("possessive", () => {
  it("a name ending in s takes only the apostrophe", () => {
    expect(possessive("Omega Services")).toBe("Omega Services'");
    expect(possessive("Bondi Plumbers")).toBe("Bondi Plumbers'");
    expect(possessive("ACME LABS")).toBe("ACME LABS'");
  });

  it("any other name takes 's", () => {
    expect(possessive("Acme")).toBe("Acme's");
    expect(possessive("Zero Plumbing")).toBe("Zero Plumbing's");
  });

  it("trailing spaces don't count", () => {
    expect(possessive("Omega Services ")).toBe("Omega Services'");
  });
});

describe("the copy uses it", () => {
  it("the Trust rationale starts with the brand's possessive, never 'Not measured yet.' again", () => {
    const route = sourceText("app/api/brands/[brandId]/trust/route.ts");
    expect(route).toContain(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the route's source text, as it appears in the file
      "rationale: `${possessive(brand.name)} Trust Score comes from the Entity check",
    );
    expect(route).not.toMatch(/rationale: `\$\{NOT_MEASURED\}[.:]/);
    expect(sourceText("app/api/brands/[brandId]/entity-score/route.ts")).not.toMatch(
      /rationale: `\$\{NOT_MEASURED\}[.:]/,
    );
  });

  it("an explained score reads 'Omega Services' trust score', not 'Services's'", () => {
    const { rationale } = ExplainabilityService.annotate({
      score: 40,
      scoreLabel: "Trust Score",
      maxScore: 100,
      context: { brandName: "Omega Services", dimension: "trust" },
    });
    expect(rationale).toMatch(/^Omega Services' /);
    expect(rationale).not.toContain("Services's");
  });

  it("no shipped copy adds 's to an interpolated name itself", () => {
    // `${name}'s`, {name}&apos;s and {name}'s in JSX, and name + "'s" -- each a hand-made possessive.
    const HAND_MADE = /\$\{[^}]+\}['’]s\b|\}(&apos;|['’])s\b|\w\s*\+\s*["'`]['’]s\b/;
    // The journey templates say "{brandName}'s": a placeholder, which fillJourneyPrompt makes possessive().
    const TEMPLATES = new Set(["db/seed/prebuilt-journeys.ts"]);
    const found = sourceFiles([...NON_TEST_ROOTS])
      .filter((f) => f.path !== "lib/copy/possessive.ts" && !TEMPLATES.has(f.path))
      .flatMap(({ path, text }) =>
        text
          .split("\n")
          .filter((line) => !/^\s*(\/\/|\*|\{\/\*)/.test(line) && HAND_MADE.test(line))
          .map((line) => `${path}: ${line.trim()}`),
      );
    expect(found).toEqual([]);
  });

  it("a journey template's {brandName}'s is filled with the possessive, as the AI engines are asked", () => {
    const fill = (template: string, brandName: string) =>
      fillJourneyPrompt(template, { brandName, serviceType: "plumbing", location: "Bondi" });
    expect(fill("What are {brandName}'s management fees?", "Omega Services")).toBe(
      "What are Omega Services' management fees?",
    );
    expect(fill("Tell me about {brandName}'s features", "Acme")).toBe(
      "Tell me about Acme's features",
    );
    expect(fill("Is {brandName} the best {serviceType} in {location}?", "Omega Services")).toBe(
      "Is Omega Services the best plumbing in Bondi?",
    );
    expect(sourceText("db/seed/prebuilt-journeys.ts")).toContain("{brandName}'s");
  });

  it("the scan catches each hand-made form (it isn't vacuous)", () => {
    const HAND_MADE = /\$\{[^}]+\}['’]s\b|\}(&apos;|['’])s\b|\w\s*\+\s*["'`]['’]s\b/;
    for (const line of [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a sample line of source text for the scan
      "rationale: `${brand.name}'s Trust Score`",
      "{brandName}&apos;s Health Check",
      "{brandName}'s reports",
      'name + "\'s"',
    ]) {
      expect(HAND_MADE.test(line), line).toBe(true);
    }
  });
});
