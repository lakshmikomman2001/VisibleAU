import { and, eq, isNotNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { organizations, orgMembers, users } from "@/db/schema";

/**
 * Follow-ups from 6e27afc..01a6a8c, part 3 (Sri, 8 Nov: protect the last owner) -- a workspace keeps at
 * least one owner who can manage it. Every change that could take its last one away -- demoting an owner,
 * removing or deactivating one (members/[memberId]), and an owner switching away from it
 * (lib/auth/invite.ts onlyOwnerCantLeave) -- holds the workspace's row while it decides, so two owners
 * demoting each other at the same moment can't both succeed.
 */
export const LAST_OWNER_REFUSAL =
  "A workspace needs at least one owner. Make someone else owner first.";

/** Holds the workspace's row (SELECT ... FOR UPDATE) until the transaction ends. */
export async function lockWorkspace(db: DbClient, workspaceId: string): Promise<void> {
  await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .for("update");
}

/**
 * The workspace's owners who can manage it: an active, accepted owner membership whose profile's
 * workspace it is. Someone who switched to another workspace keeps their membership here but can't open
 * this one (lib/auth/current-user.ts), so they don't count.
 */
export async function ownersWhoCanManage(
  db: DbClient,
  workspaceId: string,
): Promise<Array<{ memberId: string; userId: string }>> {
  const rows = await db
    .select({ memberId: orgMembers.id, userId: orgMembers.userId })
    .from(orgMembers)
    .innerJoin(
      users,
      and(eq(users.id, orgMembers.userId), eq(users.organizationId, orgMembers.organizationId)),
    )
    .where(
      and(
        eq(orgMembers.organizationId, workspaceId),
        eq(orgMembers.role, "owner"),
        eq(orgMembers.isActive, true),
        isNotNull(orgMembers.acceptedAt),
      ),
    );
  return rows.flatMap((r) => (r.userId ? [{ memberId: r.memberId, userId: r.userId }] : []));
}

/** Whether `memberId` is the workspace's only owner who can manage it. The caller holds the row. */
export async function isLastOwner(
  db: DbClient,
  workspaceId: string,
  memberId: string,
): Promise<boolean> {
  const owners = await ownersWhoCanManage(db, workspaceId);
  return owners.length === 1 && owners[0].memberId === memberId;
}
