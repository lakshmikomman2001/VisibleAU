import { and, desc, eq, inArray } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { authMembers, authOrganizations } from "@/db/schema/auth";

/**
 * For a signed-in account that getCurrentUser() can't place in a
 * workspace (no app `users` row joined to an organisation), why not --
 * so /no-workspace can offer the right way in.
 *
 * - "linked": the account created a better-auth organisation whose
 *   setting-up didn't finish: its app workspace exists but the account's
 *   profile row was never written, or the workspace itself was never made
 *   (an attempt that stopped half-way). "Open <org>" finishes it, by that
 *   organisation's id (lib/auth/workspace.ts finishWorkspace).
 * - "none": no organisation of its own (e.g. sign-up stopped after
 *   creating the account but before its workspace). It needs one made.
 *
 * A workspace that exists is offered before an unfinished one, and the
 * newest of each first; a closed one never is (isClosedAuthOrg).
 *
 * Reads auth tables, which aren't org-scoped, so this uses the service
 * connection like lib/auth/current-user.ts.
 */

/**
 * A better-auth organisation marked closed in its metadata (`closedAt`).
 * Closing an app workspace sets `organizations.deleted_at`; an organisation
 * that never got one (an attempt that stopped half-way) has no such row,
 * so closing it sets this instead -- e.g. db/prod-fixes/0104. Either way
 * it counts as absent: never offered, reused or finished.
 * better-auth itself stores metadata as a JSON string.
 */
export function isClosedAuthOrg(metadata: string | null): boolean {
  if (!metadata) return false;
  try {
    const parsed: unknown = JSON.parse(metadata);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      "closedAt" in parsed &&
      typeof parsed.closedAt === "string"
    );
  } catch {
    return false;
  }
}

export type WorkspaceState =
  | { kind: "linked"; authOrgId: string; orgName: string }
  | { kind: "none" };

export async function getWorkspaceState(authUserId: string): Promise<WorkspaceState> {
  const owned = (
    await serviceDb
      .select({
        authOrgId: authOrganizations.id,
        name: authOrganizations.name,
        metadata: authOrganizations.metadata,
      })
      .from(authMembers)
      .innerJoin(authOrganizations, eq(authMembers.organizationId, authOrganizations.id))
      .where(and(eq(authMembers.userId, authUserId), eq(authMembers.role, "owner")))
      .orderBy(desc(authMembers.createdAt))
  ).filter((o) => !isClosedAuthOrg(o.metadata));
  if (owned.length === 0) return { kind: "none" };

  const appOrgs = await serviceDb
    .select({ clerkOrgId: organizations.clerkOrgId, deletedAt: organizations.deletedAt })
    .from(organizations)
    .where(
      inArray(
        organizations.clerkOrgId,
        owned.map((o) => o.authOrgId),
      ),
    );
  const appOrg = new Map(appOrgs.map((o) => [o.clerkOrgId, o]));
  const pick =
    owned.find((o) => {
      const app = appOrg.get(o.authOrgId);
      return app !== undefined && app.deletedAt === null;
    }) ?? owned.find((o) => !appOrg.has(o.authOrgId));
  return pick
    ? { kind: "linked", authOrgId: pick.authOrgId, orgName: pick.name }
    : { kind: "none" };
}
