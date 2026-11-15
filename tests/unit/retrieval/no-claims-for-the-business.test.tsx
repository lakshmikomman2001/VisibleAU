/**
 * 17 Nov, part 2 -- what a business copies onto its own site never claims anything for it. The llms.txt templates said
 * "Licensed, insured, and locally trusted." (tradies), "AHPRA registered, Medicare & NDIS accepted." (allied health),
 * "24/7 callouts", "Remote consultations available" and "Cloud-based, secure, and scalable." for every business of the
 * vertical. Each is now a bracketed line the owner completes or deletes, and the page says so above the template. The
 * answer capsules (written by Claude, published by the business) are told never to state such a thing the content
 * doesn't. Guard: across every generator of a file a business copies, a licence, registration, insurance,
 * accreditation, award or government-scheme claim is always a bracketed fill-in (a question is fine: it points at the
 * business's own answer).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));
vi.mock("@/lib/llm", () => ({ getLLMService: vi.fn(() => ({ complete: completeMock })) }));

import {
  FILL_IN_NOTE,
  generateLlmsTxt,
  LlmsTxtPreview,
} from "@/app/(auth)/brands/[brandId]/llms-txt-generator/llms-txt-preview";
import { CAPSULE_CLAIMS_RULE, generateAnswerCapsule } from "@/lib/answer-capsules/generate-capsule";

const CLAIM =
  /\blicen[cs]ed\b|\blicen[cs]e (number|no)|\binsured\b|\binsurance\b|\bregistered\b|\bregistration\b|accredit|certified|\bAHPRA\b|\bMedicare\b|\bNDIS\b|bulk.?bill|award|guarantee|warrant(y|ied)|fully qualified|24\/7/i;

/**
 * A claim is fine only as a fill-in ("[...]") or a question; the capsule rule is an instruction, and a bare lowercase
 * slug ("medicare", a link's #anchor) is part of a URL -- neither is a claim.
 */
function unmarkedClaim(text: string): boolean {
  const t = text.trim();
  if (/^[a-z0-9-]+$/.test(t)) return false;
  return CLAIM.test(t) && !t.includes("[") && !t.endsWith("?") && !t.startsWith("Never state");
}

const VERTICALS = [
  "tradies",
  "allied_health",
  "saas",
  "local_business",
  "professional_services",
  "real_estate",
];

afterEach(() => completeMock.mockReset());

describe("the llms.txt a business copies", () => {
  it.each(VERTICALS)("%s: no line claims anything that isn't a bracketed fill-in", (vertical) => {
    const text = generateLlmsTxt("Harbour Bean", "harbourbean.com.au", vertical, "Parramatta");
    const unmarked = text.split("\n").filter(unmarkedClaim);
    expect(unmarked).toEqual([]);
    expect(text).not.toMatch(/credentials/i);
  });

  it("a tradie's licence and insurance are fill-ins, not claims", () => {
    const text = generateLlmsTxt("Bondi Plumbing", "bondiplumbing.com.au", "tradies", "Bondi");
    expect(text).toContain("> Licence number: [add yours, or delete this line]");
    expect(text).toContain(
      "> Public liability insurance: [your insurer and cover, or delete this line]",
    );
    expect(text).toContain("[your call-out hours (e.g. 24/7), or delete this line]");
    expect(text).not.toMatch(/Licensed, insured|locally trusted/);
  });

  it("an allied health clinic's AHPRA registration, Medicare and NDIS are fill-ins, not claims", () => {
    const text = generateLlmsTxt("Bondi Physio", "bondiphysio.com.au", "allied_health", "Bondi");
    expect(text).toContain("> AHPRA registration: [add yours, or delete this line]");
    expect(text).toContain("> Bulk billing / Medicare: [yes / no, or delete this line]");
    expect(text).toContain("> NDIS: [registered provider? yes / no, or delete this line]");
    expect(text).not.toMatch(/AHPRA registered|Medicare & NDIS accepted|consultations available/);
  });

  it("software claims nothing about its security or hosting", () => {
    const text = generateLlmsTxt("Acme", "acme.com.au", "saas", "");
    expect(text).not.toMatch(/secure|scalable|Cloud-based/i);
    expect(text).toContain("Where customer data is stored: [add yours, or delete this line]");
  });

  it("the page says, above the template, that bracketed lines are completed or deleted before publishing", () => {
    const html = renderToStaticMarkup(
      <LlmsTxtPreview
        brandName="Bondi Plumbing"
        domain="bondiplumbing.com.au"
        vertical="tradies"
        regions="Bondi"
      />,
    );
    expect(html).toContain("data-fill-in-note");
    expect(FILL_IN_NOTE).toMatch(/complete them or delete them before you publish/);
    expect(html.indexOf("data-fill-in-note")).toBeLessThan(html.indexOf("<pre"));
  });
});

describe("answer capsules", () => {
  it("are told never to state a licence, registration, insurance or government scheme the content doesn't", async () => {
    completeMock.mockResolvedValue({
      response: "We fix burst pipes across Bondi the same day, with upfront quotes.",
    });
    await generateAnswerCapsule("Do you do emergency repairs?", "Same-day plumbing in Bondi.");
    const prompt = String(completeMock.mock.calls[0][0].prompt);
    expect(prompt).toContain(CAPSULE_CLAIMS_RULE);
    expect(CAPSULE_CLAIMS_RULE).toMatch(/licence.*registration.*insurance/);
    expect(CAPSULE_CLAIMS_RULE).toMatch(/Medicare|NDIS/);
  });
});

describe("guard: every generator of a file a business copies", () => {
  /** llms.txt (the preview and the crawled one), the robots.txt block, the CDN and robots snippets, answer capsules. */
  const GENERATORS = [
    "app/(auth)/brands/[brandId]/llms-txt-generator/llms-txt-preview.tsx",
    "lib/retrieval/llmstxt-generator.ts",
    "lib/robots-txt/generate.ts",
    "app/(auth)/brands/[brandId]/robots-txt-config/robots-txt-snippet.tsx",
    "components/domain/retrieval/cdn-block-alert.tsx",
    "lib/answer-capsules/generate-capsule.ts",
    "lib/answer-capsules/check-capsule.ts",
    "lib/answer-capsules/find-questions.ts",
  ];

  it.each(
    GENERATORS,
  )("%s: no string claims a licence, registration, insurance, accreditation or scheme", (file) => {
    const code = readFileSync(join(process.cwd(), file), "utf-8");
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node) ||
        ts.isJsxText(node)
      ) {
        if (unmarkedClaim(node.text)) found.push(node.text.trim().slice(0, 100));
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(found).toEqual([]);
  });

  it("the guard catches the old claims", () => {
    expect(unmarkedClaim("Licensed, insured, and locally trusted.")).toBe(true);
    expect(unmarkedClaim("AHPRA registered, Medicare & NDIS accepted.")).toBe(true);
    expect(unmarkedClaim("24/7 callouts")).toBe(true);
    expect(unmarkedClaim("Licence number: [add yours, or delete this line]")).toBe(false);
    expect(unmarkedClaim("Are you licensed and insured?")).toBe(false);
  });
});
