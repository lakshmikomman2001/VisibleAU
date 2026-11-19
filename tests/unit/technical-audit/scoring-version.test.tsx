/**
 * 20 Nov (Sri's decision, part 1): llms.txt and ai.txt stop counting toward the Technical score. Both are still checked
 * and shown ("Found / Not found · not scored"); a new audit stores its scoring version (findings.scoringVersion: 4),
 * an older one keeps its own maximum, two audits are compared only under the same rules, and where they meet the
 * page shows both scores with "Scoring updated on <date>" and that the Visibility score isn't affected.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlResult } from "@/lib/crawler/types";

const rows = vi.hoisted(() => ({ results: [] as unknown[][] }));

vi.mock("@/db/client", () => {
  const tx = {
    select: () => {
      const result = rows.results.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const name of ["from", "where", "orderBy"]) chain[name] = () => chain;
      chain.limit = () => Promise.resolve(result);
      return chain;
    },
  };
  return {
    db: tx,
    serviceDb: tx,
    withRlsContext: async (_orgId: string, fn: (t: unknown) => unknown) => fn(tx),
  };
});
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => ({ id: "u1", organizationId: "org-1" }),
}));
vi.mock("@/components/domain/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));

import { AI_DISCOVERY_WEIGHTS_BY_VERSION } from "@/lib/ai-discovery/endpoints";
import { orchestrateTechnicalAudit } from "@/lib/technical-audit/orchestrate";
import {
  comparableCompositeDelta,
  compositeMaxFor,
  rollupTo5Categories,
  scoredChecksOf,
  TECHNICAL_AUDIT_MAX_SCORE,
} from "@/lib/technical-audit/score-aggregator";
import {
  DIMENSION_MAXIMA,
  scoringChangeNote,
  TECHNICAL_SCORING_VERSION,
  technicalScoringOf,
  technicalScoringVersionOf,
} from "@/lib/technical-audit/scoring-version";

const BRAND_ID = "4e0a8e9a-6b1a-4b1a-9b1a-6b1a4b1a9b1a";

/** A site that answers, with an llms.txt (and llms-full.txt) and an ai.txt -- both files a site could have. */
const SITE: CrawlResult = {
  domain: "acme.com.au",
  pages: [
    {
      url: "https://acme.com.au/",
      title: "Acme Plumbing Bondi",
      html: "<html><head><title>Acme Plumbing Bondi</title></head><body><h1>Acme</h1><p>We fix pipes.</p></body></html>",
      textContent: "Acme We fix pipes.",
      excerpt: "We fix pipes.",
      byline: null,
      wordCount: 3,
      statusCode: 200,
      headers: {},
    },
  ],
  robotsTxt: "User-agent: *\nAllow: /\nSitemap: https://acme.com.au/sitemap.xml",
  sitemapXml: null,
  crawledAt: new Date("2026-11-20T00:00:00Z"),
  errors: [],
  homepage: { url: "https://acme.com.au/", reached: true, httpStatus: 200 },
  robotsTxtFetch: { status: "found", httpStatus: 200 },
};

const LLMS = `# Acme Plumbing\n\n> Plumbers in Bondi.\n\n## Services\n\n- [Blocked drains](https://acme.com.au/drains)\n${"x".repeat(1600)}`;

function siteFiles(files: Record<string, { body: string; type: string } | "fail">) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const file = files[path];
    if (file === "fail") throw new Error("ECONNRESET");
    if (!file) return new Response("", { status: 404 });
    return new Response(file.body, { status: 200, headers: { "content-type": file.type } });
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a new technical audit: llms.txt and ai.txt are checked, and score 0", () => {
  it("with both files on the site: found and kept in the findings, 0 points each, scoring version 4", async () => {
    siteFiles({
      "/llms.txt": { body: LLMS, type: "text/plain" },
      "/llms-full.txt": { body: LLMS, type: "text/plain" },
      "/.well-known/ai.txt": { body: "x".repeat(200), type: "text/plain" },
    });
    const result = await orchestrateTechnicalAudit("acme.com.au", SITE, 2);
    expect(result.findings.scoringVersion).toBe(TECHNICAL_SCORING_VERSION);
    expect(TECHNICAL_SCORING_VERSION).toBe(4);
    const llms = result.findings.llmsTxt as { present: boolean; depthScore: number };
    expect(llms.present).toBe(true);
    expect(llms.depthScore).toBeGreaterThan(0);
    const ai = result.findings.aiDiscovery as { aiTxtPresent: boolean | null };
    expect(ai.aiTxtPresent).toBe(true);
    expect(result.dimensions.scoreLlmsTxt).toBe(0);
    expect(result.dimensions.scoreAiDiscovery).toBe(0);
  });

  it("without them: the same score -- their absence lowers nothing", async () => {
    siteFiles({
      "/llms.txt": { body: LLMS, type: "text/plain" },
      "/llms-full.txt": { body: LLMS, type: "text/plain" },
      "/.well-known/ai.txt": { body: "x".repeat(200), type: "text/plain" },
    });
    const withFiles = await orchestrateTechnicalAudit("acme.com.au", SITE, 2);
    vi.restoreAllMocks();
    siteFiles({});
    const withoutFiles = await orchestrateTechnicalAudit("acme.com.au", SITE, 2);
    expect(withoutFiles.scoreComposite).toBe(withFiles.scoreComposite);
  });

  it("a request for either that fails doesn't hold the composite back: it's 'Couldn't check' on its own row", async () => {
    siteFiles({ "/llms.txt": "fail", "/.well-known/ai.txt": "fail", "/ai.txt": "fail" });
    const result = await orchestrateTechnicalAudit("acme.com.au", SITE, 2);
    expect(result.unmeasured).toEqual(expect.arrayContaining(["scoreLlmsTxt"]));
    expect(result.unmeasuredScored).toEqual([]);
  });

  it("the composite is out of 74, from six scored checks", () => {
    const now = scoringOfVersion(4);
    expect(TECHNICAL_AUDIT_MAX_SCORE).toBe(74);
    expect(now.compositeMax).toBe(74);
    expect(scoredChecksOf(now)).toEqual([
      "scoreRobots",
      "scoreSchema",
      "scoreMeta",
      "scoreContent",
      "scoreBrandEntity",
      "scoreSignals",
    ]);
    // AI Discovery's maximum is the sum of its files' weights under each version.
    for (const version of [1, 2, 3, 4] as const) {
      const weights = AI_DISCOVERY_WEIGHTS_BY_VERSION[version];
      expect(DIMENSION_MAXIMA[version].scoreAiDiscovery).toBe(
        weights.aiTxt + weights.aiSummary + weights.aiFaq + weights.aiService,
      );
    }
  });
});

function scoringOfVersion(version: 1 | 2 | 3 | 4) {
  return technicalScoringOf({
    createdAt: "2026-11-20T00:00:00Z",
    findings: { scoringVersion: version },
  });
}

describe("older audits keep their own maximum", () => {
  it("by what each stored: 100 before 21 Oct, 98 to 19 Nov, 95 on 19 Nov, 74 from 20 Nov", () => {
    expect(technicalScoringVersionOf({ createdAt: "2026-10-01T00:00:00Z", findings: {} })).toBe(1);
    expect(technicalScoringVersionOf({ createdAt: "2026-11-10T00:00:00Z", findings: {} })).toBe(2);
    expect(
      technicalScoringVersionOf({
        createdAt: "2026-11-19T12:00:00Z",
        findings: { aiDiscovery: { optionalFilesScored: false } },
      }),
    ).toBe(3);
    // A new audit's own record wins over what its AI Discovery findings also say.
    expect(
      technicalScoringVersionOf({
        createdAt: "2026-11-20T12:00:00Z",
        findings: { scoringVersion: 4, aiDiscovery: { optionalFilesScored: false } },
      }),
    ).toBe(4);
    const max = (createdAt: string, findings: unknown) => compositeMaxFor({ createdAt, findings });
    expect(max("2026-10-01T00:00:00Z", {})).toBe(100);
    expect(max("2026-11-10T00:00:00Z", {})).toBe(98);
    expect(max("2026-11-19T12:00:00Z", { aiDiscovery: { optionalFilesScored: false } })).toBe(95);
    expect(max("2026-11-20T12:00:00Z", { scoringVersion: 4 })).toBe(74);
  });

  it("an older audit's Technical category is out of its own maximum; a new one's leaves llms.txt and AI Discovery out", () => {
    const dims = {
      scoreRobots: 12,
      scoreLlmsTxt: 9,
      scoreSchema: 8,
      scoreMeta: 7,
      scoreContent: 6,
      scoreBrandEntity: 2,
      scoreSignals: 6,
      scoreAiDiscovery: 3,
    };
    // 19 Nov's rules: robots 18 + llms.txt 18 + AI Discovery 3 + signals 6 = 45.
    expect(rollupTo5Categories(dims, scoringOfVersion(3)).technicalPct).toBe(
      Math.round((30 / 45) * 100),
    );
    // 20 Nov's: robots 18 + signals 6 = 24; whatever llms.txt and AI Discovery stored adds nothing.
    expect(rollupTo5Categories(dims, scoringOfVersion(4)).technicalPct).toBe(
      Math.round((18 / 24) * 100),
    );
  });
});

describe("no comparison across scoring versions", () => {
  const side = (composite: number, version: 3 | 4, max: number) => ({
    composite,
    createdAt: "2026-11-20T00:00:00Z",
    siteReached: true,
    version,
    max,
  });
  it("the same rules: the change; different rules: none", () => {
    expect(comparableCompositeDelta(side(50, 4, 74), side(41, 4, 74))).toBe(9);
    expect(comparableCompositeDelta(side(50, 4, 74), side(61, 3, 95))).toBeNull();
  });

  it("the note says when the rules changed, dated by the first audit under the new ones", () => {
    expect(scoringChangeNote(3, 4, "2026-11-20T01:00:00Z")).toBe("Scoring updated on 20 Nov 2026");
    expect(scoringChangeNote(4, 4, "2026-11-20T01:00:00Z")).toBeNull();
  });
});

describe("the Technical Audit page", () => {
  const BRAND = {
    id: BRAND_ID,
    name: "Acme Plumbing",
    domain: "acme.com.au",
    organizationId: "org-1",
  };
  const reached = {
    pagesCrawled: 4,
    homepageReached: true,
    homepageHttpStatus: 200,
    sitemap: null,
  };
  const row = (overrides: Record<string, unknown>) => ({
    id: "t1",
    brandId: BRAND_ID,
    scoreRobots: "15.00",
    scoreLlmsTxt: "0.00",
    scoreSchema: "8.00",
    scoreMeta: "10.00",
    scoreContent: "6.00",
    scoreBrandEntity: "2.00",
    scoreSignals: "6.00",
    scoreAiDiscovery: "0.00",
    scoreComposite: "47.00",
    crawledAt: new Date("2026-11-20T01:00:00Z"),
    createdAt: new Date("2026-11-20T01:00:00Z"),
    ...overrides,
  });
  const LATEST = row({
    findings: {
      scoringVersion: 4,
      crawl: reached,
      llmsTxt: { fetchStatus: "found", present: true },
      aiDiscovery: {
        aiTxtPresent: false,
        aiSummaryPresent: false,
        aiFaqPresent: false,
        aiServicePresent: false,
        notChecked: {},
        optionalFilesScored: false,
      },
    },
  });
  const PREVIOUS_19_NOV = row({
    id: "t0",
    scoreLlmsTxt: "12.00",
    scoreAiDiscovery: "3.00",
    scoreComposite: "62.00",
    createdAt: new Date("2026-11-12T01:00:00Z"),
    findings: { crawl: reached, aiDiscovery: { optionalFilesScored: false } },
  });

  async function renderPage(audits: unknown[]): Promise<string> {
    rows.results = [[BRAND], audits, []];
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/technical-audit/page");
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ brandId: BRAND_ID }) }),
    );
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " ");
  }

  beforeEach(() => {
    rows.results = [];
  });

  it("a new audit: of 74, llms.txt 'Found · not scored', AI Discovery 'Not found · not scored', no 0/18", async () => {
    const text = await renderPage([LATEST]);
    expect(text).toContain("of 74");
    expect(text).toContain("8 checks, 6 scored");
    expect(text).toContain("Found · not scored");
    expect(text).toContain("Not found · not scored");
    expect(text).not.toMatch(/0\/18|0\/0/);
  }, 30_000);

  it("after a 19 Nov audit: no 'vs', both scores, 'Scoring updated on' the new audit's date, Visibility not affected", async () => {
    const text = await renderPage([LATEST, PREVIOUS_19_NOV]);
    expect(text).toContain("Scoring updated on 20 Nov 2026");
    expect(text).toContain("Before: 62 of 95 on 12 Nov, under the earlier rules.");
    expect(text).toContain("Your Visibility score isn't affected.");
    expect(text).not.toMatch(/vs 12 Nov|No change since/);
  }, 30_000);

  it("two audits under the same rules: the change, and no note", async () => {
    const earlier = row({
      id: "t0",
      scoreComposite: "40.00",
      createdAt: new Date("2026-11-20T00:30:00Z"),
      findings: { scoringVersion: 4, crawl: reached },
    });
    const text = await renderPage([LATEST, earlier]);
    expect(text).toContain("+7.0 vs 20 Nov");
    expect(text).not.toContain("Scoring updated");
  }, 30_000);
});
