import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { driftAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [updated] = await tx
      .update(driftAlerts)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(driftAlerts.id, id), eq(driftAlerts.organizationId, currentUser.organizationId)))
      .returning({ id: driftAlerts.id });

    if (!updated)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ id: updated.id, acknowledged: true });
  });
}
