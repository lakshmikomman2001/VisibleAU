import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { serviceDb } from "@/db/client";
import type { Organization, User } from "@/db/schema";
import { organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type CurrentUser = User & {
  organization: Organization;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  // By the account's id only. It used to fall back to users.email, so signing up
  // with the address of a profile that had no account opened that profile's
  // workspace (3 Nov; on production nobody relied on it: diag-0117, query 3).
  const [userRow] = await serviceDb
    .select()
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.clerkUserId, session.user.id));

  // A closed workspace (organizations.deleted_at set) counts as none: the
  // account lands on /no-workspace, like one that never had one.
  if (!userRow || userRow.organizations.deletedAt) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
