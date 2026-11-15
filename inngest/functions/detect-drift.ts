import { and, desc, eq, ne } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, driftAlerts } from "@/db/schema";
import { fullyFailedEngines } from "@/lib/audit/engine-failure";
import { auditsCountingGoogle } from "@/lib/audit/google-surfaces/summary";
import { auditModels } from "@/lib/audit/model-drift";
import { includedInTrends } from "@/lib/audit/trend-exclusion-sql";
import { driftBaseline } from "@/lib/drift/baseline";
import { buildDriftInput } from "@/lib/drift/build-input";
import { detectDrift } from "@/lib/drift/detect";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";

// 17 Nov, part 3: buildDriftInput lives in lib/drift/build-input.ts (shared with lib/audit/run-audit-inline.ts).
export { buildDriftInput };

export const detectDriftFn = inngest.createFunction(
  {
    id: "detect-drift",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId?: string; organizationId?: string } };
    step: any;
  }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const loaded = await step.run("load-audits", async () => {
      const current = await loadScopedOrAbort({
        fn: "detect-drift",
        entityId: auditId,
        load: async () => (await serviceDb.select().from(audits).where(eq(audits.id, auditId)))[0],
        eventOrganizationId: eventOrgId,
        eventBrandId,
      });
      if (!current) return null;

      const bId = current.brandId;
      const orgId = current.organizationId;

      // URGENT audit #37 (31 Oct), item 2: the comparison base is the
      // latest earlier audit in which every engine answered -- one that
      // lost a whole engine isn't a like-for-like baseline.
      const candidates = await withRlsContext(orgId, async (tx) => {
        return tx
          .select()
          .from(audits)
          .where(
            // 14 Nov, part 5: never against an audit an operator excluded from trends.
            and(
              eq(audits.brandId, bId),
              ne(audits.id, auditId),
              eq(audits.status, "complete"),
              includedInTrends,
            ),
          )
          .orderBy(desc(audits.createdAt))
          .limit(10);
      });
      // "Mention detection" (6 Nov), part 6: and only under the same methodology; methodology v2.2 (7 Nov),
      // part 3: with the same models, and never an audit answered by another model (lib/drift/baseline.ts).
      const models = await withRlsContext(orgId, (tx) =>
        auditModels(tx, [current.id, ...candidates.map((c) => c.id)]),
      );
      // Google AI surfaces (Phase 1): never against an audit that counted Google differently.
      const countsGoogle = await withRlsContext(orgId, (tx) =>
        auditsCountingGoogle(tx, [current.id, ...candidates.map((c) => c.id)]),
      );
      const baseline = driftBaseline(current, candidates, models, countsGoogle);

      return {
        current,
        previous: baseline.previous,
        skipReason: baseline.reason,
        brandId: bId,
        organizationId: orgId,
      };
    });

    if (!loaded) return { skipped: true, reason: "audit_not_found" };
    // URGENT audit #37 (31 Oct), item 2: an audit in which a whole engine
    // failed is never compared with complete ones -- a "drop" would be the
    // missing engine, not the brand. The audit page's banner says so.
    if (fullyFailedEngines(loaded.current).length > 0) {
      return { skipped: true, reason: "engine_total_failure" };
    }
    if (!loaded.previous) {
      return { skipped: true, reason: loaded.skipReason ?? "first_audit_no_comparison" };
    }

    const { current, previous, brandId, organizationId } = loaded;

    const result = await step.run("compute-drift", async () => {
      const driftInput = await withRlsContext(organizationId, (tx) =>
        buildDriftInput(tx, current, previous),
      );
      return detectDrift(driftInput);
    });

    if (!result.hasSignificant) return { skipped: true, reason: "within_noise" };

    await step.run("persist-alert", async () => {
      await withRlsContext(organizationId, async (tx) => {
        await tx.insert(driftAlerts).values({
          organizationId,
          brandId,
          currentAuditId: auditId,
          previousAuditId: previous.id,
          severity: result.compositeSeverity,
          // Task #46 Phase 2, Part 1: result.scoreDelta is real
          // arithmetic (e.g. 0 - 45) but comparing a frequency_only
          // composite to a weighted one isn't like-for-like -- never
          // persist it as if it were an ordinary composite point-delta.
          // This row can still exist (hasSignificant may be true from a
          // genuine per-dimension drift, e.g. Frequency itself really
          // did drop), it just can't carry a numeric composite delta;
          // the UI (drift-alerts-view.tsx) shows "Insufficient data"
          // for a null scoreDelta instead of a number.
          scoreDelta:
            result.compositeBasisMismatch || result.promptPackVersionMismatch
              ? null
              : String(result.scoreDelta),
          dimensionDeltas: result.dimensionDeltas,
        });
      });
    });

    if (result.compositeSeverity !== "within_noise") {
      await inngest.send({
        name: "drift.detected",
        data: { brandId, organizationId, auditId },
      });
    }

    return { severity: result.compositeSeverity, delta: result.scoreDelta };
  },
);
