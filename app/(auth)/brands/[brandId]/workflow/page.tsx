import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTaskCountsByStatus } from "@/lib/workflow/task-manager";
import { WorkflowHubClient } from "./workflow-hub-client";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  const counts = await getTaskCountsByStatus(brandId);

  return <WorkflowHubClient brandId={brandId} counts={counts} />;
}
