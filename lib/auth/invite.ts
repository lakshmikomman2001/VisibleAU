import { generateId } from "better-auth";
import { and, count, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { type OrgMember, organizations, orgMembers, users } from "@/db/schema";
import { authAccounts, authUsers } from "@/db/schema/auth";
import { PLACEHOLDER_EMAIL } from "@/lib/auth/profile";
import { maskEmail } from "@/lib/email/mask";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { seatLimitFor } from "@/lib/pricing/tiers";

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
  userId: string | null;
}): Promise<string | null> {
  if (invite.invitedEmail) return invite.invitedEmail;
  if (!invite.userId) return null;
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

/*
 * Team follow-ups (31 Oct), item 4 -- an invite to an address with no account yet: an org_members row with
 * no profile (user_id NULL, migration 0131), the address in invited_email, a token, still pending. Signing
 * up through its link (app/api/invites/[orgId]/[token]/sign-up/route.ts), or opening it signed in as an
 * account with that address (members/accept/route.ts), links the account to it by the token, in one
 * transaction. Nothing is looked up by an address alone: the token finds the invite, and the address is
 * only ever compared with the one the invite was sent to.
 */

export const INVITE_NOT_FOUND = "Invalid or expired invitation";
export const INVITE_ALREADY_USED =
  "This invitation has already been used. Ask your organization admin to send a new one.";
export const INVITE_EXPIRED =
  "This invitation has expired. Ask your organization admin to send a new one.";
export const INVITE_WORKSPACE_CLOSED =
  "This workspace has been closed, so its invitations can't be accepted.";
export const INVITE_NO_SEAT =
  "This workspace has no free seat for you yet. Ask whoever invited you to free one or change plans.";

/** One address, whatever its case or surrounding spaces. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface InviteRefusal {
  status: 403 | 404 | 409 | 410;
  error: string;
  code?: "wrong_account" | "existing_account" | "account_exists" | "already_member";
}

class Refused extends Error {
  constructor(readonly refusal: InviteRefusal) {
    super(refusal.error);
  }
}

type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

/** The pending invite behind a token, optionally locked until the transaction ends -- or why it can't be used. */
async function usableInvite(
  tx: Tx,
  organizationId: string,
  token: string,
  lock: boolean,
): Promise<OrgMember & { orgName: string }> {
  const query = tx
    .select({ invite: orgMembers, orgName: organizations.name, closedAt: organizations.deletedAt })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
    .where(
      and(eq(orgMembers.invitationToken, token), eq(orgMembers.organizationId, organizationId)),
    );
  const [row] = lock ? await query.for("update", { of: orgMembers }) : await query;
  if (!row) throw new Refused({ status: 404, error: INVITE_NOT_FOUND });
  if (row.closedAt) throw new Refused({ status: 410, error: INVITE_WORKSPACE_CLOSED });
  if (row.invite.acceptedAt) throw new Refused({ status: 410, error: INVITE_ALREADY_USED });
  if (row.invite.expiresAt.getTime() < Date.now())
    throw new Refused({ status: 410, error: INVITE_EXPIRED });
  return { ...row.invite, orgName: row.orgName };
}

/**
 * Seats are taken when an invite is sent (members/invite/route.ts counts active members and pending
 * invites); this is the check when one with no account yet is accepted, in case the plan has shrunk since:
 * a seat for one more active member besides those already there. Takes the same lock as sending an invite.
 */
async function seatForOneMore(tx: Tx, organizationId: string, inviteId: string): Promise<boolean> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seats:${organizationId}`}))`);
  const seats = seatLimitFor(await effectiveTier(tx, organizationId));
  const [{ active }] = await tx
    .select({ active: count() })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.organizationId, organizationId),
        eq(orgMembers.isActive, true),
        ne(orgMembers.id, inviteId),
      ),
    );
  return active < seats;
}

function refused(e: unknown): { ok: false; refusal: InviteRefusal } {
  if (e instanceof Refused) return { ok: false, refusal: e.refusal };
  throw e;
}

export type InvitePreview =
  | { ok: true; orgName: string; role: string; forNewAccount: true; email: string }
  | { ok: true; orgName: string; role: string; forNewAccount: false }
  | { ok: false; refusal: InviteRefusal };

/**
 * What the sign-up page shows for an invite link: the workspace and role, and -- only for an invite to an
 * address with no account -- that address, to fill in and lock. Whoever holds the token got it in the email
 * sent to that address.
 */
export async function previewInvite(organizationId: string, token: string): Promise<InvitePreview> {
  try {
    const invite = await serviceDb.transaction((tx) =>
      usableInvite(tx, organizationId, token, false),
    );
    return invite.userId === null && invite.invitedEmail
      ? {
          ok: true,
          orgName: invite.orgName,
          role: invite.role,
          forNewAccount: true,
          email: invite.invitedEmail,
        }
      : { ok: true, orgName: invite.orgName, role: invite.role, forNewAccount: false };
  } catch (e) {
    return refused(e);
  }
}

/**
 * Signing up through an invite to an address with no account: the account (verified -- the address is the
 * invited one, and the token only left the app in the email to it), its password, its profile in the
 * inviting workspace with the invited role, and the accepted membership, all in one transaction keyed by the
 * token. No workspace of its own is made. Refused, with nothing written, when the address isn't the invited
 * one, an account already has it, the invite can't be used, or the workspace has no seat.
 *
 * `passwordHash` is better-auth's own hash of the password (better-auth/crypto), so its sign-in accepts it.
 */
export async function signUpByInvite(input: {
  organizationId: string;
  token: string;
  name: string;
  email: string;
  passwordHash: string;
}): Promise<{ ok: true; email: string; memberId: string } | { ok: false; refusal: InviteRefusal }> {
  try {
    return await serviceDb.transaction(async (tx) => {
      const invite = await usableInvite(tx, input.organizationId, input.token, true);
      if (invite.userId !== null) {
        throw new Refused({
          status: 409,
          code: "existing_account",
          error: "This invitation is for an existing account. Sign in to accept it.",
        });
      }
      if (!sameAddress(input.email, invite.invitedEmail)) {
        throw new Refused({
          status: 403,
          code: "wrong_account",
          error: `This invitation is for ${maskEmail(invite.invitedEmail ?? "")}.`,
        });
      }
      if (!(await seatForOneMore(tx, input.organizationId, invite.id))) {
        throw new Refused({ status: 409, error: INVITE_NO_SEAT });
      }

      const email = input.email.trim().toLowerCase();
      const now = new Date();
      const accountId = generateId();
      const [account] = await tx
        .insert(authUsers)
        .values({
          id: accountId,
          name: input.name,
          email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: authUsers.email })
        .returning({ id: authUsers.id });
      if (!account) {
        throw new Refused({
          status: 409,
          code: "account_exists",
          error: "An account already uses this address. Sign in to accept the invitation.",
        });
      }
      await tx.insert(authAccounts).values({
        id: generateId(),
        accountId,
        providerId: "credential",
        userId: accountId,
        password: input.passwordHash,
        createdAt: now,
        updatedAt: now,
      });
      const [profile] = await tx
        .insert(users)
        .values({
          clerkUserId: accountId,
          organizationId: input.organizationId,
          email,
          name: input.name,
          role: invite.role,
        })
        .returning({ id: users.id });
      const [accepted] = await tx
        .update(orgMembers)
        .set({
          userId: profile.id,
          acceptedAt: now,
          isActive: true,
          invitationToken: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(orgMembers.id, invite.id),
            isNull(orgMembers.userId),
            isNull(orgMembers.acceptedAt),
          ),
        )
        .returning({ id: orgMembers.id });
      if (!accepted) throw new Refused({ status: 410, error: INVITE_ALREADY_USED });
      return { ok: true as const, email, memberId: accepted.id };
    });
  } catch (e) {
    return refused(e);
  }
}

/**
 * An invite sent to an address before it had an account, opened by a signed-in account with that address
 * (the caller has compared them): it becomes this account's, by the token, in one transaction.
 * - "joined": the account had no profile (it signed up some other way and made no workspace). Its profile
 *   is made in the inviting workspace with the invited role, and the invite accepted.
 * - "claimed": it has a profile. The invite now points at it, still pending; accepting goes on as for any
 *   invite (members/accept/route.ts).
 * Refused when the invite can't be used, the workspace has no seat, or the profile is already in it.
 */
export async function claimInviteForAccount(input: {
  organizationId: string;
  token: string;
  authUserId: string;
  email: string;
  name: string;
}): Promise<
  | { ok: true; outcome: "joined" | "claimed"; memberId: string }
  | { ok: false; refusal: InviteRefusal }
> {
  try {
    return await serviceDb.transaction(async (tx) => {
      const invite = await usableInvite(tx, input.organizationId, input.token, true);
      if (invite.userId !== null) {
        return { ok: true as const, outcome: "claimed" as const, memberId: invite.id };
      }
      if (!sameAddress(input.email, invite.invitedEmail)) {
        throw new Refused({
          status: 403,
          code: "wrong_account",
          error: "This invite was sent to a different email address",
        });
      }
      if (!(await seatForOneMore(tx, input.organizationId, invite.id))) {
        throw new Refused({ status: 409, error: INVITE_NO_SEAT });
      }
      const now = new Date();
      // By the account's id, as getCurrentUser finds it.
      const [profile] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, input.authUserId));
      if (!profile) {
        const [created] = await tx
          .insert(users)
          .values({
            clerkUserId: input.authUserId,
            organizationId: input.organizationId,
            email: input.email.trim().toLowerCase(),
            name: input.name,
            role: invite.role,
          })
          .returning({ id: users.id });
        await tx
          .update(orgMembers)
          .set({
            userId: created.id,
            acceptedAt: now,
            isActive: true,
            invitationToken: null,
            updatedAt: now,
          })
          .where(eq(orgMembers.id, invite.id));
        return { ok: true as const, outcome: "joined" as const, memberId: invite.id };
      }
      const [already] = await tx
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.organizationId, input.organizationId),
            eq(orgMembers.userId, profile.id),
          ),
        );
      if (already) {
        // Invited twice, once before the account existed: that one is spent, and frees its seat.
        await tx.delete(orgMembers).where(eq(orgMembers.id, invite.id));
        return {
          ok: false as const,
          refusal: {
            status: 409 as const,
            code: "already_member" as const,
            error:
              "You're already a member of this workspace, or have a newer invitation to it. Open the latest invitation email.",
          },
        };
      }
      await tx
        .update(orgMembers)
        .set({ userId: profile.id, updatedAt: now })
        .where(eq(orgMembers.id, invite.id));
      return { ok: true as const, outcome: "claimed" as const, memberId: invite.id };
    });
  } catch (e) {
    return refused(e);
  }
}
