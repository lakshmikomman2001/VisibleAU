import { eq } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { audits, organizations } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";

export const ga4PushFn = inngest.createFunction(
  { id: "ga4-push", triggers: [{ event: "audit/complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { auditId, brandId, organizationId } = event.data;
    await step.run("push-to-ga4", async () => {
      await setRlsContext(db, organizationId);
      const [org] = await db
        .select({
          ga4MeasurementId: organizations.ga4MeasurementId,
          ga4ApiSecret: organizations.ga4ApiSecret,
        })
        .from(organizations)
        .where(eq(organizations.id, organizationId));

      if (!org?.ga4MeasurementId || !org?.ga4ApiSecret) return;

      const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return;

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
                  score_composite: audit.scoreComposite,
                  audit_id: auditId,
                  engagement_time_msec: 1,
                },
              },
            ],
          }),
        }
      );
    });
  }
);
