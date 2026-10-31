import { and, desc, eq, isNotNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { inOpenWorkspace } from "@/db/open-workspace";
import { audits, brands, generatedReports, reportDeliverySchedules } from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import {
  type ScheduledReportEmailInput,
  scheduledReportEmail,
} from "@/lib/email/templates/scheduled-report";
import { inngest } from "@/lib/inngest/client";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import { getStorage } from "@/lib/storage";

/** How long the emailed PDF download link works. */
const PDF_LINK_DAYS = 7;

export const sendScheduledReports = inngest.createFunction(
  { id: "send-scheduled-reports", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const now = new Date();
    const currentHour = `${now.getUTCHours().toString().padStart(2, "0")}:00`;
    const dayOfWeek = now.getUTCDay();
    const dayOfMonth = now.getUTCDate();

    const dueSchedules = await step.run("find-due-schedules", async () => {
      const allActive = await serviceDb
        .select()
        .from(reportDeliverySchedules)
        .where(
          and(
            eq(reportDeliverySchedules.isActive, true),
            inOpenWorkspace(reportDeliverySchedules.organizationId),
          ),
        );

      return allActive.filter((s) => {
        if (s.timeOfDay !== currentHour) return false;
        if (s.frequency === "weekly" && s.dayOfWeek === dayOfWeek) return true;
        if (s.frequency === "monthly" && s.dayOfMonth === dayOfMonth) return true;
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
          // The newest report with a PDF (this used to take the OLDEST:
          // ascending order, limit 1).
          const [latestReport] = await serviceDb
            .select()
            .from(generatedReports)
            .where(and(eq(generatedReports.brandId, brand.id), isNotNull(generatedReports.pdfUrl)))
            .orderBy(desc(generatedReports.createdAt))
            .limit(1);

          if (!latestReport) continue;

          const recipients = (schedule.recipientEmails as string[]) ?? [];

          // Only real numbers: the headline of the audit the report was
          // built from (it used to send a hard-coded 0.0 score and "+0.0
          // pts"). No audit behind the report, no number.
          let audit: ScheduledReportEmailInput["audit"] = null;
          if (latestReport.auditId) {
            const [row] = await serviceDb
              .select({ auditNumber: audits.auditNumber })
              .from(audits)
              .where(eq(audits.id, latestReport.auditId));
            if (row) {
              const resolved = await resolveAuditDimensionsAndHeadline(
                serviceDb,
                latestReport.auditId,
              );
              audit = {
                auditNumber: row.auditNumber,
                mentionRate: resolved.headline.status === "scored" ? resolved.headline.value : null,
                mentionedCount: resolved.mentionedCount,
                sampleCount: resolved.sampleCount,
              };
            }
          }

          // pdfUrl is a storage path, not a link: sign it (the local
          // driver returns an app path, made absolute here).
          let pdfLink: string | null = null;
          if (latestReport.pdfUrl) {
            try {
              const url = await getStorage().getDownloadUrl(
                latestReport.pdfUrl,
                PDF_LINK_DAYS * 24 * 60 * 60,
              );
              pdfLink = url.startsWith("http") ? url : appUrl(url);
            } catch {
              pdfLink = null;
            }
          }

          const email = scheduledReportEmail({
            brandName: brand.name,
            frequency: schedule.frequency === "monthly" ? "monthly" : "weekly",
            periodLabel: latestReport.periodLabel,
            audit,
            reportUrl: appUrl(`/brands/${brand.id}/reports/${latestReport.id}`),
            pdfUrl: pdfLink,
            pdfLinkDays: PDF_LINK_DAYS,
            // Was a relative API path -- a dead link in an email. The
            // schedules page is where a schedule is switched off.
            schedulesUrl: appUrl(`/organizations/${schedule.organizationId}/delivery-schedules`),
          });

          // A failed send fails this step (so it's retried, and neither
          // emailSentAt nor lastSentAt claims a send that didn't happen);
          // the per-recipient key stops a retry re-sending the ones that
          // already went out.
          for (const to of recipients) {
            await sendEmailOrThrow({
              to,
              ...email,
              category: "scheduled_report",
              organizationId: schedule.organizationId,
              idempotencyKey: idempotencyKeyFor(
                `scheduled-report:${schedule.id}:${latestReport.id}`,
                to,
              ),
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
