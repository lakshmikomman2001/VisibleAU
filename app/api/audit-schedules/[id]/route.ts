import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { auditSchedules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

const patchSchema = z.object({
  status: z.enum(["active", "paused"]),
  pausedReason: z.string().max(200).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await setRlsContext(db, currentUser.organizationId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [schedule] = await db
    .update(auditSchedules)
    .set({
      status: parsed.data.status,
      pausedReason: parsed.data.status === "paused" ? (parsed.data.pausedReason ?? null) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(auditSchedules.id, id),
        eq(auditSchedules.organizationId, currentUser.organizationId),
      ),
    )
    .returning();

  if (!schedule) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ schedule });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const [deleted] = await db
    .delete(auditSchedules)
    .where(
      and(
        eq(auditSchedules.id, id),
        eq(auditSchedules.organizationId, currentUser.organizationId),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
