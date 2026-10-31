import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serviceDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { authMembers, authOrganizations } from "@/db/schema/auth";
import { workspaceSlug } from "@/lib/auth/paths";
import { auth, provisionAppWorkspace } from "@/lib/auth/server";
import {
  failureReason,
  logWorkspaceFailure,
  WORKSPACE_ERROR_STATUS,
  WORKSPACE_NAME_MAX,
  type WorkspaceResult,
  WorkspaceStepError,
  workspaceErrorMessage,
} from "@/lib/auth/workspace-errors";
import { isClosedAuthOrg } from "@/lib/auth/workspace-state";

/**
 * Making a workspace, and finishing one a half-done attempt left behind.
 *
 * The organisation's id goes from the create step to the finish step
 * explicitly. It used to be looked up afterwards as "the session's active
 * organisation" -- which is never stored (auth_sessions has no
 * active_organization_id column, so better-auth's setActive writes
 * nothing) -- falling back to whichever of the account's memberships
 * came first. For an account with an earlier half-finished organisation
 * that was the wrong one: "Org not found" (30 Oct, production).
 */

export type WorkspaceUser = { id: string; email: string; name: string };

/** The better-auth organisation `user` created (owns) with this id. */
async function ownedAuthOrg(userId: string, authOrgId: string) {
  const [org] = await serviceDb
    .select({
      id: authOrganizations.id,
      name: authOrganizations.name,
      metadata: authOrganizations.metadata,
    })
    .from(authMembers)
    .innerJoin(authOrganizations, eq(authMembers.organizationId, authOrganizations.id))
    .where(
      and(
        eq(authMembers.userId, userId),
        eq(authMembers.organizationId, authOrgId),
        eq(authMembers.role, "owner"),
      ),
    )
    .limit(1);
  return org ?? null;
}

/** The latest organisation of this name `user` already created, if any
 * -- and not closed: a closed one is never reused. */
async function ownedAuthOrgNamed(userId: string, name: string) {
  const named = await serviceDb
    .select({
      id: authOrganizations.id,
      metadata: authOrganizations.metadata,
      appClosedAt: organizations.deletedAt,
    })
    .from(authMembers)
    .innerJoin(authOrganizations, eq(authMembers.organizationId, authOrganizations.id))
    .leftJoin(organizations, eq(organizations.clerkOrgId, authOrganizations.id))
    .where(
      and(
        eq(authMembers.userId, userId),
        eq(authMembers.role, "owner"),
        sql`lower(trim(${authOrganizations.name})) = lower(${name})`,
      ),
    )
    .orderBy(desc(authMembers.createdAt));
  const org = named.find((o) => o.appClosedAt === null && !isClosedAuthOrg(o.metadata));
  return org ? { id: org.id } : null;
}

function failed(error: unknown): WorkspaceResult {
  const step = error instanceof WorkspaceStepError ? error.step : "app_org";
  logWorkspaceFailure(step, failureReason(error), "route");
  return {
    ok: false,
    code: error instanceof WorkspaceStepError ? error.code : "server_error",
  };
}

/**
 * Finishes the app's side of a better-auth organisation `user` created:
 * the workspace, their profile and the rest (provisionAppWorkspace).
 * Safe to repeat.
 */
export async function finishWorkspace(
  user: WorkspaceUser,
  authOrgId: string,
): Promise<WorkspaceResult> {
  let org: Awaited<ReturnType<typeof ownedAuthOrg>>;
  try {
    org = await ownedAuthOrg(user.id, authOrgId);
  } catch (e) {
    return failed(new WorkspaceStepError("check_membership", failureReason(e)));
  }
  if (!org) {
    return failed(new WorkspaceStepError("check_membership", "not_owner", "not_owner"));
  }
  if (isClosedAuthOrg(org.metadata)) {
    return failed(new WorkspaceStepError("check_membership", "closed", "workspace_closed"));
  }
  try {
    const { organizationId } = await provisionAppWorkspace({
      authOrgId: org.id,
      orgName: org.name,
      authUserId: user.id,
      email: user.email,
      name: user.name,
    });
    return { ok: true, organizationId };
  } catch (e) {
    return failed(e);
  }
}

/**
 * A new workspace named `rawName` for `user`, or -- when a half-finished
 * attempt already made a better-auth organisation of that name -- that one,
 * finished, rather than a duplicate.
 */
export async function createWorkspace(
  requestHeaders: Headers,
  user: WorkspaceUser,
  rawName: string,
): Promise<WorkspaceResult> {
  const name = rawName.trim();
  if (!name || name.length > WORKSPACE_NAME_MAX) return { ok: false, code: "invalid_name" };

  let authOrgId: string | null = null;
  try {
    authOrgId = (await ownedAuthOrgNamed(user.id, name))?.id ?? null;
    // A slug only collides when its random suffix does: try a new one.
    for (let attempt = 0; attempt < 3 && !authOrgId; attempt++) {
      try {
        const created = await auth.api.createOrganization({
          headers: requestHeaders,
          body: { name, slug: workspaceSlug(name, randomUUID().slice(0, 6)) },
        });
        authOrgId = created.id;
      } catch (e) {
        if (failureReason(e) !== "auth_organization_already_exists") {
          throw new WorkspaceStepError("create_auth_org", failureReason(e));
        }
      }
    }
  } catch (e) {
    return failed(
      e instanceof WorkspaceStepError
        ? e
        : new WorkspaceStepError("create_auth_org", failureReason(e)),
    );
  }
  if (!authOrgId) {
    return failed(new WorkspaceStepError("create_auth_org", "slug_taken", "name_taken"));
  }
  return finishWorkspace(user, authOrgId);
}

/** The routes' answer: a message the person can act on, and its code. */
export function workspaceResponse(result: WorkspaceResult): NextResponse {
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json(
    { error: workspaceErrorMessage(result.code), code: result.code },
    { status: WORKSPACE_ERROR_STATUS[result.code] },
  );
}
