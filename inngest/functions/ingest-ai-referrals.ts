import { inngest } from "@/lib/inngest/client";
import { ingestReferrals } from "@/lib/agent-analytics/referral-ingest";
import type { ReferralRecord } from "@/lib/agent-analytics/referral-ingest";

export const ingestAiReferralsFn = inngest.createFunction(
  {
    id: "ingest-ai-referrals",
    name: "Ingest AI Referral Hits",
    concurrency: { limit: 2 },
    triggers: [{ event: "referrals/ingest" }],
  },
  async ({ event, step }) => {
    const { organizationId, brandId, records } = event.data as {
      organizationId: string;
      brandId: string;
      records: ReferralRecord[];
    };

    const result = await step.run("ingest-referral-records", async () => {
      return ingestReferrals(organizationId, brandId, records);
    });

    return {
      status: "complete",
      inserted: result.inserted,
      skipped: result.skipped,
    };
  },
);
