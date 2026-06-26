import { lt } from "drizzle-orm";
import { db } from "@/db/client";
import { audits } from "@/db/schema/audits";
import { citations } from "@/db/schema/citations";
import { inngest } from "@/lib/inngest/client";

export const auditDataRetention = inngest.createFunction(
  {
    id: "audit-data-retention",
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 4 * * 0" }],
  },
  async ({ step }) => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);

    const result = await step.run("delete-old-audit-data", async () => {
      const deletedCitations = await db
        .delete(citations)
        .where(lt(citations.createdAt, cutoff))
        .returning({ id: citations.id });

      const deletedAudits = await db
        .delete(audits)
        .where(lt(audits.createdAt, cutoff))
        .returning({ id: audits.id });

      return {
        deletedCitations: deletedCitations.length,
        deletedAudits: deletedAudits.length,
      };
    });

    return result;
  },
);
