import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { type User, users } from "@/db/schema";

/** What an unfinished sign-up's profile row held instead of the address. */
export const PLACEHOLDER_EMAIL = "pending@sync.local";

/**
 * The account's profile row (`users`), whatever state its workspace is
 * in -- found the way getCurrentUser() finds it (by account id, then by
 * address), but without needing the workspace to be open. When
 * getCurrentUser() returns null and this doesn't, the profile's
 * workspace is closed.
 */
export async function findAccountProfile(authUserId: string, email: string): Promise<User | null> {
  const [byId] = await serviceDb.select().from(users).where(eq(users.clerkUserId, authUserId));
  if (byId) return byId;
  const [byEmail] = await serviceDb.select().from(users).where(eq(users.email, email));
  return byEmail ?? null;
}
