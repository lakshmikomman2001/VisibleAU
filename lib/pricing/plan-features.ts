import { NextResponse } from "next/server";
import type { DbClient } from "@/db/client";
import { withRlsContext } from "@/db/client";
import { effectiveTier } from "./effective-tier";
import { type PlanFeature, planIncludes, requiredTierFor } from "./tiers";

/**
 * 3 Nov ("Server-side plan checks for the paid features that have none") -- whether
 * a workspace's plan has a feature, by lib/pricing/tiers.ts and the plan every gate
 * reads (effective-tier.ts). tests/helpers/plan-gates.ts lists who calls these.
 */

/** "This is part of the Agency plan". */
export function planRequiredMessage(feature: PlanFeature): string {
  return `This is part of the ${requiredTierFor(feature).name} plan`;
}

/** For a job, or a route already holding a transaction. */
export async function workspaceHasFeature(
  db: DbClient,
  organizationId: string,
  feature: PlanFeature,
): Promise<boolean> {
  return planIncludes(await effectiveTier(db, organizationId), feature);
}

/** For a route: the 403 to send, or null if the workspace's plan has it. */
export async function planFeatureRefusal(
  organizationId: string,
  feature: PlanFeature,
): Promise<NextResponse | null> {
  const has = await withRlsContext(organizationId, (tx) =>
    workspaceHasFeature(tx, organizationId, feature),
  );
  return has ? null : NextResponse.json({ error: planRequiredMessage(feature) }, { status: 403 });
}
