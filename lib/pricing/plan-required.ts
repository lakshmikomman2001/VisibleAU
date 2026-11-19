import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { DbClient } from "@/db/client";
import { organizations } from "@/db/schema";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";
import { effectiveTier } from "./effective-tier";
import { PLAN_REQUIRED } from "./plan-required-copy";

/**
 * 20 Nov (Sri's decision, part 6): sign-up follows the free-plan switch (FREE_TIER_ENABLED_<REGION>, lib/feature-flags).
 * With it off, a new workspace gets no Free plan: it's marked `metadata.planRequired` when it's made
 * (lib/auth/server.ts provisionAppWorkspace) and has no plan until checkout -- the app sends it to the plan picker
 * (/pricing; components/domain/plan-required-gate.tsx), and nothing that costs money runs: adding a business (its home
 * page goes to Claude) and running an audit answer 402 (PLAN_REQUIRED). With the switch on, nothing changes. The mark
 * stays; a paid plan simply overrides it (workspaceNeedsPlan).
 */

/** The metadata a new workspace starts with: the mark when the region's free plan is off. */
export function newWorkspaceMetadata(region: Region): Record<string, unknown> {
  return isFreeTierEnabled(region) ? {} : { planRequired: true };
}

/** Whether a workspace's stored metadata carries the mark. */
export function hasPlanRequiredMark(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { planRequired?: unknown }).planRequired === true
  );
}

/** A workspace made while the free plan was off, with no paid plan yet: it can't use the app until checkout. */
export async function workspaceNeedsPlan(db: DbClient, organizationId: string): Promise<boolean> {
  const [org] = await db
    .select({ metadata: organizations.metadata })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!hasPlanRequiredMark(org?.metadata)) return false;
  return (await effectiveTier(db, organizationId)) === "free";
}

export { PLAN_REQUIRED };

/** The refusal a paid action gives a workspace with no plan. */
export function planRequiredResponse(): NextResponse {
  return NextResponse.json(PLAN_REQUIRED, { status: 402 });
}
