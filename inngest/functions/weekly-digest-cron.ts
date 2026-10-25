import { and, eq, gte, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, notificationPreferences, reportDeliverySchedules } from "@/db/schema";
import { sendDigestEmail } from "@/lib/digest/send";
import { weeklyDigestEmail } from "@/lib/email/templates/weekly-digest";
import { inngest } from "@/lib/inngest/client";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export const weeklyDigestCron = inngest.createFunction(
  { id: "weekly-digest-cron", triggers: [{ cron: "0 23 * * 1" }] },
  async ({ step }) => {
    const prefs = await step.run("load-opted-in", async () =>
      serviceDb
        .select({
          organizationId: notificationPreferences.organizationId,
          digestEmail: notificationPreferences.digestEmail,
        })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.weeklyDigest, true)),
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
            activeWeeklySchedules.map((s) => s.brandId).filter((id): id is string => id !== null),
          );
          const hasOrgWideSchedule = activeWeeklySchedules.some((s) => s.brandId === null);
          if (hasOrgWideSchedule) return;

          const weeklyAudits = await tx
            .select({
              auditId: audits.id,
              brandId: brands.id,
              brandName: brands.name,
            })
            .from(audits)
            .innerJoin(brands, eq(audits.brandId, brands.id))
            .where(
              and(
                eq(brands.organizationId, pref.organizationId),
                gte(audits.createdAt, sql`NOW() - INTERVAL '7 days'`),
              ),
            );
          const filteredAudits = weeklyAudits.filter((a) => !skipBrandIds.has(a.brandId));
          if (!filteredAudits.length) return;

          // Task #46 (fix: stored value contradicting its own CI): one org's
          // audits from the last 7 days -- small and bounded (cron, not a
          // request path), so recompute live rather than trust the stored
          // snapshot (see lib/scoring/resolve-audit-dimensions.ts's doc
          // comment for the root cause).
          const resolvedByAuditId = await resolveOrganicDimensions(
            tx,
            filteredAudits.map((a) => a.auditId),
          );
          const digestAudits = filteredAudits.map((a) => {
            const resolved = resolvedByAuditId.get(a.auditId);
            // Vunnara (19 Oct): the headline is the Frequency mention rate
            // alone, never a weighted blend. insufficient_data (zero
            // successful organic answers) -> null, rendered as "no
            // successful answers yet", never a fabricated 0%.
            const mentionRate =
              resolved?.headline.status === "scored" ? resolved.headline.value : null;
            return {
              brandName: a.brandName,
              mentionRate,
              mentionedCount: resolved?.mentionedCount,
              sampleCount: resolved?.sampleCount,
            };
          });
          const email = weeklyDigestEmail({
            date: new Date(),
            organizationId: pref.organizationId,
            brands: digestAudits,
          });
          await sendDigestEmail(pref.digestEmail, email, pref.organizationId);
        });
      });
    }
  },
);
