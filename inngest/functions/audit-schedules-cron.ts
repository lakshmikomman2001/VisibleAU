import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { auditSchedules } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { calculateNextRun } from "@/lib/scheduling/calculate-next-run";
import { checkQuota } from "@/lib/scheduling/quota-check";

export const auditSchedulesCron = inngest.createFunction(
  { id: "audit-schedules-cron", triggers: [{ cron: "0 2 * * *" }] },
  async ({ step }: { step: any }) => {
    const dueSchedules = await step.run("load-due", async () => {
      return db
        .select({
          id: auditSchedules.id,
          brandId: auditSchedules.brandId,
          organizationId: auditSchedules.organizationId,
          frequency: auditSchedules.frequency,
        })
        .from(auditSchedules)
        .where(
          and(
            eq(auditSchedules.status, "active"),
            lte(auditSchedules.nextRunAt, new Date())
          )
        );
    });

    for (const schedule of dueSchedules) {
      await step.run(`process-${schedule.id}`, async () => {
        const allowed = await checkQuota(schedule.organizationId, schedule.brandId);
        if (!allowed) {
          await db
            .update(auditSchedules)
            .set({
              status: "quota_exceeded",
              pausedReason: "Monthly audit quota reached",
              updatedAt: new Date(),
            })
            .where(eq(auditSchedules.id, schedule.id));
          return;
        }
        await inngest.send({
          name: "audit/start",
          data: {
            brandId: schedule.brandId,
            organizationId: schedule.organizationId,
            triggeredBy: "schedule",
          },
        });
        const nextRun = calculateNextRun(schedule.frequency, new Date());
        await db
          .update(auditSchedules)
          .set({ lastRunAt: new Date(), nextRunAt: nextRun, updatedAt: new Date() })
          .where(eq(auditSchedules.id, schedule.id));
      });
    }
  }
);
