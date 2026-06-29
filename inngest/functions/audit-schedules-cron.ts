import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditSchedules } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
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
            lte(auditSchedules.nextRunAt, new Date()),
          ),
        );
    });

    for (const schedule of dueSchedules) {
      const auditId = await step.run(
        `process-${schedule.id}`,
        async () => {
          const allowed = await checkQuota(
            schedule.organizationId,
            schedule.brandId,
          );
          if (!allowed) {
            await db
              .update(auditSchedules)
              .set({
                status: "quota_exceeded",
                pausedReason: "Monthly audit quota reached",
                updatedAt: new Date(),
              })
              .where(eq(auditSchedules.id, schedule.id));
            return null;
          }

          const { id } = await db.transaction(async (tx) => {
            const num = await getNextAuditNumber(
              schedule.organizationId,
              tx,
            );
            const [inserted] = await tx
              .insert(audits)
              .values({
                brandId: schedule.brandId,
                organizationId: schedule.organizationId,
                auditNumber: num,
                triggeredBy: "schedule",
                status: "pending",
                metadata: { scheduleId: schedule.id },
              })
              .returning({ id: audits.id });
            return inserted;
          });

          return id;
        },
      );

      if (!auditId) continue;

      await step.run(`run-audit-${schedule.id}`, async () => {
        await runAuditInline(auditId);
      });

      await step.run(`update-schedule-${schedule.id}`, async () => {
        const nextRun = calculateNextRun(schedule.frequency, new Date());
        await db
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
