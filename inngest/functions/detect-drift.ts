import { and, desc, eq, ne } from "drizzle-orm";
import { type DbClient, serviceDb, withRlsContext } from "@/db/client";
import { audits, driftAlerts } from "@/db/schema";
import { detectDrift } from "@/lib/drift/detect";
import type { CI, DriftInput } from "@/lib/drift/types";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import {
  type DimensionKey,
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
} from "@/lib/scoring/dimension-result";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

type AuditRow = typeof audits.$inferSelect;

/**
 * Task #46 (fix: stored value contradicting its own CI): this audit's
 * own honest dimension/headline read -- mirrors app/(auth)/audits/
 * [auditId]/page.tsx exactly, via the SAME shared function
 * (lib/scoring/resolve-audit-dimensions.ts), because the stored
 * audits.score_* columns aren't a safe source for drift comparison
 * either: they're a snapshot written once at audit-completion time, not
 * recomputed, so a prod-fix that changes which citations rows count as
 * organic (e.g. 0066 retroactively reclassifying brand-named prompts)
 * leaves the stored value stale until the audit is re-run -- comparing
 * that stale value against a real current/previous pair could fabricate
 * or mask a drift signal. Recomputing here at READ time, from fresh
 * citations rows (batched -- one query for both audits), means a
 * historical audit compares correctly with no backfill.
 *
 * Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
 * `composite` (resolveComposite's weighted blend) is gone -- `headline`
 * is the Frequency DimensionResult directly, byte-identical to
 * `dims.frequency` below.
 */
async function resolveAuditForDrift(
  tx: DbClient,
  auditIds: string[],
): Promise<Map<string, { dims: Record<DimensionKey, DimensionResult>; headline: DimensionResult }>> {
  const resolved = await resolveOrganicDimensions(tx, auditIds);
  const out = new Map<string, { dims: Record<DimensionKey, DimensionResult>; headline: DimensionResult }>();
  for (const auditId of auditIds) {
    const r = resolved.get(auditId);
    if (!r) continue;
    // Task #46 Phase 3, Part C: Sentiment and Context have no real
    // classifier behind their stored labels -- unconditionally
    // not_measured, so drift can never fire on a fabricated "Sentiment
    // dropped" / "Context improved" alert. Both are left out of
    // currentScores/previousScores below the same way insufficient_data
    // dimensions already were -- no change needed there.
    const dims: Record<DimensionKey, DimensionResult> = {
      frequency: r.frequency,
      position: r.position,
      sentiment: NOT_MEASURED_DIMENSION,
      context: NOT_MEASURED_DIMENSION,
      accuracy: r.accuracy,
    };
    out.set(auditId, { dims, headline: r.headline });
  }
  return out;
}

/**
 * Builds the DriftInput detectDrift() needs from two real audit rows.
 * Exported for tests
 * (tests/integration/detect-drift-insufficient-data.integration.test.ts)
 * -- the only other caller is detectDriftFn below.
 */
export async function buildDriftInput(
  tx: DbClient,
  currentAudit: AuditRow,
  previousAudit: AuditRow,
): Promise<DriftInput> {
  const resolvedByAuditId = await resolveAuditForDrift(tx, [currentAudit.id, previousAudit.id]);
  const current = resolvedByAuditId.get(currentAudit.id);
  const previous = resolvedByAuditId.get(previousAudit.id);
  if (!current || !previous) {
    throw new Error(
      `buildDriftInput: resolveAuditForDrift returned no result for ${!current ? currentAudit.id : previousAudit.id}`,
    );
  }

  const currentScores: Record<string, number> = {};
  const previousScores: Record<string, number> = {};
  const currentCIs: Record<string, CI> = {};
  const previousCIs: Record<string, CI> = {};

  // Task #46 Phase 2, Part 1: an insufficient_data dimension (e.g.
  // Position at 0 true mentions) is simply left OUT of the score/CI
  // maps -- detectDrift's own `?? 50` / `?? WIDE_CI` fallback then
  // neutralises the comparison (equal default scores, and a 0-100 CI
  // that overlaps everything), reusing the exact gate dimension-level
  // drift already had rather than adding a second "insufficient" code
  // path to lib/drift/detect.ts.
  for (const key of Object.keys(current.dims) as DimensionKey[]) {
    const d = current.dims[key];
    if (d.status === "scored") {
      currentScores[key] = d.value;
      currentCIs[key] = d.ci;
    }
  }
  for (const key of Object.keys(previous.dims) as DimensionKey[]) {
    const d = previous.dims[key];
    if (d.status === "scored") {
      previousScores[key] = d.value;
      previousCIs[key] = d.ci;
    }
  }

  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // the headline can now genuinely be insufficient_data (zero successful
  // organic answers, not just zero mentions) -- the same WIDE_CI
  // neutralising fallback the per-dimension loop above already applies
  // generically, so a headline with no real measurement never fabricates
  // a drift signal against it.
  const WIDE_CI: CI = { lower: 0, upper: 100 };
  const headlineValue = (h: DimensionResult) => (h.status === "scored" ? h.value : 0);
  const headlineCI = (h: DimensionResult) => (h.status === "scored" ? h.ci : WIDE_CI);

  return {
    currentScores,
    previousScores,
    currentCIs,
    previousCIs,
    currentComposite: headlineValue(current.headline),
    previousComposite: headlineValue(previous.headline),
    // Vunnara (19 Oct, post-aa83b3a): the composite basis
    // ("frequency_only" vs "weighted") was only ever about whether the
    // OLD blend had extra dimensions mixed in -- the headline is always
    // Frequency alone now, so there's only ever one basis. Kept as a
    // literal (rather than removing the field from DriftInput/lib/
    // drift/detect.ts's mismatch gate) -- lower risk than reworking that
    // gate, and permanently inert (never mismatched) either way.
    currentCompositeBasis: "frequency_only",
    previousCompositeBasis: "frequency_only",
    currentCompositeCI: headlineCI(current.headline),
    previousCompositeCI: headlineCI(previous.headline),
    // Vunnara Build 1, Part E.2: both audit rows already carry their
    // own promptPackVersion (set once at creation, never rewritten).
    currentPromptPackVersion: currentAudit.promptPackVersion ?? 1,
    previousPromptPackVersion: previousAudit.promptPackVersion ?? 1,
  };
}

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

      const [previous] = await withRlsContext(orgId, async (tx) => {
        return tx
          .select()
          .from(audits)
          .where(
            and(eq(audits.brandId, bId), ne(audits.id, auditId), eq(audits.status, "complete")),
          )
          .orderBy(desc(audits.createdAt))
          .limit(1);
      });

      return { current, previous: previous ?? null, brandId: bId, organizationId: orgId };
    });

    if (!loaded) return { skipped: true, reason: "audit_not_found" };
    if (!loaded.previous) return { skipped: true, reason: "first_audit_no_comparison" };

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
