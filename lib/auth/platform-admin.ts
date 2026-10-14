import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { authUsers } from "@/db/schema/auth";
import { auth } from "@/lib/auth/server";

/**
 * Task #46 (13th follow-up): there is no existing platform-admin concept in
 * this codebase -- org-level "owner"/"admin" roles exist, but those are
 * scoped to a customer's own org, not Sri's own access across every org.
 * This is new, minimal infrastructure for exactly one purpose: gating
 * internal diagnostic routes like /api/admin/db-role-check. It is NOT
 * org-scoped -- membership here overrides whatever org/role the requester's
 * own account happens to have.
 *
 * PLATFORM_ADMIN_EMAILS is a comma-separated allowlist, unset by default
 * (meaning no one passes, including Sri, until he sets it) -- fails closed.
 *
 * Task #46 (14th follow-up): an email-based check must only trust a
 * VERIFIED email -- an attacker who can get an unverified account created
 * under an admin's email address (most sign-up flows let you claim any
 * email before proving you own it) must not pass this check just because
 * the string matches. Reads email_verified from auth_users directly via
 * serviceDb (the authoritative, server-side record -- never the client,
 * never session data that might be stale/unverified-but-cached), not from
 * whatever better-auth's session object happens to carry. Case and
 * whitespace are normalized on both sides; the comparison itself is exact
 * (no wildcards, no domain matching).
 */
export interface PlatformAdminCheck {
  allowed: boolean;
  /** better-auth user id, if a session exists at all -- for logging, never the email. */
  userId: string | null;
}

export async function checkPlatformAdmin(): Promise<PlatformAdminCheck> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { allowed: false, userId: null };

  const userId = session.user.id;

  const allowlist = process.env.PLATFORM_ADMIN_EMAILS;
  if (!allowlist) return { allowed: false, userId };

  const [authUser] = await serviceDb
    .select({ email: authUsers.email, emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.id, userId));

  if (!authUser || !authUser.emailVerified) return { allowed: false, userId };

  const normalizedEmail = authUser.email.trim().toLowerCase();
  const allowedEmails = new Set(
    allowlist
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );

  return { allowed: allowedEmails.has(normalizedEmail), userId };
}

/** Convenience wrapper for callers that only need the boolean. */
export async function isPlatformAdmin(): Promise<boolean> {
  return (await checkPlatformAdmin()).allowed;
}
