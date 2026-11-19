/**
 * 20 Nov (Sri's decision, part 1): llms.txt and ai.txt are shown "Found / Not found · not scored" wherever they appear,
 * never as a penalty, and nothing -- a task, a gap, a method, a suggested robots.txt line -- implies an AI engine needs
 * them. The methodology says what stopped counting, when and why, with its sources.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDiscoveryChecks,
  buildLlmsTxtChecklist,
} from "@/app/(auth)/brands/[brandId]/llms-txt-generator/page";
import { TECHNICAL_SCORING_SOURCES } from "@/lib/methodology/verified-citations";
import { computeTechScore } from "@/lib/retrieval/agent-readiness";
import {
  LEGACY_LLMSTXT_GAP,
  LLMSTXT_DRAFT_GAP,
  readinessFromStoredRow,
  type StoredReadinessParts,
  shownReadinessGaps,
} from "@/lib/retrieval/agent-readiness-breakdown";
import {
  aiDiscoveryNotScoredText,
  LLMS_TXT_WHAT_IT_IS,
  llmsTxtNotScoredText,
} from "@/lib/technical-audit/not-scored";

const source = (path: string) => readFileSync(path, "utf8");
/** The code without comments, so a comment quoting the old copy doesn't count. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

describe("the rows say what was found, and 'not scored'", () => {
  it("llms.txt: found, not found, couldn't check, not checked", () => {
    expect(llmsTxtNotScoredText("found", false)).toBe("Found · not scored");
    expect(llmsTxtNotScoredText("absent", false)).toBe("Not found · not scored");
    expect(llmsTxtNotScoredText("unreachable", false)).toBe("Couldn't check · not scored");
    expect(llmsTxtNotScoredText("found", true)).toBe("Not checked · not scored");
  });

  it("AI Discovery: how many of the four files were found", () => {
    expect(
      aiDiscoveryNotScoredText(
        {
          aiTxtPresent: true,
          aiSummaryPresent: false,
          aiFaqPresent: false,
          aiServicePresent: false,
        },
        false,
      ),
    ).toBe("Found (1 of 4) · not scored");
    expect(
      aiDiscoveryNotScoredText(
        {
          aiTxtPresent: false,
          aiSummaryPresent: false,
          aiFaqPresent: false,
          aiServicePresent: false,
        },
        false,
      ),
    ).toBe("Not found · not scored");
    expect(aiDiscoveryNotScoredText({ aiTxtPresent: null }, false)).toBe(
      "Couldn't check · not scored",
    );
  });

  it("the llms.txt page: ai.txt 'not scored', and a checklist with no points", () => {
    const rows = buildDiscoveryChecks(
      undefined,
      { aiTxtPresent: true, aiSummaryPresent: false, aiFaqPresent: false },
      false,
      false,
    );
    expect(rows[1]).toMatchObject({ state: "yes", text: "Yes · not scored" });
    const absent = buildDiscoveryChecks(undefined, { aiTxtPresent: false }, false, false);
    expect(absent[1]).toMatchObject({ state: "no", text: "Not found · not scored" });
    const checklist = buildLlmsTxtChecklist(
      {
        present: true,
        h1Blockquote: true,
        sections: false,
        links: true,
        depth: false,
        fullTxt: false,
      },
      null,
      false,
    );
    expect(checklist?.every((row) => row.pts === 0)).toBe(true);
    // An audit scored before 20 Nov keeps its 3 points a row.
    const old = buildLlmsTxtChecklist({
      present: true,
      h1Blockquote: true,
      sections: false,
      links: true,
      depth: false,
      fullTxt: false,
    });
    expect(old?.every((row) => row.pts === 3)).toBe(true);
  });

  it("the llms.txt page explains it without a claim no source makes", () => {
    const page = code(source("app/(auth)/brands/[brandId]/llms-txt-generator/page.tsx"));
    expect(page).not.toMatch(/starting to honour it|boosts the chance|emerging standard/);
    expect(page).toContain("LLMS_TXT_WHAT_IT_IS");
    expect(LLMS_TXT_WHAT_IT_IS).toContain("No AI provider has said its engine reads it");
    expect(LLMS_TXT_WHAT_IT_IS).toContain("doesn't count toward any score");
  });
});

describe("nothing implies an AI engine needs them", () => {
  const ROW: StoredReadinessParts = {
    techLlmstxtPresent: false,
    techLlmstxtValid: false,
    techRobotsAllowsCrawlers: true,
    techSsrPasses: true,
    techAiDiscoveryEndpoints: true,
    techPageLoadFast: null,
    techMcpEndpointPresent: false,
    techMcpEndpointValid: false,
    entityOrgSchemaPresent: null,
    entityLocalBusinessSchema: null,
    entityLocalRegInSchema: null,
    entityNameConsistent: null,
    entityServiceReadable: null,
    verifyAbnConfirmed: null,
    verifyWikipediaAu: null,
    verifyAuDirectories: null,
    verifyReviewCitations: null,
    verifyExpertQuotes: null,
    authorityTopicalCoverage: 40,
    authorityPromptAppearance: null,
    authorityCitationDiversity: null,
    taskBookingAccessible: null,
    taskPricingVisible: null,
    taskServiceAreaDefined: null,
    taskFaqDirectAnswers: null,
  };

  it("agent readiness: an llms.txt draft earns nothing, and having none loses nothing", () => {
    const inputs = {
      llmstxtPresent: false,
      llmstxtValid: false,
      robotsAllowsCrawlers: true,
      ssrPasses: true,
      aiDiscoveryEndpoints: true,
      pageLoadFast: null,
      mcpEndpointPresent: null,
      mcpEndpointValid: null,
      mcpToolsCount: 0,
    };
    expect(computeTechScore({ ...inputs, llmstxtPresent: true, llmstxtValid: true })).toBe(
      computeTechScore(inputs),
    );
    const without = readinessFromStoredRow(ROW);
    const withDraft = readinessFromStoredRow({
      ...ROW,
      techLlmstxtPresent: true,
      techLlmstxtValid: true,
    });
    expect(withDraft.dimensions.tech).toEqual(without.dimensions.tech);
    expect(without.notMeasured.some((p) => /llms\.txt/.test(p.label))).toBe(false);
  });

  it("agent readiness: no llms.txt gap is shown, new or stored", () => {
    expect(
      shownReadinessGaps([LEGACY_LLMSTXT_GAP, LLMSTXT_DRAFT_GAP, "No MCP endpoint found."]),
    ).toEqual(["No MCP endpoint found."]);
    expect(code(source("inngest/functions/score-agent-readiness.ts"))).not.toContain(
      "LLMSTXT_DRAFT_GAP",
    );
  });

  it("the Methods page never lists the llms.txt, ai.txt or /ai/ file methods; the suggested robots.txt has no LLM-Content line", () => {
    const methods = code(source("app/(auth)/methods/page.tsx"));
    expect(methods).toMatch(
      /notInArray\(citabilityMethods\.methodKey, \[\.\.\.UNSCORED_METHOD_KEYS\]\)/,
    );
    for (const key of [
      "llms-txt-file",
      "ai-txt-endpoint",
      "ai-summary-json",
      "ai-faq-json",
      "ai-service-json",
    ]) {
      expect(methods).toContain(`"${key}"`);
    }
    expect(
      code(source("app/(auth)/brands/[brandId]/robots-txt-config/robots-txt-snippet.tsx")),
    ).not.toContain("LLM-Content");
    expect(code(source("db/seed/citability-methods/seed.ts"))).not.toMatch(
      /for AI crawler consumption|[Ee]merging standard|for AI systems|for AI consumption|for local AI/,
    );
  });
});

describe("the methodology says what stopped counting, and why", () => {
  const page = source("app/(marketing)/methodology/page.tsx");
  it("a dated entry in What changed, linking the three sources", () => {
    expect(page).toContain("20 November 2026: Technical score updated.");
    expect(page).toContain("llms.txt and ai.txt no longer count toward the Technical score.");
    expect(page).toContain("TECHNICAL_SCORING_SOURCES.llmsTxt.url");
    expect(page).toContain("TECHNICAL_SCORING_SOURCES.aiTxtDraft.url");
    expect(page).toContain("TECHNICAL_SCORING_SOURCES.googleAiFeatures.url");
    expect(page).toContain("Your Visibility score isn't affected.");
    expect(TECHNICAL_SCORING_SOURCES.llmsTxt.url).toBe("https://llmstxt.org/");
    expect(TECHNICAL_SCORING_SOURCES.aiTxtDraft.url).toBe(
      "https://datatracker.ietf.org/doc/html/draft-car-ai-txt-wellknown-00",
    );
  });

  it("neither file is said to count toward a score any more", () => {
    expect(page).not.toMatch(
      /It counts toward the AI Discovery score|counts toward the Technical Audit's score/,
    );
    expect(page.match(/doesn't count toward any score/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
