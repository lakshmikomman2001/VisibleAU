import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  actionItems,
  audits,
  brandConsensusChecks,
  brands,
  brandWebMentions,
  citations,
  driftAlerts,
  engineCallFailures,
  linkedinPresenceAudits,
  organizations,
  youtubePresenceAudits,
} from "@/db/schema";
import { SAMPLE_AUDIT_RETENTION_HOURS } from "@/lib/governance/residency-config";
import { SAMPLE_ORG_SLUG } from "./sample-org-slug";

const HOUR_MS = 60 * 60 * 1000;

/**
 * 20 Nov (Sri's decision, part 9): the free sample's data -- the visitor's website address and suburb (the brand row),
 * its audit, the questions and answers -- is deleted SAMPLE_AUDIT_RETENTION_HOURS (24) after the brand was made, brand
 * row included, by the daily clean-up (inngest/functions/sample-audit-cleanup.ts, 03:00 UTC) and again by the weekly
 * retention job (inngest/functions/audit-data-retention.ts, Sundays 04:00 UTC) as a backstop. 24 hours, not 30 days:
 * the result page is the only thing that reads it, and it's read straight away; nothing else needs a visitor's domain.
 *
 * It used to find a sample brand only through an audit older than the cutoff, and deleted the brand only when no audit
 * was left. Two ways a brand stayed for ever (production's "galahplumbing.com.au" from 1 Oct is one):
 * - a brand-walking cron wrote a row that references it with a NO ACTION foreign key -- the monthly YouTube check
 *   (youtube_presence_audits), and the web-mentions, LinkedIn and consensus checks when they're switched on -- so the
 *   brand's delete threw and its whole transaction rolled back, every night. Those rows are deleted first now, and the
 *   crons no longer walk the sample workspace (db/open-workspace.ts inOpenWorkspace);
 * - its audit was never written (the brand is inserted before the audit, lib/sample-audit/run.ts), so no audit led to it.
 *   Every sample brand past the cutoff is found by its own creation time now.
 */
export async function deleteExpiredSampleData(
  now: Date = new Date(),
): Promise<{ deletedBrands: number; failedBrands: number }> {
  const cutoff = new Date(now.getTime() - SAMPLE_AUDIT_RETENTION_HOURS * HOUR_MS);

  // Scoped hard to the __sample__ org by id, looked up once here -- every query below filters through THIS id (or
  // through a brand row already confirmed to belong to it), never through a brand or audit id alone.
  // tests/integration/sample-audit-cleanup.integration.test.ts proves a real org's brand, even one with the exact same
  // child-row shape, is never touched.
  const [sampleOrg] = await serviceDb
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, SAMPLE_ORG_SLUG));
  if (!sampleOrg) return { deletedBrands: 0, failedBrands: 0 };

  // A brand made before the cutoff (whether or not its audit was ever written), or one with an audit from before it.
  const expired = await serviceDb
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(
        eq(brands.organizationId, sampleOrg.id),
        or(
          lt(brands.createdAt, cutoff),
          sql`EXISTS (SELECT 1 FROM ${audits} WHERE ${audits.brandId} = ${brands.id} AND ${audits.createdAt} < ${cutoff.toISOString()}::timestamptz)`,
        ),
      ),
    );

  let deletedBrands = 0;
  let failedBrands = 0;
  for (const { id: brandId } of expired) {
    try {
      await serviceDb.transaction(async (tx) => {
        // Re-confirm, inside the transaction, that this brand really belongs to the sample org before deleting
        // anything through it (the same defence app/api/sample-audit/[auditId]/status/route.ts uses).
        const [brand] = await tx
          .select({ id: brands.id, organizationId: brands.organizationId })
          .from(brands)
          .where(eq(brands.id, brandId));
        if (!brand || brand.organizationId !== sampleOrg.id) {
          throw new Error(
            `sample-audit-cleanup: brand ${brandId} is not a __sample__-org brand; refusing to delete`,
          );
        }

        const auditIds = (
          await tx.select({ id: audits.id }).from(audits).where(eq(audits.brandId, brandId))
        ).map((a) => a.id);

        // What a brand-walking cron may have written for it (NO ACTION foreign keys to brands).
        await tx.delete(youtubePresenceAudits).where(eq(youtubePresenceAudits.brandId, brandId));
        await tx.delete(brandWebMentions).where(eq(brandWebMentions.brandId, brandId));
        await tx.delete(linkedinPresenceAudits).where(eq(linkedinPresenceAudits.brandId, brandId));
        await tx.delete(brandConsensusChecks).where(eq(brandConsensusChecks.brandId, brandId));

        // What lib/audit/run-audit-inline.ts writes for an audit (tests/unit/inngest/sample-audit-cleanup-table-list
        // checks this list against it), children before audits.
        await tx.delete(actionItems).where(eq(actionItems.brandId, brandId));
        await tx.delete(driftAlerts).where(eq(driftAlerts.brandId, brandId));
        if (auditIds.length > 0) {
          await tx.delete(driftAlerts).where(inArray(driftAlerts.currentAuditId, auditIds));
          await tx.delete(driftAlerts).where(inArray(driftAlerts.previousAuditId, auditIds));
          await tx.delete(engineCallFailures).where(inArray(engineCallFailures.auditId, auditIds));
          await tx.delete(citations).where(inArray(citations.auditId, auditIds));
          await tx.delete(audits).where(inArray(audits.id, auditIds));
        }

        const [remaining] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(audits)
          .where(eq(audits.brandId, brandId));
        if (remaining && Number(remaining.c) === 0) {
          await tx.delete(brands).where(eq(brands.id, brandId));
          deletedBrands++;
        }
      });
    } catch (err) {
      // A failed brand is skipped (its rows stay for the next run), never retried in a loop that could take every
      // other brand in this run down with it -- and it's logged, never silent.
      failedBrands++;
      console.error(`[sample-audit-cleanup] brand ${brandId} failed:`, err);
    }
  }
  return { deletedBrands, failedBrands };
}
