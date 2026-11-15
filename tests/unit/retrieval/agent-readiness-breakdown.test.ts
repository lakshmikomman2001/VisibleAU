/**
 * 17 Nov, part 3 -- agent readiness. inngest/functions/score-agent-readiness.ts hard-coded eight inputs: page load
 * fast true (+2 free), name consistent true (+4 free), Wikipedia false (even when the brand has a page), AU
 * directories from a column only a stub writes, review citations 0, expert quotes false, citation rate 0 and
 * citation diversity 0. Unmeasured inputs now earn nothing and aren't counted as measured zeros, and stored rows
 * (which carry the free points) are read back from their parts with the hard-coded ones taken out.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeAuthorityScore,
  computeEntityClarityScore,
  computeTechScore,
  computeVerifyScore,
} from "@/lib/retrieval/agent-readiness";
import {
  isPre17NovReadinessRow,
  LEGACY_LLMSTXT_GAP,
  LLMSTXT_DRAFT_GAP,
  readinessFromStoredRow,
  readinessGapText,
  type StoredReadinessParts,
} from "@/lib/retrieval/agent-readiness-breakdown";

/** A row exactly as the old writer stored it for a reachable site (its hard-coded values included). */
const LEGACY_ROW: StoredReadinessParts = {
  techLlmstxtPresent: false,
  techLlmstxtValid: false,
  techRobotsAllowsCrawlers: true,
  techSsrPasses: true,
  techAiDiscoveryEndpoints: true,
  techPageLoadFast: true, // hard-coded
  techMcpEndpointPresent: false,
  techMcpEndpointValid: false,
  entityOrgSchemaPresent: false,
  entityLocalBusinessSchema: true,
  entityLocalRegInSchema: false,
  entityNameConsistent: true, // hard-coded
  entityServiceReadable: true,
  verifyAbnConfirmed: true,
  verifyWikipediaAu: false, // hard-coded
  verifyAuDirectories: 0, // stub column
  verifyReviewCitations: 0, // hard-coded
  verifyExpertQuotes: false, // hard-coded
  authorityTopicalCoverage: 60, // 12 pages x 5
  authorityPromptAppearance: 0, // hard-coded
  authorityCitationDiversity: 0, // hard-coded
  taskBookingAccessible: false,
  taskPricingVisible: true,
  taskServiceAreaDefined: true,
  taskFaqDirectAnswers: 2,
};

describe("readinessFromStoredRow -- a row the old writer stored", () => {
  it("is recognised by its hard-coded values", () => {
    expect(isPre17NovReadinessRow(LEGACY_ROW)).toBe(true);
    expect(isPre17NovReadinessRow({ ...LEGACY_ROW, techPageLoadFast: null })).toBe(false);
  });

  it("drops the free points and the unmeasured zeros: each dimension is out of what was measured", () => {
    const b = readinessFromStoredRow(LEGACY_ROW);
    // Technical: robots 3 + SSR 3 + sitemap 2 = 8, out of 18 (page speed's 2 not measured).
    expect(b.dimensions.tech).toEqual({ points: 8, measuredMax: 18 });
    // Entity: LocalBusiness 4 + services 3 = 7, out of 16 (name consistency's 4 not measured).
    expect(b.dimensions.entity).toEqual({ points: 7, measuredMax: 16 });
    // Verify: ABN 5, out of 5 -- Wikipedia, directories, reviews and expert quotes weren't measured.
    expect(b.dimensions.verify).toEqual({ points: 5, measuredMax: 5 });
    // Authority: pages 60% of 8 = 5, out of 8.
    expect(b.dimensions.authority).toEqual({ points: 5, measuredMax: 8 });
    // Task: pricing 5 + service area 5 + 2 headings = 12, out of 20.
    expect(b.dimensions.task).toEqual({ points: 12, measuredMax: 20 });
    expect(b.total).toEqual({ points: 37, measuredMax: 67 });
    expect(b.notMeasured.map((p) => p.label)).toEqual([
      "page load speed",
      "name consistent across the web",
      "Wikipedia AU page",
      "AU directory listings",
      "review citations",
      "expert quotes",
      "how often AI answers cite you",
      "citation diversity",
    ]);
    expect(b.notMeasured.reduce((s, p) => s + p.points, 0)).toBe(33);
    expect(b.siteReached).toBe(true);
  });

  it("an old row whose crawl reached nothing (pages 0): no part read from the site is scored", () => {
    const down: StoredReadinessParts = {
      ...LEGACY_ROW,
      techRobotsAllowsCrawlers: true, // robots.txt null read as "nothing blocks"
      techSsrPasses: false,
      techAiDiscoveryEndpoints: false,
      entityOrgSchemaPresent: false,
      entityLocalBusinessSchema: false,
      entityLocalRegInSchema: false,
      entityServiceReadable: false,
      authorityTopicalCoverage: 0,
      taskBookingAccessible: false,
      taskPricingVisible: false,
      taskServiceAreaDefined: false,
      taskFaqDirectAnswers: 0,
    };
    const b = readinessFromStoredRow(down);
    expect(b.siteReached).toBe(false);
    expect(b.dimensions.task).toEqual({ points: 0, measuredMax: 0 });
    expect(b.dimensions.tech).toEqual({ points: 0, measuredMax: 10 }); // llms draft 6 + MCP 4, all false
    expect(b.notMeasured.map((p) => p.label)).toContain("robots.txt lets GPTBot and ClaudeBot in");
  });
});

describe("readinessFromStoredRow -- a row the new writer stores (null = not measured)", () => {
  it("a measured Wikipedia page counts; nulls are not measured, not zeros", () => {
    const row: StoredReadinessParts = {
      ...LEGACY_ROW,
      techPageLoadFast: null,
      entityNameConsistent: null,
      verifyWikipediaAu: true,
      verifyAuDirectories: null,
      verifyReviewCitations: null,
      verifyExpertQuotes: null,
      authorityPromptAppearance: null,
      authorityCitationDiversity: null,
    };
    const b = readinessFromStoredRow(row);
    expect(b.dimensions.verify).toEqual({ points: 10, measuredMax: 10 });
    expect(b.notMeasured.map((p) => p.label)).not.toContain("Wikipedia AU page");
  });
});

describe("the compute functions: null earns nothing", () => {
  it("tech, entity, verify and authority give no points for an unmeasured input", () => {
    expect(
      computeTechScore({
        llmstxtPresent: false,
        llmstxtValid: false,
        robotsAllowsCrawlers: null,
        ssrPasses: null,
        aiDiscoveryEndpoints: null,
        pageLoadFast: null,
        mcpEndpointPresent: false,
        mcpEndpointValid: false,
        mcpToolsCount: 0,
      }),
    ).toBe(0);
    expect(
      computeEntityClarityScore({
        orgSchemaPresent: null,
        localBusinessSchema: null,
        localRegInSchema: null,
        nameConsistent: null,
        serviceReadable: null,
      }),
    ).toBe(0);
    expect(
      computeVerifyScore({
        abnConfirmed: true,
        wikipediaAu: null,
        auDirectories: null,
        reviewCitations: null,
        expertQuotes: null,
      }),
    ).toBe(5);
    expect(
      computeAuthorityScore({ topicalCoverage: 50, citationRate: null, citationDiversity: null }),
    ).toBe(4);
  });
});

describe("the writer (in-step logic only)", () => {
  const src = readFileSync("inngest/functions/score-agent-readiness.ts", "utf8");

  it("stores null for the inputs nothing measures", () => {
    expect(src).toMatch(/pageLoadFast: null/);
    expect(src).toMatch(/nameConsistent: null/);
    expect(src).toMatch(/auDirectories: null/);
    expect(src).toMatch(/reviewCitations: null/);
    expect(src).toMatch(/expertQuotes: null/);
    expect(src).toMatch(/citationRate: null/);
    expect(src).toMatch(/citationDiversity: null/);
    expect(src).not.toMatch(/pageLoadFast: true/);
    expect(src).not.toMatch(/nameConsistent: true/);
    expect(src).not.toMatch(/wikipediaAu: false/);
    expect(src).not.toMatch(/localDirectoryCount \?\? 0/);
  });

  it("keeps its function id, trigger and step ids", () => {
    expect(src).toMatch(/id: "score-agent-readiness"/);
    expect(src).toMatch(/triggers: \[\{ event: "technical-audit\/complete" \}\]/);
    for (const id of [
      "load-brand",
      "crawl-site",
      "check-tech",
      "check-entity",
      "check-verify",
      "check-authority",
      "detect-task-fit",
      "compute-and-store",
    ]) {
      expect(src).toContain(`step.run("${id}"`);
    }
  });
});

describe("the llms.txt gap names what was checked: our draft, not the site's file", () => {
  it("an old row's 'No llms.txt file detected' reads as the draft gap", () => {
    expect(readinessGapText(LEGACY_LLMSTXT_GAP)).toBe(LLMSTXT_DRAFT_GAP);
    // 17 Nov (part 3 follow-up): the product's name, never the old one (tests/unit/brand/no-old-brand-name.test.ts).
    expect(LLMSTXT_DRAFT_GAP).toContain("No llms.txt draft generated in Vunnara yet");
    expect(readinessGapText("No MCP endpoint found.")).toBe("No MCP endpoint found.");
  });
});
