/**
 * 20 Nov (Sri's decision, part 7): every place that shows a technical score shows that audit's own maximum (its scoring
 * version, lib/technical-audit/scoring-version.ts), and the one place two technical audits meet -- the Technical Audit
 * page's "vs last" -- shows "Scoring updated on <date>" with both scores across a version change. Nothing else (the
 * brand overview, the Agency Dashboard, the client portal, the PDF, the weekly email, webhooks, exports) reads
 * technical_audits; this test fails when something new does, so it's checked here first.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const ROOTS = ["app", "components", "lib", "inngest"];
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Every file that reads technical_audits, and how it gets each audit's maximum (or why it needs none). */
const READERS: Record<string, string> = {
  "app/(auth)/brands/[brandId]/technical-audit/page.tsx":
    "composite and each check: technicalScoringOf; 'Scoring updated'",
  "app/api/brands/[brandId]/site-readiness/route.ts":
    "the Health Check's composite: technicalScoringOf",
  "app/(auth)/brands/[brandId]/ai-discovery/page.tsx": "AI Discovery: technicalScoringOf",
  "app/(auth)/brands/[brandId]/llms-txt-generator/page.tsx": "llms.txt: technicalScoringOf",
  "app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx":
    "Brand & Entity: technicalScoringOf (10 before 21 Oct)",
  "app/api/technical-audits/[id]/route.ts": "the raw row, with its scoring",
  // The same maximum under every version (DIMENSION_MAXIMA): robots.txt 18, schema 16, meta tags 14, signals 6.
  "app/(auth)/brands/[brandId]/robots-txt-config/page.tsx": "robots.txt: 18 in every version",
  "app/(auth)/brands/[brandId]/schema-audit/page.tsx": "schema: 16 in every version",
  "app/(auth)/brands/[brandId]/meta-tags/page.tsx": "meta tags: 14 in every version",
  "app/(auth)/brands/[brandId]/signals/page.tsx": "signals: 6 in every version",
  // Findings only, no score shown.
  "app/(auth)/brands/[brandId]/answer-capsules/page.tsx": "findings only",
  "app/(auth)/brands/[brandId]/ssr-check/page.tsx": "findings only",
  "app/api/brands/[brandId]/entity-score/route.ts": "findings only (Wikipedia)",
  "inngest/functions/score-agent-readiness.ts": "findings only (Wikipedia)",
  // S01 part 6 (LLD 8.1.4): "Beyond AI answers" -- the audit page card, the Enhanced PDF page and the portal show the
  // latest technical score "with its own maximum (compositeMaxFor)" and the robots.txt findings.
  "lib/reports/beyond-ai.ts": "Beyond AI answers: technicalScoringOf",
  // S01B part 2 (LLD amendment 49): the weekly retention job deletes technical audits that belong to no audit (an
  // Enhanced report's refresh) past the audits' cutoff; it shows no score.
  "lib/retention/audit-retention.ts": "retention: ids only, no score",
};

const USES_ITS_OWN_SCORING = [
  "app/(auth)/brands/[brandId]/technical-audit/page.tsx",
  "app/api/brands/[brandId]/site-readiness/route.ts",
  "app/(auth)/brands/[brandId]/ai-discovery/page.tsx",
  "app/(auth)/brands/[brandId]/llms-txt-generator/page.tsx",
  "app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx",
  "app/api/technical-audits/[id]/route.ts",
  "lib/reports/beyond-ai.ts",
];

describe("every reader of technical_audits is accounted for", () => {
  readSourcesBeforeAll(ROOTS);

  it("no other file reads it (the overview, agency, portal, PDF, email, webhooks and exports don't)", () => {
    const readers = sourcePaths(ROOTS)
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) =>
        /technicalAudits\.score|from\(technicalAudits\)/.test(stripComments(sourceText(path))),
      )
      .sort();
    expect(readers).toEqual(Object.keys(READERS).sort());
  });

  it("each one that shows a score that changed between versions reads the audit's own scoring", () => {
    for (const path of USES_ITS_OWN_SCORING) {
      expect(stripComments(readFileSync(path, "utf8")), path).toContain("technicalScoringOf(");
    }
  });

  it("the Brand & Entity page shows its audit's own maximum, not today's 8 for every audit", () => {
    const src = stripComments(
      readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8"),
    );
    expect(src).not.toContain("BRAND_ENTITY_MAX_SCORE");
    expect(src).toContain("technicalScoringOf(techAudit).dimensionMax.scoreBrandEntity");
  });

  it("the one comparison, on the Technical Audit page, names the change and keeps both scores", () => {
    const src = stripComments(
      readFileSync("app/(auth)/brands/[brandId]/technical-audit/page.tsx", "utf8"),
    );
    expect(src).toContain("scoringChangeNote(prevScoring.version, scoring.version");
    expect(src).toContain("VISIBILITY_SCORE_NOT_AFFECTED");
    expect(src).toContain("version: prevScoring.version");
  });
});
