import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { orgMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const rows = await tx
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        brandAccess: orgMembers.brandAccess,
        isActive: orgMembers.isActive,
        invitedAt: orgMembers.invitedAt,
        expiresAt: orgMembers.expiresAt,
        acceptedAt: orgMembers.acceptedAt,
        updatedAt: orgMembers.updatedAt,
        invitedEmail: orgMembers.invitedEmail,
        userName: users.name,
        userEmail: users.email,
      })
      .from(orgMembers)
      .leftJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.organizationId, currentUser.organizationId));

    // name and email are the profile's, and this workspace's RLS context only reads profiles in this
    // workspace: someone invited from their own workspace has neither. invitedEmail (migration 0130) is
    // the address their invite was sent to.
    const members = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      brandAccess: r.brandAccess,
      isActive: r.isActive,
      invitedAt: r.invitedAt,
      expiresAt: r.expiresAt,
      acceptedAt: r.acceptedAt,
      updatedAt: r.updatedAt,
      name: r.userName,
      email: r.userEmail,
      invitedEmail: r.invitedEmail,
    }));

    return NextResponse.json(members);
  });
}
