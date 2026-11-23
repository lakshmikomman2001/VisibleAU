import { eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands } from "@/db/schema";
import { lookupAbn } from "./abn-lookup";
import { checkAuTld } from "./au-tld-signal";
import { brandEntityScore } from "./score";
import { checkWikipediaAuStatus } from "./wikipedia-au";

/**
 * S01 part 11 (LLD 8.8.6, amendment 25): the existing entity check on its own -- the same lookups the technical audit
 * runs for Brand & Entity (lib/audit/run-technical-audit-inline.ts): the ABR with the GUID (abn-lookup.ts), Wikipedia
 * (AU) and the .au domain -- stored as a brand_entity_scores row, which the identity tile and Brand & Entity read.
 * Queued (after()) when a brand's ABN is saved or a suggested ABN is confirmed, so the register is checked now rather
 * than at the next audit. Runs under the workspace's RLS context; never throws (a failure is logged for operators).
 */
export async function runBrandEntityCheck(organizationId: string, brandId: string): Promise<void> {
  try {
    await withRlsContext(organizationId, async (tx) => {
      const [brand] = await tx
        .select({ name: brands.name, domain: brands.domain, abn: brands.abn })
        .from(brands)
        .where(eq(brands.id, brandId));
      if (!brand) return;
      const [abnResult, wikiStatus] = await Promise.all([
        lookupAbn(brand.abn),
        checkWikipediaAuStatus(brand.name),
      ]);
      const wiki =
        wikiStatus.status === "found"
          ? { present: true, url: wikiStatus.url, mentions: wikiStatus.mentions }
          : { present: false, url: null, mentions: 0 };
      const auTld = checkAuTld(brand.domain);
      const score = brandEntityScore({
        abnVerified: abnResult.abnVerified,
        wikipediaAuPresent: wiki.present,
        auTldPresent: auTld.auTldPresent,
      });
      await tx.insert(brandEntityScores).values({
        brandId,
        organizationId,
        abnVerified: abnResult.abnVerified,
        abnNumber: abnResult.abnNumber,
        abnEntityName: abnResult.abnEntityName,
        abnStatus: abnResult.abnStatus,
        wikipediaAuPresent: wiki.present,
        wikipediaAuUrl: wiki.url,
        wikipediaAuMentions: wiki.mentions,
        auTldDomains: auTld.auTldDomains,
        scoreOf10: score.toFixed(2),
      });
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "brand_entity_check_failed",
        brandId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
