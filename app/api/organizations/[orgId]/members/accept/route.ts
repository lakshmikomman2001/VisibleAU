import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { orgMembers } from "@/db/schema";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 10)
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [member] = await serviceDb
    .select()
    .from(orgMembers)
    .where(eq(orgMembers.invitationToken, token));

  if (!member || member.organizationId !== orgId)
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });

  if (member.acceptedAt)
    return NextResponse.json({ error: "Invitation already accepted" }, { status: 409 });

  const [updated] = await serviceDb
    .update(orgMembers)
    .set({
      acceptedAt: new Date(),
      isActive: true,
      invitationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(orgMembers.id, member.id))
    .returning();

  return NextResponse.json({ accepted: true, memberId: updated.id });
}
