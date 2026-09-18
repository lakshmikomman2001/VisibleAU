import { notFound, redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
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

  const counts = await withRlsContext(currentUser.organizationId, (tx) =>
    getTaskCountsByStatus(brandId, tx),
  );

  return <WorkflowHubClient brandId={brandId} counts={counts} />;
}
