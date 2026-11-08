import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { serviceDb } from "@/db/client";
import { orgMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { OrgRole } from "@/lib/governance";
import {
  canActOnMember,
  canAssignRole,
  canPerformAction,
  recordAction,
  roleOf,
} from "@/lib/governance";
import { isLastOwner, LAST_OWNER_REFUSAL, lockWorkspace } from "@/lib/governance/owners";

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "analyst", "viewer"]).optional(),
  brandAccess: z.array(z.string().uuid()).nullable().optional(),
});

/**
 * Follow-ups from 6e27afc..01a6a8c, part 3 (Sri, 8 Nov): neither changing a role nor removing someone
 * may leave the workspace without an owner who can manage it -- an owner demoting or removing the last
 * one, themselves included, is refused with nothing changed. Each change holds the workspace's row while
 * it checks and writes (lib/governance/owners.ts), so two owners demoting each other can't both succeed.
 */
type Refusal = { refused: NextResponse };
const refuse = (error: string, status: number): Refusal => ({
  refused: NextResponse.json({ error }, { status }),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, memberId } = await params;
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(memberId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The role from the active membership only (follow-ups from 6e27afc..01a6a8c, part 1).
  const actorRole = await roleOf(currentUser);
  if (!actorRole || !canPerformAction(actorRole, "change_member_role"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const outcome = await serviceDb.transaction(async (tx) => {
    await lockWorkspace(tx, currentUser.organizationId);
    const [target] = await tx
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        isActive: orgMembers.isActive,
      })
      .from(orgMembers)
      .where(
        and(eq(orgMembers.id, memberId), eq(orgMembers.organizationId, currentUser.organizationId)),
      );

    if (!target) return refuse("Not found", 404);
    if (!canActOnMember(actorRole, target.role as OrgRole))
      return refuse("Cannot modify this member", 403);
    if (parsed.data.role && !canAssignRole(actorRole, parsed.data.role as OrgRole))
      return refuse("Cannot assign this role", 403);
    if (
      parsed.data.role &&
      parsed.data.role !== "owner" &&
      (await isLastOwner(tx, currentUser.organizationId, target.id))
    ) {
      return refuse(LAST_OWNER_REFUSAL, 409);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.role) updates.role = parsed.data.role;
    if (parsed.data.brandAccess !== undefined) updates.brandAccess = parsed.data.brandAccess;

    const [updated] = await tx
      .update(orgMembers)
      .set(updates)
      .where(eq(orgMembers.id, memberId))
      .returning();
    return { target, updated };
  });
  if ("refused" in outcome) return outcome.refused;

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_role_changed",
    resourceType: "org_member",
    resourceId: memberId,
    metadata: {
      targetUserId: outcome.target.userId,
      previousRole: outcome.target.role,
      newRole: parsed.data.role ?? outcome.target.role,
      brandAccess: parsed.data.brandAccess,
    },
  });

  return NextResponse.json(outcome.updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId, memberId } = await params;
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(memberId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (orgId !== currentUser.organizationId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The role from the active membership only (follow-ups from 6e27afc..01a6a8c, part 1).
  const actorRole = await roleOf(currentUser);
  if (!actorRole || !canPerformAction(actorRole, "remove_member"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const outcome = await serviceDb.transaction(async (tx) => {
    await lockWorkspace(tx, currentUser.organizationId);
    const [target] = await tx
      .select({
        id: orgMembers.id,
        userId: orgMembers.userId,
        role: orgMembers.role,
        isActive: orgMembers.isActive,
        acceptedAt: orgMembers.acceptedAt,
      })
      .from(orgMembers)
      .where(
        and(eq(orgMembers.id, memberId), eq(orgMembers.organizationId, currentUser.organizationId)),
      );

    if (!target) return refuse("Not found", 404);
    if (!canActOnMember(actorRole, target.role as OrgRole))
      return refuse("Cannot remove this member", 403);
    if (await isLastOwner(tx, currentUser.organizationId, target.id)) {
      return refuse(LAST_OWNER_REFUSAL, 409);
    }

    // A pending invite is cancelled (its row, and its token, go); a member is deactivated: their profile
    // and history stay, and from the next request they have no workspace (part 1).
    if (!target.acceptedAt) {
      await tx.delete(orgMembers).where(eq(orgMembers.id, memberId));
    } else {
      await tx
        .update(orgMembers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(orgMembers.id, memberId));
    }
    return { target };
  });
  if ("refused" in outcome) return outcome.refused;

  await recordAction({
    organizationId: currentUser.organizationId,
    userId: currentUser.id,
    action: "member_removed",
    resourceType: "org_member",
    resourceId: memberId,
    metadata: { targetUserId: outcome.target.userId, wasAccepted: !!outcome.target.acceptedAt },
  });

  return NextResponse.json({ removed: true });
}
