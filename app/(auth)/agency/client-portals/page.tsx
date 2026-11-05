import { redirect } from "next/navigation";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { workspaceHasFeature } from "@/lib/pricing/plan-features";
import { PLAN_FEATURE_COPY } from "@/lib/pricing/tiers";
import { ClientPortalsView } from "./client-portals-view";

/**
 * 6 Nov -- the client portal is Agency and up (lib/pricing/tiers.ts). On any other plan
 * this page is the locked card, checked here the way POST /api/client-portal/invites
 * checks it, so nobody gets as far as its 403. Links shared before keep working (Sri,
 * 2 Nov) and stay listed under the card, to copy or revoke.
 */
export default async function ClientPortalsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const onPlan = await withRlsContext(currentUser.organizationId, (tx) =>
    workspaceHasFeature(tx, currentUser.organizationId, "client_portal"),
  );
  if (!onPlan) {
    return (
      <PlanLockedPage
        title="Client Portals"
        feature="client_portal"
        description={`${PLAN_FEATURE_COPY.client_portal.description}. Links you've already shared keep working until you revoke them.`}
      >
        <ClientPortalsView canCreate={false} />
      </PlanLockedPage>
    );
  }

  return <ClientPortalsView canCreate />;
}
