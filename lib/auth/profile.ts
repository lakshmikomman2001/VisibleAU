import { and, eq, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import { type DbClient, serviceDb } from "@/db/client";
import { organizations, orgMembers, type User, users } from "@/db/schema";

/** What an unfinished sign-up's profile row held instead of the address. */
export const PLACEHOLDER_EMAIL = "pending@sync.local";

/**
 * The account's profile row (`users`), whatever state its workspace is
 * in -- found the way getCurrentUser() finds it (by account id, and only
 * that), but without needing the workspace to be open. When
 * getCurrentUser() returns null and this doesn't, the profile's
 * workspace is closed, or the account was removed from it.
 */
export async function findAccountProfile(authUserId: string): Promise<User | null> {
  const [byId] = await serviceDb.select().from(users).where(eq(users.clerkUserId, authUserId));
  return byId ?? null;
}

/**
 * Follow-ups from 6e27afc..01a6a8c, part 1 -- the workspace an account can open, exactly as
 * getCurrentUser() decides it: its profile's workspace, open, with an active, accepted membership there.
 * null when it has none (never had one, closed, or removed from it).
 */
export async function workspaceOfAccount(
  db: DbClient,
  authUserId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name })
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
    .where(and(eq(users.clerkUserId, authUserId), isNull(organizations.deletedAt)));
  return row ?? null;
}

/**
 * Follow-ups from 6e27afc..01a6a8c, part 1 -- for an UPDATE or SELECT on `users`: the profile has no
 * workspace it can open -- its workspace is closed, or it has no active, accepted membership there (it
 * was removed). Joining a workspace by invite, or creating one, moves such a profile, as it always moved
 * one whose workspace was closed; the profile itself is kept, because history refers to it.
 */
export function withoutWorkspace(): SQL {
  return sql`(
    ${users.organizationId} IN (
      SELECT ${organizations.id} FROM ${organizations} WHERE ${organizations.deletedAt} IS NOT NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM ${orgMembers}
      WHERE ${orgMembers.organizationId} = ${users.organizationId}
        AND ${orgMembers.userId} = ${users.id}
        AND ${orgMembers.isActive}
        AND ${orgMembers.acceptedAt} IS NOT NULL
    )
  )`;
}
