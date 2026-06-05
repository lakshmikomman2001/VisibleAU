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

  const [userRow] = await db
    .select()
    .from(users)
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    .where(eq(users.clerkUserId, session.user.id));

  if (!userRow) return null;
  return { ...userRow.users, organization: userRow.organizations };
}
