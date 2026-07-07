import { serviceDb } from "@/db/client";
import { inngest } from "@/lib/inngest/client";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

export const buildCitationSourceIntelligenceFn = inngest.createFunction(
  {
    id: "build-citation-source-intelligence",
    retries: 2,
    triggers: [{ event: "citations/classified" }],
  },
  async ({ event, step }: { event: { data: { auditId: string; brandId: string; organizationId: string } }; step: any }) => {
    const { auditId, brandId, organizationId } = event.data;

    const results = await step.run("build", async () => {
      return buildCitationSourceIntelligence(serviceDb, auditId, brandId, organizationId);
    });

    return { sourceTypes: results.length };
  },
);
