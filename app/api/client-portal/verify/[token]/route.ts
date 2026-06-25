import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { brands, clientPortalInvites } from "@/db/schema";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 10) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [invite] = await db
    .select({
      id: clientPortalInvites.id,
      brandId: clientPortalInvites.brandId,
      organizationId: clientPortalInvites.organizationId,
      isRevoked: clientPortalInvites.isRevoked,
      expiresAt: clientPortalInvites.expiresAt,
    })
    .from(clientPortalInvites)
    .where(eq(clientPortalInvites.inviteToken, token));

  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (invite.isRevoked) {
    return NextResponse.json({ error: "Invite has been revoked" }, { status: 403 });
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 403 });
  }

  // Fetch brand name
  const [brand] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, invite.brandId));

  return NextResponse.json({
    brandId: invite.brandId,
    brandName: brand?.name ?? null,
    organizationId: invite.organizationId,
  });
}
