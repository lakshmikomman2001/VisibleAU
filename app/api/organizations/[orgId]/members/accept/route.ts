import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { organizations, orgMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { joinWorkspaceByInvite } from "@/lib/auth/invite";
import { findAccountProfile } from "@/lib/auth/profile";
import { auth } from "@/lib/auth/server";
import { isAuthUserEmailVerified } from "@/lib/auth/verified-email";

// Task #46 (15th follow-up): fixes the gaps the 14th follow-up's serviceDb
// audit documented without fixing (it only required Highs to be fixed).
//
// What changed:
// 1. Moved off `serviceDb` onto `db` with org context (`withRlsContext`) --
//    the invite's org-id check used to be a plain JS comparison after an
//    unscoped `serviceDb` read; now the SELECT itself is RLS-scoped to
//    `orgId`, so a token belonging to a different org returns zero rows at
//    the DATABASE level, not just an app-level check. Kept the explicit
//    `member.organizationId !== orgId` comparison too, as defence in
//    depth -- if RLS policy coverage on org_members is ever dropped or
//    misconfigured, this still catches it.
// 2. Added `expires_at` (migration 0042 / db/prod-fixes/0053-...) -- a raw
//    `invitation_token` no longer activates membership indefinitely.
// 3. Added a caller-identity check: the signed-in user must BE the
//    invited person. The invite is created by resolving an email to an
//    EXISTING `users` row at invite-send time (see members/invite/
//    route.ts) and storing that row's stable `userId` on the invite --
//    comparing `currentUser.id === member.userId` is a strictly more
//    precise version of "the signed-in user's email equals the invite
//    email" (it compares the actual resolved account, not a raw string,
//    and never requires storing or logging an email on this route at
//    all). Also requires the signed-in account's own email to be
//    VERIFIED on auth_users (same authoritative source as
//    `checkPlatformAdmin()`) -- without this, an attacker who registered
//    an account under the invited person's email before ever proving
//    they own that inbox could still pass the identity check once an org
//    owner (unaware of the squatter) sent the invite to that email.
//    Residual risk this does NOT close: that squatting happens at
//    members/invite's own email-lookup time, which is out of this
//    route's scope -- flagged for Sri, not fixed here.
// 4. Acceptance is atomic: the final UPDATE's WHERE clause re-checks
//    `accepted_at IS NULL` inside the same RLS transaction as the read,
//    so a double-submit race can't flip the same row twice -- the loser
//    gets zero affected rows back, not a second "success".
//
// An account with no workspace (its own was closed) can accept too: the
// inviting workspace becomes its workspace (lib/auth/invite.ts
// joinWorkspaceByInvite). One with its own open workspace keeps it -- the
// membership is recorded, as before. A closed inviting workspace's
// invites can't be accepted.
const ALREADY_USED =
  "This invitation has already been used. Ask your organization admin to send a new one.";

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!z.string().uuid().safeParse(orgId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token || token.length < 10)
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id)
    return NextResponse.json({ error: "Sign in to accept this invitation" }, { status: 401 });

  // No open workspace: the profile is still the account's, whatever its
  // workspace's state.
  const currentUser = await getCurrentUser();
  const profile = currentUser ?? (await findAccountProfile(session.user.id, session.user.email));

  const checked = await withRlsContext(orgId, async (tx) => {
    const [member] = await tx
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.invitationToken, token));

    if (!member || member.organizationId !== orgId)
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });

    const [invitingOrg] = await tx
      .select({ deletedAt: organizations.deletedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    if (invitingOrg?.deletedAt) {
      return NextResponse.json(
        { error: "This workspace has been closed, so its invitations can't be accepted." },
        { status: 410 },
      );
    }

    if (member.acceptedAt) {
      return NextResponse.json({ error: ALREADY_USED }, { status: 410 });
    }

    if (member.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This invitation has expired. Ask your organization admin to send a new one." },
        { status: 410 },
      );
    }

    if (profile?.id !== member.userId) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address" },
        { status: 403 },
      );
    }

    if (!(await isAuthUserEmailVerified(session.user.id))) {
      return NextResponse.json(
        { error: "Please verify your email address before accepting this invitation" },
        { status: 403 },
      );
    }

    // No workspace of its own: accepted below, with the move into this one.
    if (!currentUser) return { join: member };

    const [updated] = await tx
      .update(orgMembers)
      .set({
        acceptedAt: new Date(),
        isActive: true,
        invitationToken: null,
        updatedAt: new Date(),
      })
      .where(and(eq(orgMembers.id, member.id), isNull(orgMembers.acceptedAt)))
      .returning();

    if (!updated) {
      // Lost a double-submit race -- another request accepted it first,
      // between our SELECT and this UPDATE.
      return NextResponse.json({ error: ALREADY_USED }, { status: 410 });
    }

    return NextResponse.json({ accepted: true, memberId: updated.id });
  });
  if (checked instanceof NextResponse) return checked;

  const outcome = await joinWorkspaceByInvite({
    memberId: checked.join.id,
    organizationId: orgId,
    profileId: checked.join.userId,
    email: session.user.email,
  });
  if (outcome === "already_used") {
    return NextResponse.json({ error: ALREADY_USED }, { status: 410 });
  }
  return NextResponse.json({
    accepted: true,
    memberId: checked.join.id,
    joined: outcome === "joined",
  });
}
