import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { remediationTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateTaskStatus } from "@/lib/workflow/task-manager";

const updateTaskSchema = z
  .object({
    status: z
      .enum(["open", "in_progress", "ready_for_review", "complete", "wont_fix"])
      .optional(),
    wontFixReason: z.string().optional(),
    assignedTo: z.string().uuid().optional(),
    effort: z.enum(["low", "medium", "high"]).optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
  })
  .refine(
    (data) => data.status !== "wont_fix" || (data.wontFixReason && data.wontFixReason.length > 0),
    { message: "wont_fix_reason is required when status is 'wont_fix'" },
  );

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [task] = await db
    .select()
    .from(remediationTasks)
    .where(eq(remediationTasks.id, id));

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(task);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ brandId: string; id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.status) {
      const updated = await updateTaskStatus(
        id,
        parsed.data.status,
        parsed.data.wontFixReason,
      );
      return NextResponse.json(updated);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.assignedTo) updates.assignedTo = parsed.data.assignedTo;
    if (parsed.data.effort) updates.effort = parsed.data.effort;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.dueDate) updates.dueDate = new Date(parsed.data.dueDate);

    const [updated] = await db
      .update(remediationTasks)
      .set(updates)
      .where(eq(remediationTasks.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
