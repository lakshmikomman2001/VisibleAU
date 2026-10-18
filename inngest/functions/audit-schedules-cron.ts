import { and, eq, lte } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { auditSchedules, audits, brands } from "@/db/schema";
import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { sendScheduleNeedsConfirmationAlert } from "@/lib/communication/alert-composer";
import { inngest } from "@/lib/inngest/client";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { calculateNextRun } from "@/lib/scheduling/calculate-next-run";
import { checkQuota } from "@/lib/scheduling/quota-check";

export const auditSchedulesCron = inngest.createFunction(
  { id: "audit-schedules-cron", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }: { step: any }) => {
    const dueSchedules = await step.run("load-due", async () => {
      return serviceDb
        .select({
          id: auditSchedules.id,
          brandId: auditSchedules.brandId,
          organizationId: auditSchedules.organizationId,
          frequency: auditSchedules.frequency,
        })
        .from(auditSchedules)
        .where(and(eq(auditSchedules.status, "active"), lte(auditSchedules.nextRunAt, new Date())));
    });

    for (const schedule of dueSchedules) {
      const auditId = await step.run(`process-${schedule.id}`, async () => {
        const allowed = await checkQuota(schedule.organizationId, schedule.brandId);
        if (!allowed) {
          await serviceDb
            .update(auditSchedules)
            .set({
              status: "quota_exceeded",
              pausedReason: "Monthly audit quota reached",
              updatedAt: new Date(),
            })
            .where(eq(auditSchedules.id, schedule.id));
          return null;
        }

        // Build 1 follow-up (entry-point check): checked BEFORE
        // inserting an audit row at all -- every existing brand starts
        // needing confirmation after this push, and without this
        // check the cron would otherwise create a new "failed" audit
        // for this brand every single night, forever, with no visible
        // reason and no way for the schedule to ever resume on its
        // own. Mirrors the quota_exceeded pattern immediately above:
        // pause the schedule (excluding it from this same WHERE
        // status = 'active' query on every future run, so this branch
        // -- and its one notification -- only fires on the transition
        // INTO this state, never once per missed night).
        const [brand] = await serviceDb
          .select()
          .from(brands)
          .where(eq(brands.id, schedule.brandId));
        if (
          !brand ||
          !brandReadyForAudit({
            classificationStatus: brand.classificationStatus,
            classification: brand.classification,
            categoryConfirmedAt: brand.categoryConfirmedAt,
            locationMode: brand.locationMode,
          })
        ) {
          await serviceDb
            .update(auditSchedules)
            .set({
              status: "needs_confirmation",
              pausedReason: "Confirm your business details to resume scheduled audits",
              updatedAt: new Date(),
            })
            .where(eq(auditSchedules.id, schedule.id));
          if (brand) {
            await sendScheduleNeedsConfirmationAlert({
              organizationId: schedule.organizationId,
              brandName: brand.name,
              confirmUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/brands/${schedule.brandId}#confirm-business-details`,
            }).catch((err) =>
              console.error("[audit-schedules-cron] notification send failed (non-fatal):", err),
            );
          }
          return null;
        }

        const { id } = await serviceDb.transaction(async (tx) => {
          const num = await getNextAuditNumber(schedule.organizationId, tx);
          const promptPackVersion = await getBrandPromptPackVersion(schedule.brandId, tx);
          const [inserted] = await tx
            .insert(audits)
            .values({
              brandId: schedule.brandId,
              organizationId: schedule.organizationId,
              auditNumber: num,
              triggeredBy: "schedule",
              status: "pending",
              metadata: { scheduleId: schedule.id },
              promptPackVersion,
              methodologyVersion: METHODOLOGY_VERSION,
            })
            .returning({ id: audits.id });
          return inserted;
        });

        return id;
      });

      if (!auditId) continue;

      await step.run(`run-audit-${schedule.id}`, async () => {
        await runAuditInline(auditId);
      });

      await step.run(`update-schedule-${schedule.id}`, async () => {
        const nextRun = calculateNextRun(schedule.frequency, new Date());
        await serviceDb
          .update(auditSchedules)
          .set({
            lastRunAt: new Date(),
            nextRunAt: nextRun,
            updatedAt: new Date(),
          })
          .where(eq(auditSchedules.id, schedule.id));
      });
    }
  },
);
