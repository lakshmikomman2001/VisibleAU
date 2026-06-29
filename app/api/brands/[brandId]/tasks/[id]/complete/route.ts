import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateTaskStatus } from "@/lib/workflow/task-manager";
import { inngest } from "@/lib/inngest/client";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { brandId, id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let updated;
  try {
    updated = await updateTaskStatus(id, "complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Complete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let reauditQueued = true;
  try {
    await inngest.send({
      name: "task/completed",
      data: {
        taskId: id,
        brandId,
        orgId: currentUser.organizationId,
      },
    });
  } catch (e) {
    reauditQueued = false;
    console.error(
      "[complete-task] task/completed event failed to emit — re-audit NOT triggered",
      { taskId: id, brandId, error: e instanceof Error ? e.message : String(e) },
    );
  }

  return NextResponse.json({ ...updated, reauditQueued });
}
