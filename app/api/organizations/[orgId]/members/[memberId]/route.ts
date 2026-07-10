import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { orgMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canActOnMember,
  canAssignRole,
  canPerformAction,
  getMemberRecord,
  recordAction,
} from "@/lib/governance";
import type { OrgRole } from "@/lib/governance";

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "analyst", "viewer"]).optional(),
  brandAccess: z.array(z.string().uuid()).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, memberId } = await params;
  if (
    !z.string().uuid().safeParse(orgId).success ||
    !z.string().uuid().safeParse(memberId).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actorMember = await getMemberRecord(currentUser.organizationId, currentUser.id);
  const actorRole: OrgRole = (actorMember?.role ?? currentUser.role ?? "viewer") as OrgRole;
  if (!canPerformAction(actorRole, "change_member_role"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [target] = await serviceDb
    .select({
      id: orgMembers.id,
      userId: orgMembers.userId,
      role: orgMembers.role,
      isActive: orgMembers.isActive,
    })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.id, memberId),
        eq(orgMembers.organizationId, currentUser.organizationId),
      ),
    );

  if (!target)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canActOnMember(actorRole, target.role as OrgRole))
    return NextResponse.json({ error: "Cannot modify this member" }, { status: 403 });

  if (parsed.data.role && !canAssignRole(actorRole, parsed.data.role as OrgRole))
    return NextResponse.json({ error: "Cannot assign this role" }, { status: 403 });

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.role) updates.role = parsed.data.role;
  if (parsed.data.brandAccess !== undefined) updates.brandAccess = parsed.data.brandAccess;

  const [updated] = await serviceDb
    .update(orgMembers)
    .set(updates)
    .where(eq(orgMembers.id, memberId))
    .returning();

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_role_changed",
    resourceType: "org_member",
    resourceId: memberId,
    metadata: {
      targetUserId: target.userId,
      previousRole: target.role,
      newRole: parsed.data.role ?? target.role,
      brandAccess: parsed.data.brandAccess,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, memberId } = await params;
  if (
    !z.string().uuid().safeParse(orgId).success ||
    !z.string().uuid().safeParse(memberId).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actorMember = await getMemberRecord(currentUser.organizationId, currentUser.id);
  const actorRole: OrgRole = (actorMember?.role ?? currentUser.role ?? "viewer") as OrgRole;
  if (!canPerformAction(actorRole, "remove_member"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [target] = await serviceDb
    .select({
      id: orgMembers.id,
      userId: orgMembers.userId,
      role: orgMembers.role,
      isActive: orgMembers.isActive,
      acceptedAt: orgMembers.acceptedAt,
    })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.id, memberId),
        eq(orgMembers.organizationId, currentUser.organizationId),
      ),
    );

  if (!target)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canActOnMember(actorRole, target.role as OrgRole))
    return NextResponse.json({ error: "Cannot remove this member" }, { status: 403 });

  if (!target.acceptedAt) {
    await serviceDb.delete(orgMembers).where(eq(orgMembers.id, memberId));
  } else {
    await serviceDb
      .update(orgMembers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(orgMembers.id, memberId));
  }

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_removed",
    resourceType: "org_member",
    resourceId: memberId,
    metadata: { targetUserId: target.userId, wasAccepted: !!target.acceptedAt },
  });

  return NextResponse.json({ removed: true });
}
