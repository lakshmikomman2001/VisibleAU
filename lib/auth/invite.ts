import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations, orgMembers, users } from "@/db/schema";
import { authUsers } from "@/db/schema/auth";
import { PLACEHOLDER_EMAIL } from "@/lib/auth/profile";

/**
 * Team invites, for an account that has no workspace of its own.
 *
 * The app's model: an account has one profile row (`users`), and
 * `users.organization_id` is the one workspace the app opens for it
 * (getCurrentUser). `org_members` holds the account's role and brand
 * access in an organisation; an invite is an `org_members` row with a
 * token, waiting to be accepted. Accepting one while the account has its
 * own open workspace records the membership but leaves the account in
 * its own workspace (there's no switching between workspaces).
 */

/**
 * The profile an invite to `email` is for: the one stored with that
 * address, or -- when a sign-up never got as far as storing it (the
 * profile still holds the placeholder) -- the profile of the account
 * that signs in with it.
 */
export async function findInviteTarget(email: string): Promise<{ id: string } | null> {
  const [stored] = await serviceDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (stored) return stored;
  const [byAccount] = await serviceDb
    .select({ id: users.id })
    .from(users)
    .innerJoin(authUsers, eq(authUsers.id, users.clerkUserId))
    .where(
      and(
        eq(users.email, PLACEHOLDER_EMAIL),
        sql`lower(${authUsers.email}) = lower(trim(${email}))`,
      ),
    );
  return byAccount ?? null;
}

/**
 * 3 Nov -- whether an invite to this profile was emailed to the account's own
 * address, as findInviteTarget matched it: the profile stored with that address,
 * or the placeholder and the account's address. Then opening its token proves the
 * address: the token only leaves the app in that email.
 */
export function inviteWentToAccountAddress(
  profile: { email: string } | null,
  accountEmail: string,
): boolean {
  if (!profile) return false;
  return (
    profile.email === PLACEHOLDER_EMAIL ||
    profile.email.trim().toLowerCase() === accountEmail.trim().toLowerCase()
  );
}

/**
 * Team follow-ups (31 Oct), item 2 -- the address an invite was sent to, for telling someone signed in with
 * a different account who it's for (masked before it leaves the server). The address stored with the
 * invite (migration 0130); for an invite sent before that, the invited profile's own address, found by its
 * id. null when neither is known.
 */
export async function invitedAddress(invite: {
  invitedEmail: string | null;
  userId: string;
}): Promise<string | null> {
  if (invite.invitedEmail) return invite.invitedEmail;
  const [profile] = await serviceDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, invite.userId));
  return profile && profile.email !== PLACEHOLDER_EMAIL ? profile.email : null;
}

export type JoinOutcome = "joined" | "accepted" | "already_used";

/**
 * Accepts an invite for a profile whose own workspace is closed -- so it
 * has none -- and makes the inviting organisation its workspace: the
 * profile moves there with the invite's role (the role the app falls back
 * to, and the one notification emails read), and a placeholder address is
 * replaced with the account's real one. One transaction, so the invite is
 * never used up without the move. The caller has already checked the
 * invite (token, organisation, expiry, the invited account, a verified
 * address).
 *
 * "accepted": the profile got an open workspace in the meantime, so it
 * stays there, as when accepting with one. "already_used": another
 * request accepted this invite first.
 */
export async function joinWorkspaceByInvite(input: {
  memberId: string;
  organizationId: string;
  profileId: string;
  email: string;
}): Promise<JoinOutcome> {
  return serviceDb.transaction(async (tx) => {
    const now = new Date();
    const [accepted] = await tx
      .update(orgMembers)
      .set({ acceptedAt: now, isActive: true, invitationToken: null, updatedAt: now })
      .where(
        and(
          eq(orgMembers.id, input.memberId),
          eq(orgMembers.organizationId, input.organizationId),
          eq(orgMembers.userId, input.profileId),
          isNull(orgMembers.acceptedAt),
        ),
      )
      .returning({ role: orgMembers.role });
    if (!accepted) return "already_used";

    const closedWorkspaces = tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(isNotNull(organizations.deletedAt));
    const [moved] = await tx
      .update(users)
      .set({
        organizationId: input.organizationId,
        role: accepted.role,
        email: sql`CASE WHEN ${users.email} = ${PLACEHOLDER_EMAIL} THEN ${input.email} ELSE ${users.email} END`,
        updatedAt: now,
      })
      .where(and(eq(users.id, input.profileId), inArray(users.organizationId, closedWorkspaces)))
      .returning({ id: users.id });
    return moved ? "joined" : "accepted";
  });
}
