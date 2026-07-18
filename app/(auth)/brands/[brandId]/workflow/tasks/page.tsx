import { notFound, redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { isUuid } from "@/lib/validation/uuid";
import { getTasksByBrand } from "@/lib/workflow/task-manager";
import { TasksPageClient } from "./tasks-page-client";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
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

  const tasks = await withRlsContext(currentUser.organizationId, (tx) =>
    getTasksByBrand(brandId, undefined, tx),
  );

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
