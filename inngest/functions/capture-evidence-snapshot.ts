import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { captureEvidenceSnapshots } from "@/lib/trust/evidence-archiver";

export const captureEvidenceSnapshot = inngest.createFunction(
  {
    id: "capture-evidence-snapshot",
    retries: 2,
    triggers: [{ event: "audit/complete" }],
  },
  async ({ event, step }: { event: { data: { auditId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { auditId, brandId, organizationId } = event.data;

    const tier = await step.run("check-tier", async () => {
      const [sub] = await serviceDb
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, organizationId))
        .limit(1);
      return sub?.tier ?? "free";
    });

    if (tier !== "agency" && tier !== "agency_pro" && tier !== "enterprise") {
      return { skipped: true, reason: "Agency+ tier required" };
    }

    const result = await step.run("capture", async () => {
      return captureEvidenceSnapshots(serviceDb, auditId, brandId, organizationId);
    });

    return { captured: result.snapshotCount };
  },
);
