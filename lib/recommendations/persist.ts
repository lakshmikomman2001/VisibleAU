import { and, eq, ne } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { actionItems } from "@/db/schema";
import type { RecommendationWithConfidence } from "./types";

export interface PersistRecommendationsResult {
  inserted: number;
  /** recommendationKeys skipped because the SAME key is already
   * `in_progress` for this brand -- the new audit's evidence for that
   * key is dropped, not linked to the in-progress row. Chosen over
   * updating the in-progress row's own evidence: an owner actively
   * working on something shouldn't have its basis change under them
   * mid-task. */
  skippedInProgressKeys: string[];
  /** rows just dismissed (this brand's OPEN items from an audit other
   * than this one) -- 0 on a replay, since a dismissed row no longer
   * matches status = 'open'. */
  dismissed: number;
}

/**
 * "The Action Center shows each brand's latest audit only" (23 Oct),
 * item 1 -- the ONE place both real-audit writers (inngest/functions/
 * generate-recommendations.ts, lib/audit/run-audit-inline.ts) persist
 * a freshly-generated batch of recommendations, so they can't drift
 * apart. Two rules, both idempotent by construction (safe for an
 * Inngest retry or inline-runner replay of the SAME audit):
 *
 * 1. One open copy per recommendation_key per brand: if the SAME key
 *    is already `in_progress` for this brand (from ANY audit), the
 *    new candidate is skipped outright -- never a second open copy,
 *    never silently overwriting what the owner is already doing.
 * 2. This brand's OLDER open items (any audit other than this one)
 *    are dismissed, reason 'Replaced by a newer audit' -- never
 *    deleted, and never an in_progress or done item (the WHERE only
 *    ever matches status = 'open'). A second run against the same
 *    audit dismisses 0 more, since there's nothing left to match.
 */
export async function persistRecommendations(
  tx: DbClient,
  params: {
    auditId: string;
    organizationId: string;
    brandId: string;
    recommendations: RecommendationWithConfidence[];
  },
): Promise<PersistRecommendationsResult> {
  const { auditId, organizationId, brandId, recommendations } = params;

  const inProgressRows = await tx
    .select({ recommendationKey: actionItems.recommendationKey })
    .from(actionItems)
    .where(and(eq(actionItems.brandId, brandId), eq(actionItems.status, "in_progress")));
  const inProgressKeys = new Set(inProgressRows.map((r) => r.recommendationKey));

  const toInsert = recommendations.filter((r) => !inProgressKeys.has(r.recommendationKey));
  const skippedInProgressKeys = recommendations
    .filter((r) => inProgressKeys.has(r.recommendationKey))
    .map((r) => r.recommendationKey);

  // .returning() after onConflictDoNothing() only returns the rows that
  // actually landed -- a replay of the SAME audit (Inngest retry, or
  // run-audit-inline hitting this twice) hits the (audit_id,
  // recommendation_key) unique index for every candidate already
  // persisted, so `inserted` must come from here, not from
  // toInsert.length: that would count a conflict-skipped candidate as
  // "inserted" and break idempotency reporting.
  const insertedRows =
    toInsert.length > 0
      ? await tx
          .insert(actionItems)
          .values(
            toInsert.map((rec) => ({
              organizationId,
              brandId,
              auditId,
              recommendationKey: rec.recommendationKey,
              dimension: rec.dimension,
              title: rec.title,
              action: rec.action,
              confidenceLabel: rec.confidenceLabel,
              confidenceBasis: rec.confidenceBasis,
              expectedImpactScore: rec.expectedImpactScore,
              evidenceRefs: rec.evidenceRefs,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: actionItems.id })
      : [];

  const dismissedRows = await tx
    .update(actionItems)
    .set({
      status: "dismissed",
      dismissedReason: "Replaced by a newer audit",
      dismissedAt: new Date(),
    })
    .where(
      and(
        eq(actionItems.brandId, brandId),
        eq(actionItems.status, "open"),
        ne(actionItems.auditId, auditId),
      ),
    )
    .returning({ id: actionItems.id });

  return {
    inserted: insertedRows.length,
    skippedInProgressKeys,
    dismissed: dismissedRows.length,
  };
}
