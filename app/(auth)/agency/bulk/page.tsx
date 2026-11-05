import { redirect } from "next/navigation";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { workspaceHasFeature } from "@/lib/pricing/plan-features";
import { BulkOperationsView } from "./bulk-operations-view";

/**
 * 6 Nov -- bulk re-audit and export are Agency Pro and up (lib/pricing/tiers.ts). On
 * any other plan this page is the locked card, checked here the way both routes check
 * it, so nobody gets as far as their 403. The Agency Dashboard's two entries carry the
 * lock on those plans.
 */
export default async function BulkOperationsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const onPlan = await withRlsContext(currentUser.organizationId, (tx) =>
    workspaceHasFeature(tx, currentUser.organizationId, "bulk_operations"),
  );
  if (!onPlan) return <PlanLockedPage title="Bulk Operations" feature="bulk_operations" />;

  return <BulkOperationsView />;
}
