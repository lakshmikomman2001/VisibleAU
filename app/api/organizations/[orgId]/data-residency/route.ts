import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDataResidency, recordAction } from "@/lib/governance";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await getDataResidency(currentUser.organizationId);

  recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "data_residency_accessed",
    resourceType: "data_residency",
  });

  return NextResponse.json(entries);
}
