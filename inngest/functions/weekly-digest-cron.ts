import { and, eq, gte, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, notificationPreferences, reportDeliverySchedules } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { buildDigestHtml } from "@/lib/digest/compose";
import { sendDigestEmail } from "@/lib/digest/send";

export const weeklyDigestCron = inngest.createFunction(
  { id: "weekly-digest-cron", triggers: [{ cron: "0 23 * * 1" }] },
  async ({ step }: { step: any }) => {
    const prefs = await step.run("load-opted-in", async () =>
      serviceDb
        .select({
          organizationId: notificationPreferences.organizationId,
          digestEmail: notificationPreferences.digestEmail,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.weeklyDigest, true))
    );

    for (const pref of prefs) {
      await step.run(`digest-${pref.organizationId}`, async () => {
        await withRlsContext(pref.organizationId, async (tx) => {
          // EM-01 dedup: skip brands that have an active weekly Phase 2 report schedule
          const activeWeeklySchedules = await tx
            .select({ brandId: reportDeliverySchedules.brandId })
            .from(reportDeliverySchedules)
            .where(
              and(
                eq(reportDeliverySchedules.organizationId, pref.organizationId),
                eq(reportDeliverySchedules.frequency, "weekly"),
                eq(reportDeliverySchedules.isActive, true),
              ),
            );
          const skipBrandIds = new Set(
            activeWeeklySchedules
              .map((s) => s.brandId)
              .filter((id): id is string => id !== null),
          );
          const hasOrgWideSchedule = activeWeeklySchedules.some((s) => s.brandId === null);
          if (hasOrgWideSchedule) return;

          const weeklyAudits = await tx
            .select({
              brandId: brands.id,
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
          const filteredAudits = weeklyAudits.filter(
            (a) => !skipBrandIds.has(a.brandId),
          );
          if (!filteredAudits.length) return;
          const html = buildDigestHtml(filteredAudits);
          await sendDigestEmail(pref.digestEmail, html);
        });
      });
    }
  }
);
