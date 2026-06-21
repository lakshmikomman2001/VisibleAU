import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import type { Organization, User } from "@/db/schema";
import { organizations, users } from "@/db/schema";
import { auth } from "@/lib/auth/server";

export type CurrentUser = User & {
  organization: Organization;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;

  // Try matching by better-auth user ID first (may be hashed in newer versions)
  let [userRow] = await db
    .select()
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.clerkUserId, session.user.id));

  // Fall back to email match if ID lookup fails (better-auth 1.6+ transforms IDs)
  if (!userRow && session.user.email) {
    [userRow] = await db
      .select()
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(eq(users.email, session.user.email));
  }

  if (!userRow) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
