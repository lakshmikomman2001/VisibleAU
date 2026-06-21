import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setRlsContext(db, currentUser.organizationId);

  const { id } = await params;

  const [updated] = await db
    .update(driftAlerts)
    .set({
      acknowledged: true,
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(driftAlerts.id, id))
    .returning({ id: driftAlerts.id });

  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ id: updated.id, acknowledged: true });
}
