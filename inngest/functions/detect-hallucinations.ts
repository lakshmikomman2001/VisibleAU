import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { detectHallucinations } from "@/lib/trust/hallucination-detector";
import { sendHallucinationAlert } from "@/lib/communication/alert-composer";

export const detectHallucinationsFn = inngest.createFunction(
  {
    id: "detect-hallucinations",
    retries: 2,
    triggers: [{ event: "audit/complete" }],
  },
  async ({ event, step }: { event: { data: { auditId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { auditId, brandId, organizationId } = event.data;

    const result = await step.run("detect", async () => {
      return detectHallucinations(serviceDb, auditId, brandId, organizationId);
    });

    if (result.criticalCount > 0 || result.warningCount > 0) {
      await step.run("send-alert", async () => {
        const [brand] = await serviceDb
          .select({ name: brands.name })
          .from(brands)
          .where(eq(brands.id, brandId))
          .limit(1);

        const brandName = brand?.name ?? "Unknown Brand";

        await sendHallucinationAlert({
          organizationId,
          brandName,
          engine: "multiple",
          incorrectClaim: `${result.criticalCount} critical, ${result.warningCount} warning hallucinations detected`,
          correctValue: "Review required",
          acknowledgeUrl: `/brands/${brandId}/trust/hallucinations`,
        });
      });

      await step.run("emit-webhook", async () => {
        await inngest.send({
          name: "hallucination/detected",
          data: { organizationId, brandId, incidentCount: result.inserted },
        });
      });
    }

    return { inserted: result.inserted, critical: result.criticalCount, warning: result.warningCount };
  },
);
