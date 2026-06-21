import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, setRlsContext } from "@/db/client";
import { webhookEndpoints } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { VALID_EVENTS } from "@/lib/webhooks/events";

const PatchSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );

  await setRlsContext(db, currentUser.organizationId);
  const { id } = await params;

  const [updated] = await db
    .update(webhookEndpoints)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.organizationId, currentUser.organizationId),
      ),
    )
    .returning();

  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);
  const { id } = await params;

  await db
    .delete(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.id, id),
        eq(webhookEndpoints.organizationId, currentUser.organizationId),
      ),
    );

  return NextResponse.json({ deleted: true });
}
