import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { organizations, orgMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  claimInviteForAccount,
  INVITE_ALREADY_USED,
  INVITE_EXPIRED,
  invitedAddress,
  inviteWentToAccountAddress,
  joinWorkspaceByInvite,
  sameAddress,
  whySwitchIsBlocked,
} from "@/lib/auth/invite";
import { findAccountProfile } from "@/lib/auth/profile";
import { auth } from "@/lib/auth/server";
import { isAuthUserEmailVerified, markAuthUserEmailVerified } from "@/lib/auth/verified-email";
import { maskEmail } from "@/lib/email/mask";

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
//
// 3 Nov: an unverified account (one with a session from before verification was
// required) whose invite was emailed to its own address is verified by accepting
// it: opening the emailed token proves the inbox. Sent to any other address, it
// still has to verify first.
//
// Team follow-ups (31 Oct), item 4: an invite sent to an address before it had an account (no profile) is
// opened by a signed-in account. With that address it becomes the account's, by the token
// (lib/auth/invite.ts claimInviteForAccount): with no profile, the account joins the workspace there and
// then; with one, the invite points at it and is accepted as below. Any other address is the wrong account.
//
// Team follow-ups (31 Oct), item 5: an account with its own open workspace (another one) used to get "You've
// joined the team" with nothing changed -- the membership was recorded, and the account stayed where it
// was. Now GET accepts nothing for it: it answers with a choice (choice: true, both workspaces' names, the
// expiry), and POST is "Switch to <org>": accepted, and the account moves into the inviting workspace as
// one with no workspace does. Its own workspace stays exactly as it is, out of sight: nothing switches back.
// "Not now" calls nothing; the invite stays open until it expires.
//
// Sri, 8 Nov: every acceptance -- joining with no workspace, "Switch to <org>", or accepting where the
// profile already is -- goes through joinWorkspaceByInvite, which holds the workspace's row, re-checks the
// seats (no free seat: refused, nothing moved), and won't let a workspace's only owner switch away while it
// still has a subscription, other people or schedules. The choice says so up front (switchBlocked).
const ALREADY_USED = INVITE_ALREADY_USED;

type Params = { params: Promise<{ orgId: string }> };

/** Accepts, or (for an account with its own open workspace) offers the choice. */
export async function GET(req: Request, { params }: Params) {
  return accept(req, params, "open");
}

/** "Switch to <org>": accepts and moves the account into the inviting workspace (item 5). */
export async function POST(req: Request, { params }: Params) {
  return accept(req, params, "switch");
}

async function accept(
  req: Request,
  params: Params["params"],
  mode: "open" | "switch",
): Promise<NextResponse> {
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
  const profile = currentUser ?? (await findAccountProfile(session.user.id));

  const checked = await withRlsContext(orgId, async (tx) => {
    const [member] = await tx
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.invitationToken, token));

    if (!member || member.organizationId !== orgId)
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });

    const [invitingOrg] = await tx
      .select({ name: organizations.name, deletedAt: organizations.deletedAt })
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
      return NextResponse.json({ error: INVITE_EXPIRED }, { status: 410 });
    }

    // Sent before this address had an account: this account's if the address is the invited one.
    if (member.userId === null && sameAddress(session.user.email, member.invitedEmail)) {
      return { claim: true as const };
    }

    if (member.userId === null || profile?.id !== member.userId) {
      // Team follow-ups, item 2: who's signed in and who the invite is for, both masked, so the page
      // can offer to sign out and continue as the right account.
      const invitedTo = await invitedAddress(member);
      return NextResponse.json(
        {
          error: "This invite was sent to a different email address",
          code: "wrong_account",
          signedInAs: maskEmail(session.user.email),
          invitedAs: invitedTo ? maskEmail(invitedTo) : null,
        },
        { status: 403 },
      );
    }

    const verified = await isAuthUserEmailVerified(session.user.id);
    if (!verified && !inviteWentToAccountAddress(profile, session.user.email)) {
      return NextResponse.json(
        { error: "Please verify your email address before accepting this invitation" },
        { status: 403 },
      );
    }

    // No workspace of its own: accepted below, with the move into this one.
    if (!currentUser) return { join: member, profileId: member.userId, provesAddress: !verified };

    // Its own open workspace, another one: a choice, unless this is "Switch to <org>".
    if (currentUser.organizationId !== orgId) {
      if (mode === "switch") {
        return {
          join: member,
          profileId: member.userId,
          provesAddress: !verified,
          leaveOpenWorkspace: true,
        };
      }
      return {
        choice: {
          orgName: invitingOrg?.name ?? "",
          role: member.role,
          ownWorkspaceName: currentUser.organization.name,
          expiresAt: member.expiresAt,
        },
        ownWorkspaceId: currentUser.organizationId,
        profileId: member.userId,
        provesAddress: !verified,
      };
    }

    // Already in this workspace: accepted where it is, below.
    return { join: member, profileId: member.userId, provesAddress: !verified };
  });
  if (checked instanceof NextResponse) return checked;

  if ("claim" in checked) {
    const claimed = await claimInviteForAccount({
      organizationId: orgId,
      token,
      authUserId: session.user.id,
      email: session.user.email,
      name: session.user.name ?? "",
    });
    if (!claimed.ok) {
      return NextResponse.json(
        {
          error: claimed.refusal.error,
          ...(claimed.refusal.code ? { code: claimed.refusal.code } : {}),
        },
        { status: claimed.refusal.status },
      );
    }
    // Now an invite for this account's profile: accepted the way any invite is.
    if (claimed.outcome === "claimed") return accept(req, params, mode);
    // Joined with a new profile. The token went only to this address, so opening it proves the inbox.
    if (!(await isAuthUserEmailVerified(session.user.id))) {
      await markAuthUserEmailVerified(session.user.id);
    }
    return NextResponse.json({ accepted: true, memberId: claimed.memberId, joined: true });
  }

  if ("choice" in checked) {
    // Opening the emailed token proves the inbox, whichever is chosen.
    if (checked.provesAddress) await markAuthUserEmailVerified(session.user.id);
    // Decision 9: said before "Switch" is pressed; POST checks again, holding the workspace's row.
    const switchBlocked = checked.ownWorkspaceId
      ? await whySwitchIsBlocked(checked.profileId, checked.ownWorkspaceId)
      : null;
    return NextResponse.json({
      choice: true,
      ...checked.choice,
      ...(switchBlocked ? { switchBlocked } : {}),
    });
  }

  const outcome = await joinWorkspaceByInvite({
    memberId: checked.join.id,
    organizationId: orgId,
    profileId: checked.profileId,
    email: session.user.email,
    leaveOpenWorkspace: "leaveOpenWorkspace" in checked,
  });
  if (!outcome.ok) {
    return NextResponse.json(
      {
        error: outcome.refusal.error,
        ...(outcome.refusal.code ? { code: outcome.refusal.code } : {}),
      },
      { status: outcome.refusal.status },
    );
  }
  if (checked.provesAddress) await markAuthUserEmailVerified(session.user.id);
  return NextResponse.json({
    accepted: true,
    memberId: checked.join.id,
    joined: outcome.outcome === "joined",
  });
}
