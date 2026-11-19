import { and, desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  agentReadinessScores,
  brandEntityScores,
  brands,
  llmstxtVersions,
  technicalAudits,
} from "@/db/schema";
import { findQuestionHeadings } from "@/lib/answer-capsules/find-questions";
import { abnWasChecked } from "@/lib/brand-entity/score";
import { wikipediaStatusFromFindings } from "@/lib/brand-entity/wikipedia-au";
import { crawlSite } from "@/lib/crawler";
import type { CrawlPage } from "@/lib/crawler/types";
import { inngest } from "@/lib/inngest/client";
import { ExplainabilityService } from "@/lib/platform/explainability";
import { computeLocalAiTrustScore } from "@/lib/platform/local-ai-trust-scorer";
import {
  computeAuthorityScore,
  computeEntityClarityScore,
  computeTaskScore,
  computeTechScore,
  computeTotalScore,
  computeVerifyScore,
} from "@/lib/retrieval/agent-readiness";
import { auditEntityHome } from "@/lib/retrieval/entity-home-auditor";
import { checkMcpEndpoint } from "@/lib/retrieval/mcp-checker";
import { readinessRobots } from "@/lib/robots-txt/evaluate";

// Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: robots.txt's own rules (RFC 9309, lib/robots-txt/evaluate.ts). This
// read any "disallow: /" under them or * as a block -- "Disallow: /admin" too. 20 Nov: for the search crawlers, not
// GPTBot and ClaudeBot (READINESS_CRAWLERS).
const robotsAllowsCrawlers = (robotsTxt: string | null) =>
  readinessRobots(robotsTxt).allowsCrawlers;

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
      (/\$\d+/i.test(text) || /pric(e|ing)/i.test(text) || /\/pricing/i.test(page.url))
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
  async ({
    event,
    step,
  }: {
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
        maxPages: 20,
        timeoutMs: 15000,
      });
    });

    // 17 Nov, part 3 (in-step logic only; no step id, trigger or function id changed): an input nothing measures
    // is null and earns no points (lib/retrieval/agent-readiness.ts). This hard-coded page load fast true, name
    // consistent true, Wikipedia false, directories from a column only a stub writes (lib/trust/entity-checker.ts
    // localDirectoryCount: 0), review citations 0, expert quotes false and citation rate / diversity 0. And a
    // crawl that reached no page scores none of the parts read from the pages, instead of measured zeros.
    const siteReached = crawlResult.pages.length > 0;

    const techSignals = await step.run("check-tech", async () => {
      const llmstxtRows = await serviceDb
        .select()
        .from(llmstxtVersions)
        .where(and(eq(llmstxtVersions.brandId, brandId), eq(llmstxtVersions.isCurrent, true)))
        .limit(1);
      const llmstxtRow = llmstxtRows[0];

      const mcp = await checkMcpEndpoint(brand.domain);
      // robots.txt that didn't answer (a 5xx or no answer) isn't "no robots.txt, so nothing blocks".
      const robotsUnread = crawlResult.robotsTxtFetch?.status === "unreachable";

      return {
        // VisibleAU's own generated draft (llmstxt_versions), not a file on the site.
        llmstxtPresent: !!llmstxtRow,
        llmstxtValid: !!llmstxtRow && llmstxtRow.depthScore >= 6,
        robotsAllowsCrawlers:
          !siteReached || robotsUnread ? null : robotsAllowsCrawlers(crawlResult.robotsTxt),
        ssrPasses: siteReached ? checkSsr(crawlResult.pages) : null,
        aiDiscoveryEndpoints:
          !siteReached || crawlResult.sitemap?.status === "unreachable"
            ? null
            : !!crawlResult.sitemapXml,
        // Nothing measures page speed.
        pageLoadFast: null,
        // Leftovers task, part 3: null when it couldn't be checked (lib/retrieval/mcp-checker.ts) or the site wasn't
        // reached -- never "absent".
        mcpEndpointPresent: siteReached ? mcp.mcpEndpointPresent : null,
        mcpEndpointValid: siteReached ? mcp.mcpEndpointValid : null,
        mcpToolsCount: mcp.mcpToolsCount,
      };
    });

    const entitySignals = await step.run("check-entity", async () => {
      const entityHome = auditEntityHome(brand.domain, crawlResult.pages);
      const html = crawlResult.pages[0]?.html ?? "";
      const hasLocalBiz = /"@type"\s*:\s*"LocalBusiness"/i.test(html);
      const hasLocalReg = /australianBusinessRegister|abn/i.test(html);

      return {
        orgSchemaPresent: siteReached ? entityHome.entityHomeHasOrgSchema : null,
        localBusinessSchema: siteReached ? hasLocalBiz : null,
        localRegInSchema: siteReached ? hasLocalReg : null,
        // Nothing compares the name across the web.
        nameConsistent: null,
        serviceReadable: siteReached
          ? crawlResult.pages.some((p: { url: string }) => /\/services/i.test(p.url))
          : null,
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
      // The technical audit that triggered this run keeps the Wikipedia lookup's own state; an older one only
      // says "present" (true) or false, which also covers a lookup that failed.
      const [tech] = await serviceDb
        .select({ findings: technicalAudits.findings })
        .from(technicalAudits)
        .where(eq(technicalAudits.brandId, brandId))
        .orderBy(desc(technicalAudits.createdAt))
        .limit(1);
      const wikiStatus = wikipediaStatusFromFindings(tech?.findings);

      return {
        // Leftovers task, part 3: only an ABN that was looked up (abnWasChecked); a skipped or failed lookup is
        // unmeasured, never "ABN not yet verified".
        abnConfirmed: entity && abnWasChecked(entity) ? entity.abnVerified : null,
        wikipediaAu:
          wikiStatus === "found"
            ? true
            : wikiStatus === "not_found"
              ? false
              : entity?.wikipediaAuPresent === true
                ? true
                : null,
        // Directory listings, review citations and expert quotes: nothing measures them.
        auDirectories: null,
        reviewCitations: null,
        expertQuotes: null,
      };
    });

    const authoritySignals = await step.run("check-authority", () => {
      return {
        topicalCoverage: siteReached ? Math.min(crawlResult.pages.length * 5, 100) : null,
        // Nothing here reads the audits' citations yet.
        citationRate: null,
        citationDiversity: null,
      };
    });

    const taskFitSignals = await step.run("detect-task-fit", () => {
      return siteReached
        ? detectTaskFitFromCrawl(crawlResult.pages)
        : {
            bookingAccessible: null,
            pricingVisible: null,
            serviceAreaDefined: null,
            faqDirectAnswers: null,
          };
    });

    const scores = await step.run("compute-and-store", async () => {
      const techScore = computeTechScore(techSignals);
      const entityClarityScore = computeEntityClarityScore(entitySignals);
      const verifyScore = computeVerifyScore(verifySignals);
      const authorityScore = computeAuthorityScore(authoritySignals);
      const taskScore = computeTaskScore(taskFitSignals);
      const totalScore = computeTotalScore(
        techScore,
        entityClarityScore,
        verifyScore,
        authorityScore,
        taskScore,
      );

      const localTrust = await computeLocalAiTrustScore(serviceDb, brandId, brand.vertical);
      // 9 Nov: only a score from every part is stored. A partial one would read as the whole score on the card,
      // the Health Check and the retrieval score, none of which can say which parts it came from; the gaps say.
      const localTrustComplete =
        localTrust.localAiTrustScore !== null && localTrust.notMeasuredParts.length === 0;

      const gaps: string[] = [];
      if (localTrust.localAiTrustScore !== null && !localTrustComplete) {
        gaps.push(
          `Local AI Trust isn't scored yet: ${localTrust.measuredParts.join(", ")} checked; still to check: ${localTrust.notMeasuredParts.join(", ")}.`,
        );
      }
      // 20 Nov: no llms.txt gap -- llms.txt isn't scored, and nothing implies an AI engine needs it
      // (lib/retrieval/agent-readiness-breakdown.ts readinessGapText).
      // Which crawler it blocks, from the crawl-site step's robots.txt (that step's output is unchanged, so a run
      // in flight across a deploy reads the same shape).
      const robotsGap = readinessRobots(crawlResult.robotsTxt).gap;
      if (techSignals.robotsAllowsCrawlers === false && robotsGap) gaps.push(robotsGap);
      if (techSignals.mcpEndpointPresent === false)
        gaps.push("No MCP endpoint found. Consider exposing an MCP manifest.");
      if (entitySignals.orgSchemaPresent === false)
        gaps.push("Missing Organisation JSON-LD on your Entity Home page.");
      if (verifySignals.abnConfirmed === false)
        gaps.push("ABN not yet verified. Add your ABN to structured data.");
      if (taskFitSignals.bookingAccessible === false)
        gaps.push("No online booking detected. Add a booking link or widget.");
      if (taskFitSignals.pricingVisible === false)
        gaps.push("No visible pricing. Surface pricing for AI answer extraction.");

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
        localAiTrustScore: localTrustComplete ? localTrust.localAiTrustScore : null,
        totalScore,
        gaps,
      });

      return {
        totalScore,
        techScore,
        entityClarityScore,
        verifyScore,
        authorityScore,
        taskScore,
        gaps,
      };
    });

    await inngest.send({
      name: "agent/readiness-scored",
      data: { brandId, organizationId, totalScore: scores.totalScore },
    });

    return scores;
  },
);
