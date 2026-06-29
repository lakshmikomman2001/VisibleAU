import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTasksByBrand } from "@/lib/workflow/task-manager";
import { TasksPageClient } from "./tasks-page-client";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  const tasks = await getTasksByBrand(brandId);

  const serialized = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    effort: t.effort,
    confidenceLabel: t.confidenceLabel,
    dimension: t.dimension,
    scoreBefore: t.scoreBefore,
    scoreAfter: t.scoreAfter,
    assignedTo: t.assignedTo,
    dueDate: t.dueDate?.toISOString() ?? null,
    reauditDeferredReason: t.reauditDeferredReason,
  }));

  return <TasksPageClient brandId={brandId} tasks={serialized} />;
}
