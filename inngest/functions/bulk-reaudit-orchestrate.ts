import { eq, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, bulkOperations } from "@/db/schema";
import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { checkQuota } from "@/lib/scheduling/quota-check";

export const bulkReauditOrchestrate = inngest.createFunction(
  {
    id: "bulk-reaudit-orchestrate",
    concurrency: { limit: 4, key: "event.data.organizationId" },
    triggers: [{ event: "bulk/reaudit.requested" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        brandIds: string[];
        organizationId: string;
        operationId: string;
      };
    };
    step: any;
  }) => {
    const { brandIds, organizationId: eventOrgId, operationId } = event.data;

    const operation = await step.run("load-operation", async () => {
      return loadScopedOrAbort({
        fn: "bulk-reaudit-orchestrate",
        entityId: operationId,
        load: async () =>
          (
            await serviceDb
              .select({ organizationId: bulkOperations.organizationId })
              .from(bulkOperations)
              .where(eq(bulkOperations.id, operationId))
          )[0],
        eventOrganizationId: eventOrgId,
      });
    });

    if (!operation) {
      return { skipped: true, reason: "operation_not_found_or_scope_mismatch" };
    }

    const organizationId = operation.organizationId;

    await step.run("mark-running", async () => {
      await withRlsContext(organizationId, async (tx) => {
        await tx
          .update(bulkOperations)
          .set({
            status: "running",
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bulkOperations.id, operationId));
      });
    });

    let completed = 0;
    let skipped = 0;
    let failed = 0;

    for (const brandId of brandIds) {
      const auditId = await step.run(`process-${brandId}`, async () => {
        const allowed = await checkQuota(organizationId, brandId);
        if (!allowed) {
          await withRlsContext(organizationId, async (tx) => {
            await tx
              .update(bulkOperations)
              .set({
                failedBrands: sql`${bulkOperations.failedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
          });
          return null;
        }

        // Build 1 follow-up (entry-point check): checked BEFORE
        // creating the audit row, mirroring the quota check above --
        // without this, runAuditInline() would silently fail this
        // audit internally (it never throws) while THIS function's
        // own try/catch below still saw a normal return and counted
        // it as `completed`, reporting a confirmation-blocked brand as
        // a successful bulk re-audit. bulkOperations has no distinct
        // "skipped" column -- failedBrands is the same bucket
        // quota_exceeded already uses for a legitimate non-error skip.
        const [brandRow] = await serviceDb.select().from(brands).where(eq(brands.id, brandId));
        if (
          !brandRow ||
          !brandReadyForAudit({
            classificationStatus: brandRow.classificationStatus,
            classification: brandRow.classification,
            categoryConfirmedAt: brandRow.categoryConfirmedAt,
            categories: brandRow.categories,
            audience: brandRow.audience,
            locationMode: brandRow.locationMode,
          })
        ) {
          await withRlsContext(organizationId, async (tx) => {
            await tx
              .update(bulkOperations)
              .set({
                failedBrands: sql`${bulkOperations.failedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
          });
          return null;
        }

        // "Make the daily spend cap real", item 2 -- checked BEFORE
        // creating the audit row, same reasoning as the confirmation
        // check above (and reusing the same failedBrands bucket -- a
        // legitimate skip, not a real failure). Checked per brand,
        // not once for the whole batch: every brand here shares the
        // same organizationId, so a bulk run that blows through the
        // cap partway through correctly stops creating new audits for
        // the REMAINING brands in this same run, not just future runs.
        const dailySpend = await BudgetPolicyService.checkDailySpend(organizationId);
        if (!dailySpend.allowed) {
          await withRlsContext(organizationId, async (tx) => {
            await tx
              .update(bulkOperations)
              .set({
                failedBrands: sql`${bulkOperations.failedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
          });
          return null;
        }

        const { id } = await serviceDb.transaction(async (tx) => {
          const num = await getNextAuditNumber(organizationId, tx);
          const promptPackVersion = await getBrandPromptPackVersion(brandId, tx);
          const [inserted] = await tx
            .insert(audits)
            .values({
              brandId,
              organizationId,
              auditNumber: num,
              triggeredBy: "bulk_reaudit",
              status: "pending",
              metadata: { bulkOperationId: operationId },
              promptPackVersion,
              methodologyVersion: METHODOLOGY_VERSION,
            })
            .returning({ id: audits.id });
          return inserted;
        });

        return id;
      });

      if (!auditId) {
        skipped++;
        continue;
      }

      try {
        await step.run(`run-audit-${brandId}`, async () => {
          await runAuditInline(auditId);
          await withRlsContext(organizationId, async (tx) => {
            await tx
              .update(bulkOperations)
              .set({
                completedBrands: sql`${bulkOperations.completedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
          });
        });
        completed++;
      } catch {
        await step.run(`fail-audit-${brandId}`, async () => {
          await withRlsContext(organizationId, async (tx) => {
            await tx
              .update(bulkOperations)
              .set({
                failedBrands: sql`${bulkOperations.failedBrands} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(bulkOperations.id, operationId));
          });
        });
        failed++;
      }
    }

    await step.run("mark-complete", async () => {
      await withRlsContext(organizationId, async (tx) => {
        await tx
          .update(bulkOperations)
          .set({
            status: "complete",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bulkOperations.id, operationId));
      });
    });

    return { completed, skipped, failed, total: brandIds.length };
  },
);
