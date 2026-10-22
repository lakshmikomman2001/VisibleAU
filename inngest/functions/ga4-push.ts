import { eq } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

export const ga4PushFn = inngest.createFunction(
  { id: "ga4-push", concurrency: POST_AUDIT_POOL, triggers: [{ event: "audit.complete" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId: string; organizationId: string } };
    step: any;
  }) => {
    const { auditId, brandId, organizationId } = event.data;
    await step.run("push-to-ga4", async () => {
      await withRlsContext(organizationId, async (tx) => {
        const [org] = await tx
          .select({
            ga4MeasurementId: organizations.ga4MeasurementId,
            ga4ApiSecret: organizations.ga4ApiSecret,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId));

        if (!org?.ga4MeasurementId || !org?.ga4ApiSecret) return;

        const [audit] = await tx.select().from(audits).where(eq(audits.id, auditId));
        if (!audit) return;

        // Task #46 (fix: stored value contradicting its own CI): single
        // audit, cheap to recompute live rather than trust the stored
        // snapshot (see lib/scoring/resolve-audit-dimensions.ts's doc
        // comment for the root cause).
        // Vunnara (19 Oct): the headline is the Frequency mention rate
        // alone, never a weighted blend. GA4 param name `score_composite`
        // is kept so existing GA4 reports/explorations keep working;
        // `score_basis` tells the property what that number now means.
        // No successful organic answers at all (insufficient_data) -> the
        // score param is omitted rather than sent as a fabricated 0.
        const { headline } = await resolveAuditDimensionsAndHeadline(tx, auditId);

        await fetch(
          `https://www.google-analytics.com/mp/collect?measurement_id=${org.ga4MeasurementId}&api_secret=${org.ga4ApiSecret}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: brandId,
              events: [
                {
                  name: "audit_completed",
                  params: {
                    brand_id: brandId,
                    ...(headline.status === "scored" ? { score_composite: headline.value } : {}),
                    score_basis: "mention_rate",
                    audit_id: auditId,
                    engagement_time_msec: 1,
                  },
                },
              ],
            }),
          },
        );
      });
    });
  },
);
