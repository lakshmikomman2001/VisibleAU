import { and, eq, gte, sql } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { audits, brands, notificationPreferences } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { buildDigestHtml } from "@/lib/digest/compose";
import { sendDigestEmail } from "@/lib/digest/send";

export const weeklyDigestCron = inngest.createFunction(
  { id: "weekly-digest-cron", triggers: [{ cron: "0 23 * * 1" }] },
  async ({ step }: { step: any }) => {
    const prefs = await step.run("load-opted-in", async () =>
      db
        .select({
          organizationId: notificationPreferences.organizationId,
          digestEmail: notificationPreferences.digestEmail,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.weeklyDigest, true))
    );

    for (const pref of prefs) {
      await step.run(`digest-${pref.organizationId}`, async () => {
        await setRlsContext(db, pref.organizationId);
        const weeklyAudits = await db
          .select({
            brandName: brands.name,
            scoreComposite: audits.scoreComposite,
          })
          .from(audits)
          .innerJoin(brands, eq(audits.brandId, brands.id))
          .where(
            and(
              eq(brands.organizationId, pref.organizationId),
              gte(audits.createdAt, sql`NOW() - INTERVAL '7 days'`)
            )
          );
        if (!weeklyAudits.length) return;
        const html = buildDigestHtml(weeklyAudits);
        await sendDigestEmail(pref.digestEmail, html);
      });
    }
  }
);
