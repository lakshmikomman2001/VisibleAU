import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { eq, and } from "drizzle-orm";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
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

  const { brandId, id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let updated;
    try {
      updated = await updateTaskStatus(id, "complete", undefined, tx);
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
  });
}
