import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  actionItems,
  audits,
  brands,
  citations,
  driftAlerts,
  engineCallFailures,
  organizations,
  rateLimitCounters,
} from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

const SAMPLE_ORG_SLUG = "__sample__";

/**
 * Audit reliability, Part C, item 7 -- found 21 Oct: this job used to
 * hard-delete a `__sample__` brand straight after its audits, but
 * action_items (and sometimes drift_alerts) still reference that
 * brand with NO ACTION foreign keys, so the delete threw
 * action_items_brand_id_brands_id_fk for any sample that had produced
 * a recommendation -- sample brands and their data built up forever,
 * silently (the thrown error was never logged anywhere).
 *
 * Fixed by deleting every child row first, in dependency order,
 * inside one transaction per brand. The table list below is derived
 * from what lib/audit/run-audit-inline.ts (the only code path that
 * ever writes data for a `__sample__` brand -- confirmed by grepping
 * that file's own .insert() call sites, not assumed from memory) and
 * the schema's own foreign keys actually produce:
 *   - action_items.brand_id / .audit_id -> brands(id) / audits(id), NO ACTION
 *   - drift_alerts.brand_id / .current_audit_id / .previous_audit_id -> NO ACTION
 *   - engine_call_failures.audit_id -> audits(id), NO ACTION (added by
 *     Part A of this same task -- this cleanup job was never updated
 *     for it, which is exactly the kind of drift this fix closes)
 *   - citations.audit_id -> audits(id) ON DELETE CASCADE already, but
 *     deleted explicitly anyway so the dependency order here is
 *     correct and complete on its own, never relying on a cascade a
 *     future migration could silently remove.
 * tests/unit/inngest/sample-audit-cleanup-table-list.test.ts statically
 * cross-checks this list against run-audit-inline.ts's own insert
 * sites, so a future table added there without updating this job
 * fails that test instead of building up another silent backlog.
 */
export const sampleAuditCleanup = inngest.createFunction(
  { id: "sample-audit-cleanup", triggers: [{ cron: "0 3 * * *" }] },
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Task #46 (17th follow-up): rate_limit_counters has no native TTL --
    // a daily delete here is cheap for a table this small/low-write, and
    // this cron already runs once a day for the sample-audit domain this
    // counter is scoped to. A 2-day cutoff (vs the 24h window itself)
    // leaves a day of slack so a counter row is never deleted mid-window.
    const rateLimitCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const deletedCounters = await serviceDb
      .delete(rateLimitCounters)
      .where(lt(rateLimitCounters.windowStart, rateLimitCutoff))
      .returning({ id: rateLimitCounters.id });

    // Scoped hard to the __sample__ org by id, looked up once here --
    // every query below filters through THIS id (or through an audit/
    // brand row already confirmed to belong to it), never through a
    // brand or audit id alone. tests/integration/sample-audit-cleanup.
    // integration.test.ts proves a real org's brand, even one with the
    // exact same child-row shape, is never touched.
    const [sampleOrg] = await serviceDb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, SAMPLE_ORG_SLUG));

    if (!sampleOrg) {
      return { deletedBrands: 0, deletedRateLimitCounters: deletedCounters.length, failedBrands: 0 };
    }

    const oldAudits = await serviceDb
      .select({ id: audits.id, brandId: audits.brandId })
      .from(audits)
      .where(and(eq(audits.organizationId, sampleOrg.id), lt(audits.createdAt, cutoff)));

    if (oldAudits.length === 0) {
      return { deletedBrands: 0, deletedRateLimitCounters: deletedCounters.length, failedBrands: 0 };
    }

    const oldAuditIdsByBrand = new Map<string, string[]>();
    for (const a of oldAudits) {
      const list = oldAuditIdsByBrand.get(a.brandId);
      if (list) list.push(a.id);
      else oldAuditIdsByBrand.set(a.brandId, [a.id]);
    }

    let deletedBrands = 0;
    let failedBrands = 0;

    for (const [brandId, auditIds] of oldAuditIdsByBrand) {
      try {
        await serviceDb.transaction(async (tx) => {
          // Re-confirm, inside the transaction, that this brand really
          // belongs to the sample org before deleting anything through
          // it -- the same belt-and-suspenders defence app/api/sample-
          // audit/[auditId]/status/route.ts already uses, not the only
          // defence (every query below also only ever touches rows via
          // auditIds/brandId already derived from the sampleOrg-scoped
          // query above).
          const [brand] = await tx
            .select({ id: brands.id, organizationId: brands.organizationId })
            .from(brands)
            .where(eq(brands.id, brandId));
          if (!brand || brand.organizationId !== sampleOrg.id) {
            throw new Error(
              `sample-audit-cleanup: brand ${brandId} is not a __sample__-org brand -- refusing to delete`,
            );
          }

          await tx.delete(actionItems).where(inArray(actionItems.auditId, auditIds));
          await tx.delete(driftAlerts).where(inArray(driftAlerts.currentAuditId, auditIds));
          await tx.delete(driftAlerts).where(inArray(driftAlerts.previousAuditId, auditIds));
          await tx.delete(engineCallFailures).where(inArray(engineCallFailures.auditId, auditIds));
          await tx.delete(citations).where(inArray(citations.auditId, auditIds));
          await tx.delete(audits).where(inArray(audits.id, auditIds));

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
        // Part C, item 7: "make the job log its failures. It mustn't
        // keep failing silently" -- this is the exact fix for the FK
        // throw that used to abort the whole function with nothing
        // written to any log. A failed brand is skipped (its rows stay
        // in next night's backlog -- diag-0092 reports it), never
        // retried in a loop that could re-throw and take every other
        // brand in this run down with it.
        failedBrands++;
        console.error(`[sample-audit-cleanup] brand ${brandId} failed:`, err);
      }
    }

    return {
      deletedBrands,
      deletedRateLimitCounters: deletedCounters.length,
      failedBrands,
    };
  },
);
