import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { actionItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const patchStatusSchema = z
  .object({
    status: z.enum(["in_progress", "done", "dismissed"]),
    dismissedReason: z.string().max(500).optional(),
  })
  .refine((d) => d.status !== "dismissed" || !!d.dismissedReason, {
    message: "dismissedReason required when status is dismissed",
    path: ["dismissedReason"],
  });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { status, dismissedReason } = parsed.data;
  const now = new Date();

  const updateValues: Record<string, unknown> = {
    status,
    updatedAt: now,
    ...(status === "done" ? { doneAt: now } : {}),
    ...(status === "dismissed" ? { dismissedAt: now, dismissedReason } : {}),
    ...(status === "in_progress" ? { doneAt: null, dismissedAt: null } : {}),
  };

  const [updated] = await db
    .update(actionItems)
    .set(updateValues)
    .where(eq(actionItems.id, id))
    .returning({ id: actionItems.id, status: actionItems.status });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: updated.id, status: updated.status });
}
