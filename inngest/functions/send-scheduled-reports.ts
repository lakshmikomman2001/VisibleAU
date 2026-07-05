import { and, eq, isNotNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  brands,
  generatedReports,
  reportDeliverySchedules,
} from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { resend } from "@/lib/email/client";
import { buildScheduledReportHtml } from "@/lib/email/templates/scheduled-report";

export const sendScheduledReports = inngest.createFunction(
  { id: "send-scheduled-reports", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }: { step: any }) => {
    const now = new Date();
    const currentHour = `${now.getUTCHours().toString().padStart(2, "0")}:00`;
    const dayOfWeek = now.getUTCDay();
    const dayOfMonth = now.getUTCDate();

    const dueSchedules = await step.run("find-due-schedules", async () => {
      const allActive = await serviceDb
        .select()
        .from(reportDeliverySchedules)
        .where(eq(reportDeliverySchedules.isActive, true));

      return allActive.filter((s) => {
        if (s.timeOfDay !== currentHour) return false;
        if (s.frequency === "weekly" && s.dayOfWeek === dayOfWeek) return true;
        if (s.frequency === "monthly" && s.dayOfMonth === dayOfMonth)
          return true;
        return false;
      });
    });

    let sent = 0;
    for (const schedule of dueSchedules) {
      await step.run(`send-${schedule.id}`, async () => {
        const brandFilter = schedule.brandId
          ? eq(brands.id, schedule.brandId)
          : eq(brands.organizationId, schedule.organizationId);

        const brandRows = await serviceDb
          .select({ id: brands.id, name: brands.name })
          .from(brands)
          .where(brandFilter);

        for (const brand of brandRows) {
          const [latestReport] = await serviceDb
            .select()
            .from(generatedReports)
            .where(
              and(
                eq(generatedReports.brandId, brand.id),
                isNotNull(generatedReports.pdfUrl),
              ),
            )
            .orderBy(generatedReports.createdAt)
            .limit(1);

          if (!latestReport) continue;

          const recipients = (schedule.recipientEmails as string[]) ?? [];
          const subject =
            schedule.frequency === "monthly"
              ? `${brand.name} AI Visibility Report — ${latestReport.periodLabel ?? "Report"}`
              : `${brand.name} AI Visibility Update — Week of ${latestReport.periodLabel ?? "Report"}`;

          const html = buildScheduledReportHtml({
            brandName: brand.name,
            periodLabel: latestReport.periodLabel ?? "",
            compositeScore: 0,
            scoreDelta: 0,
            topWin: (() => {
              const w = (latestReport.keyWins as Array<{ dimension: string; scoreDelta: number }> | null)?.[0];
              return w ? { dimension: w.dimension, delta: w.scoreDelta } : { dimension: "—", delta: 0 };
            })(),
            topGap: (() => {
              const g = (latestReport.keyGaps as Array<{ dimension: string; score: number }> | null)?.[0];
              return g ? { dimension: g.dimension, score: g.score } : { dimension: "—", score: 0 };
            })(),
            pdfUrl: latestReport.pdfUrl,
            unsubscribeUrl: `/api/organizations/${schedule.organizationId}/delivery-schedules?deactivate=${schedule.id}`,
          });

          for (const email of recipients) {
            await resend.emails.send({
              from: "noreply@visibleau.com",
              to: email,
              subject,
              html,
            });
          }

          await serviceDb
            .update(generatedReports)
            .set({ emailSentAt: new Date(), updatedAt: new Date() })
            .where(eq(generatedReports.id, latestReport.id));

          sent++;
        }

        await serviceDb
          .update(reportDeliverySchedules)
          .set({ lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(reportDeliverySchedules.id, schedule.id));
      });
    }

    return { dueSchedules: dueSchedules.length, sent };
  },
);
