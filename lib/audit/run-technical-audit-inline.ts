import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brandEntityScores, brands, organizations, technicalAudits } from "@/db/schema";
import { lookupAbn } from "@/lib/brand-entity/abn-lookup";
import { checkAuDirectories } from "@/lib/brand-entity/au-directory-aggregate";
import { checkAuTld } from "@/lib/brand-entity/au-tld-signal";
import { brandEntityScore } from "@/lib/brand-entity/score";
import { checkWikipediaAu } from "@/lib/brand-entity/wikipedia-au";
import { crawlSite } from "@/lib/crawler";
import { orchestrateTechnicalAudit } from "@/lib/technical-audit/orchestrate";

export async function runTechnicalAuditInline(auditId: string, brandId: string): Promise<void> {
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand) {
    console.error(`[tech-audit] Brand ${brandId} not found`);
    return;
  }

  const [org] = await db
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

    const [abnResult, wikiResult, directoryResult] = await Promise.all([
      lookupAbn(null),
      checkWikipediaAu(brand.name),
      checkAuDirectories(brand.name),
    ]);
    const auTldResult = checkAuTld(brand.domain);

    const entityInput = {
      abnVerified: abnResult.abnVerified,
      wikipediaAuPresent: wikiResult.wikipediaAuPresent,
      auTldPresent: auTldResult.auTldPresent,
      auDirectoryCount: directoryResult.auDirectoryCount,
    };
    const entityScoreValue = brandEntityScore(entityInput);

    const result = await orchestrateTechnicalAudit(brand.domain, crawl, entityScoreValue);

    await db.insert(technicalAudits).values({
      brandId,
      organizationId: brand.organizationId,
      auditId,
      scoreRobots: result.dimensions.scoreRobots.toFixed(2),
      scoreLlmsTxt: result.dimensions.scoreLlmsTxt.toFixed(2),
      scoreSchema: result.dimensions.scoreSchema.toFixed(2),
      scoreMeta: result.dimensions.scoreMeta.toFixed(2),
      scoreContent: result.dimensions.scoreContent.toFixed(2),
      scoreBrandEntity: result.dimensions.scoreBrandEntity.toFixed(2),
      scoreSignals: result.dimensions.scoreSignals.toFixed(2),
      scoreAiDiscovery: result.dimensions.scoreAiDiscovery.toFixed(2),
      scoreComposite: result.scoreComposite.toFixed(2),
      findings: Object.assign({}, result.findings, {
        brandEntity: {
          score: entityScoreValue,
          abnVerified: abnResult.abnVerified,
          abnNumber: abnResult.abnNumber,
          wikipediaAuPresent: wikiResult.wikipediaAuPresent,
          wikipediaAuUrl: wikiResult.wikipediaAuUrl,
          auTldPresent: auTldResult.auTldPresent,
          directoryPresence: directoryResult.auDirectoryPresence,
        },
      }),
      crawledAt: crawl.crawledAt,
    });

    await db.insert(brandEntityScores).values({
      brandId,
      abnVerified: abnResult.abnVerified,
      abnNumber: abnResult.abnNumber,
      abnEntityName: abnResult.abnEntityName,
      abnStatus: abnResult.abnStatus,
      wikipediaAuPresent: wikiResult.wikipediaAuPresent,
      wikipediaAuUrl: wikiResult.wikipediaAuUrl,
      wikipediaAuMentions: wikiResult.wikipediaAuMentions,
      auTldDomains: auTldResult.auTldDomains,
      auDirectoryPresence: directoryResult.auDirectoryPresence,
      scoreOf10: entityScoreValue.toFixed(2),
    });

    console.log(`[tech-audit] Complete for ${brand.domain}: composite=${result.scoreComposite}`);
  } catch (err) {
    console.error(
      `[tech-audit] Failed for ${brand.domain}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
