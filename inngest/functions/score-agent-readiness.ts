import { eq, desc, and } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  brands,
  agentReadinessScores,
  brandEntityScores,
  llmstxtVersions,
} from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { crawlSite } from "@/lib/crawler";
import type { CrawlPage } from "@/lib/crawler/types";
import { checkMcpEndpoint } from "@/lib/retrieval/mcp-checker";
import { auditEntityHome } from "@/lib/retrieval/entity-home-auditor";
import { findQuestionHeadings } from "@/lib/answer-capsules/find-questions";
import {
  computeTechScore,
  computeEntityClarityScore,
  computeVerifyScore,
  computeAuthorityScore,
  computeTaskScore,
  computeTotalScore,
} from "@/lib/retrieval/agent-readiness";
import { computeLocalAiTrustScore } from "@/lib/platform/local-ai-trust-scorer";
import { ExplainabilityService } from "@/lib/platform/explainability";

function robotsAllowsCrawlers(robotsTxt: string | null): boolean {
  if (!robotsTxt) return true;
  const lower = robotsTxt.toLowerCase();
  const blocks = lower.split(/user-agent\s*:/);
  for (const block of blocks) {
    const agentLine = block.split("\n")[0]?.trim();
    if (
      agentLine === "gptbot" ||
      agentLine === "claudebot" ||
      agentLine === "*"
    ) {
      if (block.includes("disallow: /")) return false;
    }
  }
  return true;
}

function checkSsr(pages: CrawlPage[]): boolean {
  const home = pages[0];
  if (!home) return false;
  return home.html.length > 500 && home.wordCount > 50;
}

function detectTaskFitFromCrawl(pages: CrawlPage[]): {
  bookingAccessible: boolean;
  pricingVisible: boolean;
  serviceAreaDefined: boolean;
  faqDirectAnswers: number;
} {
  let bookingAccessible = false;
  let pricingVisible = false;
  let serviceAreaDefined = false;
  let faqDirectAnswers = 0;

  for (const page of pages) {
    const text = page.textContent.toLowerCase();
    const html = page.html.toLowerCase();

    if (
      !bookingAccessible &&
      (/book(ing)?\s*(now|online|appointment)/i.test(text) ||
        /schedule\s*(a|an|your)?\s*(consultation|appointment|call)/i.test(text) ||
        html.includes("calendly.com") ||
        html.includes("acuity") ||
        /\/book/i.test(page.url))
    ) {
      bookingAccessible = true;
    }

    if (
      !pricingVisible &&
      (/\$\d+/i.test(text) ||
        /pric(e|ing)/i.test(text) ||
        /\/pricing/i.test(page.url))
    ) {
      pricingVisible = true;
    }

    if (
      !serviceAreaDefined &&
      (/service\s*area/i.test(text) ||
        /we\s+serv(e|ice)\s/i.test(text) ||
        /suburbs?\s+we\s+(cover|service)/i.test(text) ||
        /\/service-area/i.test(page.url))
    ) {
      serviceAreaDefined = true;
    }

    const questions = findQuestionHeadings(page);
    faqDirectAnswers += questions.length;
  }

  return {
    bookingAccessible,
    pricingVisible,
    serviceAreaDefined,
    faqDirectAnswers: Math.min(faqDirectAnswers, 20),
  };
}

export const scoreAgentReadinessFn = inngest.createFunction(
  {
    id: "score-agent-readiness",
    retries: 1,
    triggers: [{ event: "technical-audit/complete" }],
  },
  async ({ event, step }: {
    event: { data: { brandId: string; orgId: string; auditId: string } };
    step: any;
  }) => {
    const { brandId, orgId: organizationId } = event.data;

    const brand = await step.run("load-brand", async () => {
      const [row] = await serviceDb
        .select({
          id: brands.id,
          domain: brands.domain,
          name: brands.name,
          vertical: brands.vertical,
        })
        .from(brands)
        .where(eq(brands.id, brandId))
        .limit(1);
      return row;
    });

    if (!brand) return { error: "brand not found" };

    const crawlResult = await step.run("crawl-site", async () => {
      return crawlSite(brand.domain, {
        userAgent: "GPTBot/1.1",
        maxPages: 20,
        timeoutMs: 15000,
      });
    });

    const techSignals = await step.run("check-tech", async () => {
      const llmstxtRows = await serviceDb
        .select()
        .from(llmstxtVersions)
        .where(
          and(
            eq(llmstxtVersions.brandId, brandId),
            eq(llmstxtVersions.isCurrent, true),
          ),
        )
        .limit(1);
      const llmstxtRow = llmstxtRows[0];

      const mcp = await checkMcpEndpoint(brand.domain);

      return {
        llmstxtPresent: !!llmstxtRow,
        llmstxtValid: !!llmstxtRow && llmstxtRow.depthScore >= 6,
        robotsAllowsCrawlers: robotsAllowsCrawlers(crawlResult.robotsTxt),
        ssrPasses: checkSsr(crawlResult.pages),
        aiDiscoveryEndpoints: !!crawlResult.sitemapXml,
        pageLoadFast: true,
        mcpEndpointPresent: mcp.mcpEndpointPresent,
        mcpEndpointValid: mcp.mcpEndpointValid,
        mcpToolsCount: mcp.mcpToolsCount,
      };
    });

    const entitySignals = await step.run("check-entity", async () => {
      const entityHome = auditEntityHome(brand.domain, crawlResult.pages);
      const html = crawlResult.pages[0]?.html ?? "";
      const hasLocalBiz = /"@type"\s*:\s*"LocalBusiness"/i.test(html);
      const hasLocalReg = /australianBusinessRegister|abn/i.test(html);

      return {
        orgSchemaPresent: entityHome.entityHomeHasOrgSchema,
        localBusinessSchema: hasLocalBiz,
        localRegInSchema: hasLocalReg,
        nameConsistent: true,
        serviceReadable: crawlResult.pages.some((p: { url: string }) => /\/services/i.test(p.url)),
      };
    });

    const verifySignals = await step.run("check-verify", async () => {
      const entityRows = await serviceDb
        .select()
        .from(brandEntityScores)
        .where(eq(brandEntityScores.brandId, brandId))
        .orderBy(desc(brandEntityScores.checkedAt))
        .limit(1);
      const entity = entityRows[0];

      return {
        abnConfirmed: entity?.abnVerified === true,
        wikipediaAu: false,
        auDirectories: entity?.localDirectoryCount ?? 0,
        reviewCitations: 0,
        expertQuotes: false,
      };
    });

    const authoritySignals = await step.run("check-authority", () => {
      return {
        topicalCoverage: Math.min(crawlResult.pages.length * 5, 100),
        citationRate: 0,
        citationDiversity: 0,
      };
    });

    const taskFitSignals = await step.run("detect-task-fit", () => {
      return detectTaskFitFromCrawl(crawlResult.pages);
    });

    const scores = await step.run("compute-and-store", async () => {
      const techScore = computeTechScore(techSignals);
      const entityClarityScore = computeEntityClarityScore(entitySignals);
      const verifyScore = computeVerifyScore(verifySignals);
      const authorityScore = computeAuthorityScore(authoritySignals);
      const taskScore = computeTaskScore(taskFitSignals);
      const totalScore = computeTotalScore(
        techScore, entityClarityScore, verifyScore, authorityScore, taskScore,
      );

      const localTrust = await computeLocalAiTrustScore(
        serviceDb, brandId, brand.vertical,
      );

      const gaps: string[] = [];
      if (!techSignals.llmstxtPresent) gaps.push("No llms.txt file detected — generate and host one.");
      if (!techSignals.robotsAllowsCrawlers) gaps.push("robots.txt blocks AI crawlers. Allow GPTBot and ClaudeBot.");
      if (!techSignals.mcpEndpointPresent) gaps.push("No MCP endpoint found. Consider exposing an MCP manifest.");
      if (!entitySignals.orgSchemaPresent) gaps.push("Missing Organisation JSON-LD on your Entity Home page.");
      if (!verifySignals.abnConfirmed) gaps.push("ABN not yet verified. Add your ABN to structured data.");
      if (!taskFitSignals.bookingAccessible) gaps.push("No online booking detected. Add a booking link or widget.");
      if (!taskFitSignals.pricingVisible) gaps.push("No visible pricing. Surface pricing for AI answer extraction.");

      await serviceDb.insert(agentReadinessScores).values({
        brandId,
        organizationId,
        techLlmstxtPresent: techSignals.llmstxtPresent,
        techLlmstxtValid: techSignals.llmstxtValid,
        techRobotsAllowsCrawlers: techSignals.robotsAllowsCrawlers,
        techSsrPasses: techSignals.ssrPasses,
        techAiDiscoveryEndpoints: techSignals.aiDiscoveryEndpoints,
        techPageLoadFast: techSignals.pageLoadFast,
        techMcpEndpointPresent: techSignals.mcpEndpointPresent,
        techMcpEndpointValid: techSignals.mcpEndpointValid,
        techMcpToolsCount: techSignals.mcpToolsCount,
        techScore,
        entityOrgSchemaPresent: entitySignals.orgSchemaPresent,
        entityLocalBusinessSchema: entitySignals.localBusinessSchema,
        entityLocalRegInSchema: entitySignals.localRegInSchema,
        entityNameConsistent: entitySignals.nameConsistent,
        entityServiceReadable: entitySignals.serviceReadable,
        entityClarityScore,
        verifyAbnConfirmed: verifySignals.abnConfirmed,
        verifyWikipediaAu: verifySignals.wikipediaAu,
        verifyAuDirectories: verifySignals.auDirectories,
        verifyReviewCitations: verifySignals.reviewCitations,
        verifyExpertQuotes: verifySignals.expertQuotes,
        verifyScore,
        authorityTopicalCoverage: authoritySignals.topicalCoverage,
        authorityPromptAppearance: authoritySignals.citationRate,
        authorityCitationDiversity: authoritySignals.citationDiversity,
        authorityScore,
        taskBookingAccessible: taskFitSignals.bookingAccessible,
        taskPricingVisible: taskFitSignals.pricingVisible,
        taskServiceAreaDefined: taskFitSignals.serviceAreaDefined,
        taskFaqDirectAnswers: taskFitSignals.faqDirectAnswers,
        taskScore,
        localAiTrustScore: localTrust.localAiTrustScore,
        totalScore,
        gaps,
      });

      return { totalScore, techScore, entityClarityScore, verifyScore, authorityScore, taskScore, gaps };
    });

    await inngest.send({
      name: "agent/readiness-scored",
      data: { brandId, organizationId, totalScore: scores.totalScore },
    });

    return scores;
  },
);
