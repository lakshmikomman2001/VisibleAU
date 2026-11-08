import { notFound, redirect } from "next/navigation";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { brandFeatureIncluded } from "@/lib/pricing/brand-features";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { isUuid } from "@/lib/validation/uuid";
import { getTaskCountsByStatus } from "@/lib/workflow/task-manager";
import { WorkflowHubClient } from "./workflow-hub-client";

export default async function WorkflowPage({ params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError) notFound();
    throw e;
  }

  // Brand-feature locks (8 Nov), part 1: tasks and drafts are Growth (their routes say so, from
  // lib/pricing/brand-features.ts). On a plan without them the page shows the locked card and reads nothing;
  // it used to list them and every action on them answered 403.
  const tier = await withRlsContext(currentUser.organizationId, (tx) =>
    effectiveTier(tx, currentUser.organizationId),
  );
  if (!brandFeatureIncluded(tier, "tasks"))
    return <PlanLockedPage title="Workflow" feature="tasks" />;

  const counts = await withRlsContext(currentUser.organizationId, (tx) =>
    getTaskCountsByStatus(brandId, tx),
  );

  return <WorkflowHubClient brandId={brandId} counts={counts} />;
}
