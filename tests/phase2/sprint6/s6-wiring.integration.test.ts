import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Sprint 6 wiring — integration checks", () => {
  const serveRoute = readFileSync(
    join(__dirname, "../../../app/api/webhooks/inngest/route.ts"),
    "utf-8",
  );

  it("serve() registers all 5 Sprint 6 Inngest functions", () => {
    expect(serveRoute).toContain("crawlerLogIngestFn");
    expect(serveRoute).toContain("contentStructureAuditFn");
    expect(serveRoute).toContain("llmstxtRefreshFn");
    expect(serveRoute).toContain("scoreAgentReadinessFn");
    expect(serveRoute).toContain("auditEntityHomeFn");
  });

  const narrativeGen = readFileSync(
    join(__dirname, "../../../lib/communication/narrative-generator.ts"),
    "utf-8",
  );

  it("narrative-generator wires entity_home_status section", () => {
    expect(narrativeGen).toContain('"entity_home_status"');
    expect(narrativeGen).toContain("entityHomeSummary");
  });

  it("narrative-generator wires agent_readiness section", () => {
    expect(narrativeGen).toContain('"agent_readiness"');
    expect(narrativeGen).toContain("agentReadinessSummary");
  });

  const retentionFn = readFileSync(
    join(__dirname, "../../../inngest/functions/audit-data-retention.ts"),
    "utf-8",
  );

  it("retention function purges crawler_visit_logs at 90 days", () => {
    expect(retentionFn).toContain("crawlerVisitLogs");
    expect(retentionFn).toContain("90");
  });

  const middleware = readFileSync(
    join(__dirname, "../../../middleware.ts"),
    "utf-8",
  );

  it("middleware has /api/visit as public route", () => {
    expect(middleware).toContain("/api/visit");
  });

  const defaultTemplate = readFileSync(
    join(__dirname, "../../../db/seed/default-report-template.ts"),
    "utf-8",
  );

  it("default template has agent_readiness include:true (Bug-A fix)", () => {
    const match = defaultTemplate.match(
      /\{\s*type:\s*"agent_readiness",\s*include:\s*(true|false)\s*\}/,
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("true");
  });

  it("default template has entity_home_status include:true (Bug-A fix)", () => {
    const match = defaultTemplate.match(
      /\{\s*type:\s*"entity_home_status",\s*include:\s*(true|false)\s*\}/,
    );
    expect(match).not.toBeNull();
    expect(match![1]).toBe("true");
  });

  const auditEntityHome = readFileSync(
    join(__dirname, "../../../inngest/functions/audit-entity-home.ts"),
    "utf-8",
  );

  it("auditEntityHomeFn persists entity-home cols to content_structure_audits (Fix B)", () => {
    expect(auditEntityHome).toContain("contentStructureAudits");
    expect(auditEntityHome).toContain("isEntityHomeCandidate");
    expect(auditEntityHome).toContain("entityHomeHasOrgSchema");
    expect(auditEntityHome).toContain("entityHomeHasIdField");
    expect(auditEntityHome).toContain("entityHomeSameAsCount");
    expect(auditEntityHome).toContain("onConflictDoUpdate");
  });

  it("narrative-generator entity_home_status reads real cols not URL heuristic (Fix B)", () => {
    expect(narrativeGen).toContain("isEntityHomeCandidate");
    expect(narrativeGen).not.toMatch(/pageUrl\.includes\("\/about"\)/);
    expect(narrativeGen).toContain("entityHomeHasOrgSchema");
    expect(narrativeGen).toContain("sameAsCount");
  });

  const entityHomeRoute = readFileSync(
    join(__dirname, "../../../app/api/brands/[brandId]/entity-home/route.ts"),
    "utf-8",
  );

  it("entity-home route reads real isEntityHomeCandidate col not URL heuristic (Fix B)", () => {
    expect(entityHomeRoute).toContain("isEntityHomeCandidate");
    expect(entityHomeRoute).not.toMatch(/pageUrl\.includes\("\/about"\)/);
    expect(entityHomeRoute).toContain("entityHomeHasOrgSchema");
  });

  const scoreSummary = readFileSync(
    join(__dirname, "../../../components/domain/retrieval/retrieval-score-summary.tsx"),
    "utf-8",
  );

  it("hub stat cards do NOT include standalone llms.txt depth (LLD 5457/2911)", () => {
    expect(scoreSummary).not.toContain("llmstxtDepth");
    expect(scoreSummary).not.toContain("llms.txt Depth");
    expect(scoreSummary).not.toContain("/18");
  });

  const agentReadinessCard = readFileSync(
    join(__dirname, "../../../components/domain/retrieval/agent-readiness-card.tsx"),
    "utf-8",
  );

  it("depth_score surfaced inside agent-readiness as Technical sub-signal (LLD 5457/2911)", () => {
    expect(agentReadinessCard).toContain("llmstxtDepthScore");
    expect(agentReadinessCard).toContain("Technical sub-signals");
    expect(agentReadinessCard).toContain("llms.txt depth");
    expect(agentReadinessCard).toContain("MCP");
  });

  const entityHomeCard = readFileSync(
    join(__dirname, "../../../components/domain/retrieval/entity-home-card.tsx"),
    "utf-8",
  );

  it("entity-home card renders §6U.6 fields not content-structure fields", () => {
    expect(entityHomeCard).toContain("idFieldPresent");
    expect(entityHomeCard).toContain("sameAsCount");
    expect(entityHomeCard).toContain("orgSchemaPresent");
    expect(entityHomeCard).toContain("@id:");
    expect(entityHomeCard).toContain("/3 required");
    expect(entityHomeCard).not.toContain("citationProbabilityScore");
    expect(entityHomeCard).not.toContain("answerCapsuleScore");
    expect(entityHomeCard).not.toContain("contentFormatDetected");
  });

  const entityHomePage = readFileSync(
    join(__dirname, "../../../app/(auth)/brands/[brandId]/retrieval/entity-home/page.tsx"),
    "utf-8",
  );

  it("entity-home page passes entityHomeStatus to EntityHomeCard", () => {
    expect(entityHomePage).toContain("entityHomeStatus");
    expect(entityHomePage).toContain("EntityHomeCard");
  });

  it("entity-home page has NO content-structure grid (§6U.6 = status + gaps only)", () => {
    expect(entityHomePage).not.toContain("ContentStructureCard");
    expect(entityHomePage).not.toContain("Audited Pages");
    expect(entityHomePage).not.toContain("content-structure-card");
  });

  const csPage = readFileSync(
    join(__dirname, "../../../app/(auth)/brands/[brandId]/retrieval/content-structure/page.tsx"),
    "utf-8",
  );

  it("content-structure page has full-width citation headline (§6U.4, not buried)", () => {
    expect(csPage).toContain("How likely is this page to be cited by AI");
    expect(csPage).toContain("citationBandColor");
    expect(csPage).toContain("citationBandLabel");
    expect(csPage).not.toMatch(/grid.*cols.*only/);
  });

  const csCard = readFileSync(
    join(__dirname, "../../../components/domain/retrieval/content-structure-card.tsx"),
    "utf-8",
  );

  it("citation-probability bands use §6U.4 thresholds (0.70/0.40)", () => {
    expect(csCard).toContain("0.70");
    expect(csCard).toContain("0.40");
    expect(csCard).not.toMatch(/citProb >= 0\.5/);
    expect(csCard).not.toMatch(/citProb >= 0\.3[^0-9]/);
    expect(csPage).toContain("0.70");
    expect(csPage).toContain("0.40");
  });

  it("no hardcoded 'white' color on accent-primary buttons (S5 bug-8 class)", () => {
    const arPage = readFileSync(
      join(__dirname, "../../../app/(auth)/brands/[brandId]/retrieval/agent-readiness/page.tsx"),
      "utf-8",
    );
    const llmstxtViewer = readFileSync(
      join(__dirname, "../../../components/domain/retrieval/llmstxt-viewer.tsx"),
      "utf-8",
    );
    expect(arPage).not.toMatch(/color:.*["']white["']/);
    expect(llmstxtViewer).not.toMatch(/color:.*["']white["']/);
    expect(arPage).toContain("var(--accent-primary-fg)");
    expect(llmstxtViewer).toContain("var(--accent-primary-fg)");
  });
});
