import { redirect } from "next/navigation";
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

  const { brandId } = await params;
  const counts = await getTaskCountsByStatus(brandId);

  return <WorkflowHubClient brandId={brandId} counts={counts} />;
}
