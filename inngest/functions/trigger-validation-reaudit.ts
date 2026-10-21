import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, remediationTasks } from "@/db/schema";
import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { inngest } from "@/lib/inngest/client";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { checkQuota } from "@/lib/scheduling/quota-check";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import { markReauditDeferred } from "@/lib/workflow/task-manager";
import {
  recordReauditInsufficientData,
  recordReauditResults,
} from "@/lib/workflow/validation-scheduler";

export const triggerValidationReaudit = inngest.createFunction(
  {
    id: "trigger-validation-reaudit",
    triggers: [{ event: "task/completed" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        taskId: string;
        brandId: string;
        orgId: string;
      };
    };
    step: {
      sleep: (id: string, duration: string) => Promise<void>;
      run: <T>(id: string, fn: () => Promise<T>) => Promise<T>;
    };
  }) => {
    const { taskId, brandId, orgId } = event.data;

    await step.sleep("wait-14-days", "14 days");

    const allowed = await checkQuota(orgId, brandId);

    if (!allowed) {
      await markReauditDeferred(taskId, "quota_exceeded", serviceDb);
      return { deferred: true, reason: "quota_exceeded" };
    }

    // Build 1 follow-up (entry-point check): checked BEFORE creating
    // the re-audit row, mirroring the quota check immediately above --
    // every existing brand starts needing confirmation after this
    // push, and without this check this 14-days-later re-audit would
    // create a "failed" audit and wire remediationTasks.reauditId to
    // it, silently breaking the lift-tracking loop this whole function
    // exists for. Deferred, same as a quota block -- Autopilot's own
    // task UI already surfaces a deferred reason to the user.
    const [brand] = await serviceDb.select().from(brands).where(eq(brands.id, brandId));
    if (
      !brand ||
      !brandReadyForAudit({
        classificationStatus: brand.classificationStatus,
        classification: brand.classification,
        categoryConfirmedAt: brand.categoryConfirmedAt,
        categories: brand.categories,
        audience: brand.audience,
        locationMode: brand.locationMode,
      })
    ) {
      await markReauditDeferred(taskId, "needs_confirmation", serviceDb);
      return { deferred: true, reason: "needs_confirmation" };
    }

    // "Make the daily spend cap real", item 2 -- checked BEFORE
    // creating the audit row, same reasoning as the confirmation
    // check above.
    const dailySpend = await BudgetPolicyService.checkDailySpend(orgId);
    if (!dailySpend.allowed) {
      await markReauditDeferred(taskId, "daily_spend_cap_exceeded", serviceDb);
      return { deferred: true, reason: "daily_spend_cap_exceeded" };
    }

    const auditId = await step.run("create-reaudit-audit", async () => {
      const { id } = await serviceDb.transaction(async (tx) => {
        const num = await getNextAuditNumber(orgId, tx);
        const promptPackVersion = await getBrandPromptPackVersion(brandId, tx);
        const [inserted] = await tx
          .insert(audits)
          .values({
            brandId,
            organizationId: orgId,
            auditNumber: num,
            triggeredBy: "reaudit",
            status: "pending",
            metadata: { reauditTaskId: taskId },
            promptPackVersion,
            methodologyVersion: METHODOLOGY_VERSION,
          })
          .returning({ id: audits.id });
        return inserted;
      });

      await serviceDb
        .update(remediationTasks)
        .set({ reauditId: id, updatedAt: new Date() })
        .where(eq(remediationTasks.id, taskId));

      return id;
    });

    await step.run("run-reaudit", async () => {
      await runAuditInline(auditId);
    });

    await step.run("record-lift", async () => {
      const [audit] = await serviceDb
        .select({ scoreComposite: audits.scoreComposite })
        .from(audits)
        .where(eq(audits.id, auditId));

      if (audit?.scoreComposite == null) return;

      // Task #46 (fix: stored value contradicting its own CI): one call
      // now both gates on the real mention count AND supplies the honest
      // "after" score -- the old code's `audit.scoreComposite` was the
      // STORED column (a snapshot from whenever the re-audit completed,
      // never recomputed), while the separate mention-count query below
      // it only gated on/off recording at all; it never corrected the
      // VALUE recorded as scoreAfter. recordReauditResults now gets the
      // same live-recomputed composite the audit page itself would show
      // for this re-audit, not a value that could silently go stale.
      //
      // Vunnara (19 Oct): the "after" score is now the headline (the
      // Frequency mention rate alone, never a weighted blend). The
      // stored scoreComposite read above is only an "audit produced a
      // score at all" gate, never the value recorded.
      const { headline, mentionedCount } = await resolveAuditDimensionsAndHeadline(
        serviceDb,
        auditId,
      );

      // mentionedCount > 0 implies real answers, so headline is "scored"
      // whenever we get past the first check -- the status check is the
      // type narrowing (and a guard against no_answers) not a new rule.
      if (mentionedCount === 0 || headline.status !== "scored") {
        await recordReauditInsufficientData(taskId, auditId);
        return;
      }

      await recordReauditResults(taskId, auditId, headline.value);
    });

    return { deferred: false, auditId };
  },
);
