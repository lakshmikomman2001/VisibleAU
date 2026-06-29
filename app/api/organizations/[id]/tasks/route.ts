import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { remediationTasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(
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

  if (id !== currentUser.organizationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await setRlsContext(db, currentUser.organizationId);

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const conditions = [eq(remediationTasks.organizationId, id)];
  if (status) {
    conditions.push(eq(remediationTasks.status, status));
  }

  const { and } = await import("drizzle-orm");
  const tasks = await db
    .select()
    .from(remediationTasks)
    .where(and(...conditions))
    .orderBy(remediationTasks.priority);

  return NextResponse.json(tasks);
}
