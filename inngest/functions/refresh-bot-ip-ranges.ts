import { refreshAllIpRanges } from "@/lib/agent-analytics/ip-ranges";
import { inngest } from "@/lib/inngest/client";

export const refreshBotIpRangesFn = inngest.createFunction(
  {
    id: "refresh-bot-ip-ranges",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }: { step: any }) => {
    const results = await step.run("refresh-all-vendors", async () => {
      return refreshAllIpRanges();
    });

    return {
      status: "complete",
      results,
    };
  },
);
