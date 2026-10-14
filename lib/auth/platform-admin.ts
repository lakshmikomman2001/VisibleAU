import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Task #46 (13th follow-up): there is no existing platform-admin concept in
 * this codebase (checked: no PLATFORM_ADMIN/isInternal/superAdmin anywhere)
 * -- org-level "owner"/"admin" roles exist, but those are scoped to a
 * customer's own org, not Sri's own access across every org. This is new,
 * minimal infrastructure for exactly one purpose: gating internal
 * diagnostic routes like /api/admin/db-role-check. It is NOT org-scoped --
 * membership here overrides whatever org/role the requester's own account
 * happens to have.
 *
 * PLATFORM_ADMIN_EMAILS is a comma-separated allowlist, unset by default
 * (meaning no one passes, including Sri, until he sets it) -- fails closed.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const allowlist = process.env.PLATFORM_ADMIN_EMAILS;
  if (!allowlist) return false;

  const user = await getCurrentUser();
  if (!user?.email) return false;

  const allowed = new Set(
    allowlist
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(user.email.toLowerCase());
}
