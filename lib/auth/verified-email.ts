import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { authUsers } from "@/db/schema/auth";

/**
 * Whether a better-auth user id's own account has email_verified = true on
 * `auth_users` -- the authoritative, server-side record, never trusted from
 * a session object (which can carry a stale or client-influenced value).
 * Same source of truth as `checkPlatformAdmin()` (task #46, 13th/14th
 * follow-up); extracted here so other auth-adjacent checks (task #46, 15th
 * follow-up: members/accept) don't each re-import `serviceDb` directly --
 * `lib/auth/**` is already allowlisted in biome.json's serviceDb fence.
 * False for no matching row (never throws).
 */
export async function isAuthUserEmailVerified(authUserId: string): Promise<boolean> {
  const [row] = await serviceDb
    .select({ emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, authUserId));

  return row?.emailVerified ?? false;
}
