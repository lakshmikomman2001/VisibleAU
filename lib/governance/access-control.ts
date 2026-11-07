import { and, eq, isNull } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { brands, orgMembers } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import {
  canPerformAction,
  isOrgRole,
  type OrgRole,
  type PermissionAction,
  refusalMessage,
} from "./permissions";

// The role-by-action matrix lives in ./permissions (no imports, so client components read it too).
export type { OrgRole, PermissionAction } from "./permissions";
export {
  canActOnMember,
  canAssignRole,
  canPerformAction,
  isOrgRole,
  refusalMessage,
  rolesAllowed,
} from "./permissions";

export async function getMemberRecord(
  organizationId: string,
  userId: string,
): Promise<{ role: OrgRole; brandAccess: string[] | null } | null> {
  const [member] = await serviceDb
    .select({
      role: orgMembers.role,
      brandAccess: orgMembers.brandAccess,
    })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.organizationId, organizationId),
        eq(orgMembers.userId, userId),
        eq(orgMembers.isActive, true),
      ),
    );

  if (!member) return null;
  return { role: member.role as OrgRole, brandAccess: member.brandAccess };
}

/**
 * Team follow-ups (31 Oct), items 6 and 10 -- the signed-in user's role in their workspace, as every server
 * check reads it: their active membership's, else their profile's, else viewer. The (auth) layout hands the
 * same answer to the UI (components/domain/role-context.tsx), so a control shows only for a role the
 * server allows.
 */
export async function roleOf(
  user: Pick<CurrentUser, "id" | "organizationId" | "role">,
): Promise<OrgRole> {
  const member = await getMemberRecord(user.organizationId, user.id);
  const role = member?.role ?? user.role;
  return isOrgRole(role) ? role : "viewer";
}

/** A 403 saying which roles may do `action`, unless the user's role may; null when it may. */
export async function roleRefusal(
  user: Pick<CurrentUser, "id" | "organizationId" | "role">,
  action: PermissionAction,
): Promise<Response | null> {
  if (canPerformAction(await roleOf(user), action)) return null;
  return Response.json({ error: refusalMessage(action) }, { status: 403 });
}

export async function assertBrandAccess(user: CurrentUser, brandId: string): Promise<void> {
  const [brand] = await serviceDb
    .select({ id: brands.id, organizationId: brands.organizationId })
    .from(brands)
    .where(and(eq(brands.id, brandId), isNull(brands.deletedAt)))
    .limit(1);

  // Task #46 (7th follow-up): a brand that doesn't exist at all, or
  // belongs to a DIFFERENT org, must never be distinguishable from
  // "exists but you can't see it" -- that's an existence leak. This is
  // reason: "not_found", never reason: "role_restricted". See
  // brandAccessErrorResponse() in this file and
  // docs/ops/post-launch-db-hardening.md section 46 (7th follow-up).
  if (!brand || brand.organizationId !== user.organizationId) {
    throw new BrandAccessDeniedError("not_found");
  }

  const member = await getMemberRecord(user.organizationId, user.id);
  if (!member || member.brandAccess === null) return;
  if (member.brandAccess.includes(brandId)) return;
  // A same-org brand this specific member's role doesn't extend to --
  // the brand's EXISTENCE is never in question here, so this is the
  // one case allowed to say so via 403 rather than 404.
  throw new BrandAccessDeniedError("role_restricted");
}

export class BrandAccessDeniedError extends Error {
  /**
   * "not_found": the brand doesn't exist, or belongs to a different
   * org -- must map to 404 (never confirm another org's resource
   * exists). "role_restricted": a same-org brand this member's role
   * doesn't extend to -- may map to 403, since existence isn't in
   * question. Defaults to "not_found" (the safer -- never leaks
   * existence -- choice) for any construction site that doesn't pass
   * one explicitly, so every PRE-EXISTING `throw new
   * BrandAccessDeniedError()` call elsewhere keeps returning 403
   * exactly as before (this property is additive, routes that don't
   * read it are unaffected) while still being correct by default if
   * anything new reads it without specifying a reason.
   */
  public readonly reason: "not_found" | "role_restricted";

  constructor(reason: "not_found" | "role_restricted" = "not_found") {
    super("Brand access denied");
    this.name = "BrandAccessDeniedError";
    this.reason = reason;
  }
}

/**
 * Task #46 (7th follow-up): the one shared mapping from a governance
 * error to its HTTP response, so the 403-vs-404 policy (404 for a
 * brand you can't prove exists to this user, 403 only for a same-org
 * brand this member's role doesn't extend to) lives in exactly one
 * place instead of being re-decided ad hoc per route. Returns null for
 * anything it doesn't recognize, so a route's catch block can
 * `return mapped ?? (() => { throw e; })()`-style re-throw unhandled
 * errors. Adopted by the routes this follow-up fixed (visibility,
 * fan-out, topical-gaps, citation-failure, competitive-benchmark,
 * wins); every other BrandAccessDeniedError catch site in the app is
 * UNCHANGED -- they still catch the same class and return 403
 * unconditionally, which remains correct for the "role_restricted"
 * case and is simply not yet updated for "not_found" (tracked, not
 * fixed here -- see docs/ops/post-launch-db-hardening.md section 46,
 * 7th follow-up, for the full list and the reasoning for not touching
 * all of them in this commit).
 */
export function brandAccessErrorResponse(e: unknown): Response | null {
  if (e instanceof BrandAccessDeniedError) {
    return e.reason === "role_restricted"
      ? Response.json({ error: "Brand access denied" }, { status: 403 })
      : Response.json({ error: "Not found" }, { status: 404 });
  }
  return null;
}

export class TierInsufficientError extends Error {
  public readonly requiredTier: string;
  constructor(requiredTier: string) {
    super(`${requiredTier} plan required`);
    this.name = "TierInsufficientError";
    this.requiredTier = requiredTier;
  }
}

export async function assertTier(organizationId: string, requiredTier: string): Promise<void> {
  const tier = await withRlsContext(organizationId, (tx) => effectiveTier(tx, organizationId));
  if (!isTierAtLeast(tier, requiredTier)) {
    throw new TierInsufficientError(requiredTier);
  }
}
