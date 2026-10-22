import { serviceDb } from "@/db/client";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { buildCitationSourceIntelligence } from "@/lib/trust/citation-intelligence";

export const buildCitationSourceIntelligenceFn = inngest.createFunction(
  {
    id: "build-citation-source-intelligence",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "citations/classified" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId: string; organizationId: string } };
    step: any;
  }) => {
    const { auditId, brandId, organizationId } = event.data;

    const results = await step.run("build", async () => {
      return buildCitationSourceIntelligence(serviceDb, auditId, brandId, organizationId);
    });

    return { sourceTypes: results.length };
  },
);
