import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brandEntityScores, brands, organizations, technicalAudits } from "@/db/schema";
import { lookupAbn } from "@/lib/brand-entity/abn-lookup";
import { checkAuTld } from "@/lib/brand-entity/au-tld-signal";
import { brandEntityScore } from "@/lib/brand-entity/score";
import { checkWikipediaAuStatus } from "@/lib/brand-entity/wikipedia-au";
import { crawlSite } from "@/lib/crawler";
import { inngest } from "@/lib/inngest/client";
import type { SiteDependentDimension } from "@/lib/technical-audit/crawl-status";
import { orchestrateTechnicalAudit } from "@/lib/technical-audit/orchestrate";

export async function runTechnicalAuditInline(auditId: string, brandId: string): Promise<void> {
  const [brand] = await serviceDb.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) {
    console.error(`[tech-audit] Brand ${brandId} not found`);
    return;
  }

  const [org] = await serviceDb
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, brand.organizationId));
  if (!org) {
    console.error(`[tech-audit] Org not found for brand ${brandId}`);
    return;
  }

  try {
    console.log(`[tech-audit] Crawling ${brand.domain}...`);
    const crawl = await crawlSite(brand.domain, { maxPages: 20, timeoutMs: 15000 });
    console.log(`[tech-audit] Crawled ${crawl.pages.length} pages for ${brand.domain}`);

    // 17 Nov, part 3: the Wikipedia check's own three states are kept ("found", "not_found", "unavailable"), so
    // the Brand & Entity page can say "Couldn't check" when the lookup failed instead of "no page found".
    const [abnResult, wikiStatus] = await Promise.all([
      lookupAbn(brand.abn),
      checkWikipediaAuStatus(brand.name),
    ]);
    const wikiResult =
      wikiStatus.status === "found"
        ? {
            wikipediaAuPresent: true,
            wikipediaAuUrl: wikiStatus.url,
            wikipediaAuMentions: wikiStatus.mentions,
          }
        : { wikipediaAuPresent: false, wikipediaAuUrl: null, wikipediaAuMentions: 0 };
    const auTldResult = checkAuTld(brand.domain);

    // Vunnara (21 Oct, "directory listings... never scraping", Part A3):
    // checkAuDirectories is gone -- it requested a page neither hipages
    // nor ServiceSeeking actually permitted (see lib/brand-entity/
    // au-directory-aggregate.ts's own doc comment). brandEntityScore no
    // longer takes a directory count at all.
    const entityInput = {
      abnVerified: abnResult.abnVerified,
      wikipediaAuPresent: wikiResult.wikipediaAuPresent,
      auTldPresent: auTldResult.auTldPresent,
    };
    const entityScoreValue = brandEntityScore(entityInput);
    // Leftovers task, part 3 (17 Nov): an ABN or Wikipedia lookup that didn't complete counted 0 in the score, shown
    // as measured. The Brand & Entity score -- and so the composite -- is stored only when both completed.
    const entityLookupFailed =
      abnResult.abnStatus === "check_failed" || wikiStatus.status === "unavailable";

    const result = await orchestrateTechnicalAudit(brand.domain, crawl, entityScoreValue);

    // 17 Nov, part 3: a crawl that never reached the site stores no score for the checks that needed it, and no
    // composite -- the scorers' numbers for an empty crawl are not measurements. The same for robots.txt or
    // llms.txt alone when that request got no answer. Brand & Entity doesn't read the site, so it keeps its
    // score. findings.crawl / robots.fetchStatus / llmsTxt.fetchStatus say what happened.
    const siteScore = (key: SiteDependentDimension): string | null =>
      result.unmeasured.includes(key) ? null : result.dimensions[key].toFixed(2);

    await serviceDb.insert(technicalAudits).values({
      brandId,
      organizationId: brand.organizationId,
      auditId,
      scoreRobots: siteScore("scoreRobots"),
      scoreLlmsTxt: siteScore("scoreLlmsTxt"),
      scoreSchema: siteScore("scoreSchema"),
      scoreMeta: siteScore("scoreMeta"),
      scoreContent: siteScore("scoreContent"),
      scoreBrandEntity: entityLookupFailed ? null : result.dimensions.scoreBrandEntity.toFixed(2),
      scoreSignals: siteScore("scoreSignals"),
      scoreAiDiscovery: siteScore("scoreAiDiscovery"),
      scoreComposite:
        result.unmeasured.length === 0 && !entityLookupFailed
          ? result.scoreComposite.toFixed(2)
          : null,
      findings: Object.assign({}, result.findings, {
        brandEntity: {
          score: entityLookupFailed ? null : entityScoreValue,
          abnVerified: abnResult.abnVerified,
          abnNumber: abnResult.abnNumber,
          abnStatus: abnResult.abnStatus,
          wikipediaAuPresent: wikiResult.wikipediaAuPresent,
          wikipediaAuStatus: wikiStatus.status,
          wikipediaAuUrl: wikiResult.wikipediaAuUrl,
          auTldPresent: auTldResult.auTldPresent,
          // Vunnara (21 Oct, Part A3): no directoryPresence field any
          // more -- never write a value from a check this product no
          // longer makes.
        },
      }),
      crawledAt: crawl.crawledAt,
    });

    await serviceDb.insert(brandEntityScores).values({
      brandId,
      abnVerified: abnResult.abnVerified,
      abnNumber: abnResult.abnNumber,
      abnEntityName: abnResult.abnEntityName,
      abnStatus: abnResult.abnStatus,
      wikipediaAuPresent: wikiResult.wikipediaAuPresent,
      wikipediaAuUrl: wikiResult.wikipediaAuUrl,
      wikipediaAuMentions: wikiResult.wikipediaAuMentions,
      auTldDomains: auTldResult.auTldDomains,
      // Vunnara (21 Oct, Part A3): auDirectoryPresence is never written
      // here any more -- left at its column default ([]), same as every
      // row this prod-fix clears. Directory presence now comes only
      // from the owner's own confirmation (Part C) or AI-answer
      // citations (Part D), on their own surfaces.
      scoreOf10: entityScoreValue.toFixed(2),
    });

    await inngest.send({
      name: "technical-audit/complete",
      data: { brandId, orgId: brand.organizationId, auditId },
    });

    console.log(`[tech-audit] Complete for ${brand.domain}: composite=${result.scoreComposite}`);
  } catch (err) {
    console.error(
      `[tech-audit] Failed for ${brand.domain}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
