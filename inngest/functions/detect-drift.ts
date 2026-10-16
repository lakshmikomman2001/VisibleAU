import { and, desc, eq, ne, sql } from "drizzle-orm";
import { type DbClient, serviceDb, withRlsContext } from "@/db/client";
import { audits, citations, driftAlerts } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { detectDrift } from "@/lib/drift/detect";
import type { CI, DriftInput } from "@/lib/drift/types";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import {
  type DimensionKey,
  type DimensionResult,
  resolveComposite,
  resolveDimension,
} from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

type AuditRow = typeof audits.$inferSelect;

/**
 * Task #46 Phase 2, Part 1: this audit's own honest dimension/composite
 * read -- mirrors app/(auth)/audits/[auditId]/page.tsx's Phase 1 fix
 * exactly (same ORGANIC_ONLY + run_number = 1 true independent-sample
 * count, same resolveDimension/resolveComposite contract), because the
 * two columns this function used to read from for drift input aren't a
 * safe source: `audits.metadata`'s `scores` key is dead schema -- no
 * writer (lib/audit/run-audit-inline.ts, inngest/functions/run-audit.ts)
 * has ever populated it, so the old code's
 * `(current.metadata as ...)?.scores ?? {}` always evaluated to `{}`,
 * silently defaulting every dimension's score to 50 and its CI to the
 * 0-100 "wide" default (i.e. per-dimension drift was already inert in
 * production, for an unrelated reason to the one this task targets).
 * `audits.confidenceIntervals` IS populated (Wilson-based, not stale
 * Wald -- lib/scoring/dimension-ci.ts), but it's a snapshot written once
 * at audit-completion time, not recomputed -- recomputing here at READ
 * time, from fresh citations rows, means a historical audit compares
 * correctly with no backfill, and lets this function (not just the
 * audit page) tell a real 0 ("no mentions to measure") apart from a
 * real low score.
 */
async function resolveAuditForDrift(
  tx: DbClient,
  audit: AuditRow,
): Promise<{
  dims: Record<DimensionKey, DimensionResult>;
  composite: ReturnType<typeof resolveComposite>;
}> {
  const [{ sampleCount, mentionedCount, accWithSourcesCount }] = await tx
    .select({
      sampleCount: sql<number>`count(*)`,
      mentionedCount: sql<number>`COALESCE(SUM(CASE WHEN ${citations.brandMentioned} = true THEN 1 ELSE 0 END), 0)`,
      accWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN ${citations.brandMentioned} = true AND jsonb_array_length(${citations.citedSources}) > 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(citations)
    .where(and(eq(citations.auditId, audit.id), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  // Postgres SUM() surfaces over the wire as a string, not a number --
  // task #46 Phase 1's own root-cause bug was comparing that string to
  // the number 0 (always false). Number(...) every SUM()-derived count
  // before it feeds resolveDimension's `mentionRowCount === 0` check.
  const trueSampleCount = Number(sampleCount);
  const trueMentionedCount = Number(mentionedCount);
  const trueAccWithSourcesCount = Number(accWithSourcesCount);

  const freqDim = resolveDimension(
    Number(audit.scoreFrequency ?? 0),
    wilsonCI(trueMentionedCount, trueSampleCount),
    trueMentionedCount,
    { alwaysScored: true },
  );
  const posDim = resolveDimension(
    Number(audit.scorePosition ?? 0),
    wilsonCIFromScore(Number(audit.scorePosition ?? 0), trueMentionedCount),
    trueMentionedCount,
  );
  const sentDim = resolveDimension(
    Number(audit.scoreSentimentNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreSentimentNumeric ?? 0), trueMentionedCount),
    trueMentionedCount,
  );
  const ctxDim = resolveDimension(
    Number(audit.scoreContextNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreContextNumeric ?? 0), trueMentionedCount),
    trueMentionedCount,
  );
  const accDim = resolveDimension(
    Number(audit.scoreAccuracy ?? 0),
    wilsonCI(trueAccWithSourcesCount, trueMentionedCount),
    trueMentionedCount,
  );

  const dims: Record<DimensionKey, DimensionResult> = {
    frequency: freqDim,
    position: posDim,
    sentiment: sentDim,
    context: ctxDim,
    accuracy: accDim,
  };
  return { dims, composite: resolveComposite(dims) };
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
  const [current, previous] = await Promise.all([
    resolveAuditForDrift(tx, currentAudit),
    resolveAuditForDrift(tx, previousAudit),
  ]);

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

  return {
    currentScores,
    previousScores,
    currentCIs,
    previousCIs,
    currentComposite: current.composite.value,
    previousComposite: previous.composite.value,
    currentCompositeBasis: current.composite.basis,
    previousCompositeBasis: previous.composite.basis,
    currentCompositeCI: current.composite.ci,
    previousCompositeCI: previous.composite.ci,
  };
}

export const detectDriftFn = inngest.createFunction(
  { id: "detect-drift", retries: 2, triggers: [{ event: "audit.complete" }] },
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
          scoreDelta: result.compositeBasisMismatch ? null : String(result.scoreDelta),
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
