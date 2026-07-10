import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { orgMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const rows = await tx
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        brandAccess: orgMembers.brandAccess,
        isActive: orgMembers.isActive,
        invitedAt: orgMembers.invitedAt,
        acceptedAt: orgMembers.acceptedAt,
        updatedAt: orgMembers.updatedAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(orgMembers)
      .leftJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(orgMembers.organizationId, currentUser.organizationId));

    const members = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      brandAccess: r.brandAccess,
      isActive: r.isActive,
      invitedAt: r.invitedAt,
      acceptedAt: r.acceptedAt,
      updatedAt: r.updatedAt,
      name: r.userName,
      email: r.userEmail,
    }));

    return NextResponse.json(members);
  });
}
