import { serviceDb } from "@/db/client";
import { inngest } from "@/lib/inngest/client";
import { refreshEntityScore } from "@/lib/trust/entity-checker";

export const refreshEntityScoreFn = inngest.createFunction(
  {
    id: "refresh-entity-score",
    retries: 2,
    triggers: [{ event: "technical-audit/complete" }],
  },
  async ({ event, step }: { event: { data: { brandId: string; orgId: string; auditId: string } }; step: any }) => {
    const { brandId, orgId } = event.data;

    const result = await step.run("refresh", async () => {
      return refreshEntityScore(serviceDb, brandId, orgId, "AU_EN");
    });

    return result;
  },
);
