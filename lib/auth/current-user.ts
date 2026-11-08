import { and, eq, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { serviceDb } from "@/db/client";
import type { Organization, User } from "@/db/schema";
import { organizations, orgMembers, users } from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type CurrentUser = User & {
  organization: Organization;
};

/**
 * The signed-in account's profile and the workspace it opens, or null when it has none.
 *
 * Follow-ups from 6e27afc..01a6a8c, part 1 (Sri, 8 Nov: removed members lose access immediately) -- a
 * workspace is the account's only while it has an active, accepted membership there. Removing someone
 * (members/[memberId] DELETE) deactivates their membership but leaves their profile in the workspace,
 * because history (the audit trail, authorship) refers to it; before this, the profile alone still opened
 * the workspace. Now that profile has no workspace: /no-workspace on every page, and every API route
 * answers as for any account without one. Read from the database on every request -- nothing caches it,
 * and a better-auth session carries no workspace -- so a removal counts from the next request.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  // By the account's id only. It used to fall back to users.email, so signing up
  // with the address of a profile that had no account opened that profile's
  // workspace (3 Nov; on production nobody relied on it: diag-0117, query 3).
  const [userRow] = await serviceDb
    .select({ users, organizations })
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.organizationId, users.organizationId),
        eq(orgMembers.userId, users.id),
        eq(orgMembers.isActive, true),
        isNotNull(orgMembers.acceptedAt),
      ),
    )
    .where(eq(users.clerkUserId, session.user.id));

  // A closed workspace (organizations.deleted_at set) counts as none: the
  // account lands on /no-workspace, like one that never had one.
  if (!userRow || userRow.organizations.deletedAt) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
