import { and, eq, inArray, isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { authMembers, authOrganizations } from "@/db/schema/auth";

/**
 * For a signed-in account that getCurrentUser() can't place in a
 * workspace (no app `users` row joined to an organisation), why not --
 * so /no-workspace can offer the right way in.
 *
 * - "linked": better-auth says the account belongs to an organisation
 *   whose app workspace exists, but the account's own profile row was
 *   never written (sign-up's last step, /api/auth/sync-user, didn't
 *   run). Re-running that step reconnects it.
 * - "none": no organisation at all (e.g. sign-up stopped after creating
 *   the account but before its workspace). The account needs one made.
 *
 * Reads auth tables, which aren't org-scoped, so this uses the service
 * connection like lib/auth/current-user.ts.
 */
export type WorkspaceState = { kind: "linked"; orgName: string } | { kind: "none" };

export async function getWorkspaceState(authUserId: string): Promise<WorkspaceState> {
  const memberships = await serviceDb
    .select({ authOrgId: authOrganizations.id, name: authOrganizations.name })
    .from(authMembers)
    .innerJoin(authOrganizations, eq(authMembers.organizationId, authOrganizations.id))
    .where(eq(authMembers.userId, authUserId));
  if (memberships.length === 0) return { kind: "none" };

  const appOrgs = await serviceDb
    .select({ clerkOrgId: organizations.clerkOrgId, name: organizations.name })
    .from(organizations)
    .where(
      and(
        inArray(
          organizations.clerkOrgId,
          memberships.map((m) => m.authOrgId),
        ),
        isNull(organizations.deletedAt),
      ),
    );
  const linked = appOrgs[0];
  return linked ? { kind: "linked", orgName: linked.name } : { kind: "none" };
}
