import { generateId } from "better-auth";
import { and, count, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { type DbClient, serviceDb } from "@/db/client";
import { ofLiveBrand } from "@/db/open-workspace";
import {
  auditSchedules,
  type OrgMember,
  organizations,
  orgMembers,
  reportDeliverySchedules,
  users,
} from "@/db/schema";
import { authAccounts, authUsers } from "@/db/schema/auth";
import { rowWithToken } from "@/lib/auth/invite-token";
import { PLACEHOLDER_EMAIL, withoutWorkspace } from "@/lib/auth/profile";
import { maskEmail } from "@/lib/email/mask";
import { ownersWhoCanManage } from "@/lib/governance/owners";
import { effectiveTier, hasUncancelledSubscription } from "@/lib/pricing/effective-tier";
import { seatLimitFor } from "@/lib/pricing/tiers";

/**
 * Team invites, for an account that has no workspace of its own.
 *
 * The app's model: an account has one profile row (`users`), and
 * `users.organization_id` is the one workspace the app opens for it
 * (getCurrentUser). `org_members` holds the account's role and brand
 * access in an organisation; an invite is an `org_members` row with a
 * token, waiting to be accepted. An account with its own open workspace
 * chooses (team follow-ups, item 5): "Switch to <org>" moves it into the
 * inviting one, as for an account with none, and its own stays as it is,
 * out of sight -- there's no switching back -- or "Not now" changes nothing.
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

/**
 * Accepts an invite for a profile, in one transaction, so the invite is never used up without the rest:
 * - a profile with no workspace it can open (its own is closed, or it was removed from it: follow-ups from
 *   6e27afc..01a6a8c, part 1) moves into the inviting one, with the invite's role, its placeholder
 *   address replaced by the account's real one: "joined";
 * - `leaveOpenWorkspace` (item 5, "Switch to <org>"): it moves even though its own workspace is open; that
 *   workspace, its owner membership and its plan are left exactly as they are: "joined";
 * - otherwise (its workspace is the inviting one, or it got an open one in the meantime) it stays where it
 *   is, its membership accepted: "accepted".
 * The caller has already checked the invite (token, organisation, expiry, the invited account, a verified
 * address).
 *
 * Refused, with nothing accepted or moved (Sri, 8 Nov): the inviting workspace has no free seat (decision
 * 7, every acceptance); switching would leave the profile's own workspace with no owner while it still has
 * a subscription, other people or schedules (decision 9); another request accepted the invite first.
 */
export async function joinWorkspaceByInvite(input: {
  memberId: string;
  organizationId: string;
  profileId: string;
  email: string;
  leaveOpenWorkspace?: boolean;
}): Promise<{ ok: true; outcome: "joined" | "accepted" } | { ok: false; refusal: InviteRefusal }> {
  try {
    return await serviceDb.transaction(async (tx) => {
      // Held first, so the workspace it's leaving can't change before that workspace is locked too.
      const [profile] = await tx
        .select({ organizationId: users.organizationId })
        .from(users)
        .where(eq(users.id, input.profileId))
        .for("update");
      await lockWorkspaces(tx, [
        input.organizationId,
        ...(input.leaveOpenWorkspace && profile ? [profile.organizationId] : []),
      ]);

      const [pending] = await tx
        .select({ id: orgMembers.id })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.id, input.memberId),
            eq(orgMembers.organizationId, input.organizationId),
            eq(orgMembers.userId, input.profileId),
            isNull(orgMembers.acceptedAt),
          ),
        )
        .for("update");
      if (!pending) throw new Refused(INVITE_UNUSABLE_REFUSAL);

      if (input.leaveOpenWorkspace && profile && profile.organizationId !== input.organizationId) {
        const onlyOwner = await onlyOwnerCantLeave(tx, input.profileId, profile.organizationId);
        if (onlyOwner) throw new Refused({ status: 409, code: "only_owner", error: onlyOwner });
      }
      if (!(await hasSeatForOneMore(tx, input.organizationId, input.memberId))) {
        throw new Refused({ status: 409, code: "no_seat", error: INVITE_NO_SEAT });
      }

      const now = new Date();
      const [accepted] = await tx
        .update(orgMembers)
        .set({ acceptedAt: now, isActive: true, invitationToken: null, updatedAt: now })
        .where(and(eq(orgMembers.id, input.memberId), isNull(orgMembers.acceptedAt)))
        .returning({ role: orgMembers.role });
      if (!accepted) throw new Refused(INVITE_UNUSABLE_REFUSAL);

      const [moved] = await tx
        .update(users)
        .set({
          organizationId: input.organizationId,
          role: accepted.role,
          email: sql`CASE WHEN ${users.email} = ${PLACEHOLDER_EMAIL} THEN ${input.email} ELSE ${users.email} END`,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, input.profileId),
            ne(users.organizationId, input.organizationId),
            input.leaveOpenWorkspace ? undefined : withoutWorkspace(),
          ),
        )
        .returning({ id: users.id });
      return { ok: true as const, outcome: moved ? ("joined" as const) : ("accepted" as const) };
    });
  } catch (e) {
    return refused(e);
  }
}

/** Decision 9, for the choice before "Switch to <org>": why it would be refused, or null. Changes nothing. */
export async function whySwitchIsBlocked(
  profileId: string,
  workspaceId: string,
): Promise<string | null> {
  return serviceDb.transaction((tx) => onlyOwnerCantLeave(tx, profileId, workspaceId));
}

/*
 * Team follow-ups (31 Oct), item 4 -- an invite to an address with no account yet: an org_members row with
 * no profile (user_id NULL, migration 0131), the address in invited_email, a token, still pending. Signing
 * up through its link (app/api/invites/[orgId]/[token]/sign-up/route.ts), or opening it signed in as an
 * account with that address (members/accept/route.ts), links the account to it by the token, in one
 * transaction. Nothing is looked up by an address alone: the token finds the invite, and the address is
 * only ever compared with the one the invite was sent to.
 */

/**
 * Follow-ups from d247ba7..f13411d, part 3 -- one answer for every token that can't be used: unknown,
 * expired, already used, or its workspace closed. The same status and body, and the same work (one read of
 * the workspace's invites, compared in constant time), so a response says nothing about whether a token was
 * ever real. Every route that takes a token answers with it: the sign-up page's preview, the sign-up, and
 * members/accept.
 */
export const INVITE_UNUSABLE =
  "This invitation link can't be used: it may have expired or already been used. Ask whoever invited you to send a new one.";

/** The status and body every unusable token gets. */
export const INVITE_UNUSABLE_REFUSAL = {
  status: 404,
  error: INVITE_UNUSABLE,
  code: "invite_unusable",
} as const satisfies InviteRefusal;

/** Sri, 8 Nov (decision 7): every acceptance re-checks the seats, and says this when there's none. */
export const INVITE_NO_SEAT = "This workspace has no free seats. Ask the owner to add a seat.";

/** One address, whatever its case or surrounding spaces. */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface InviteRefusal {
  status: 403 | 404 | 409 | 410;
  error: string;
  code?:
    | "wrong_account"
    | "existing_account"
    | "account_exists"
    | "already_member"
    | "no_seat"
    | "only_owner"
    | "invite_unusable";
}

class Refused extends Error {
  constructor(readonly refusal: InviteRefusal) {
    super(refusal.error);
  }
}

type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];

/**
 * The invite behind `token` in `organizationId`, or null. Never a database comparison of the token (a
 * b-tree lookup by it is the timing leak): it reads every invite of the workspace that holds a token and
 * compares each in constant time (lib/auth/invite-token.ts). `lock` holds those rows until the transaction
 * ends. Works on any transaction, RLS-scoped or not.
 */
export async function findInviteByToken(
  tx: DbClient,
  organizationId: string,
  token: string,
  lock: boolean,
): Promise<OrgMember | null> {
  const query = tx
    .select()
    .from(orgMembers)
    .where(
      and(eq(orgMembers.organizationId, organizationId), isNotNull(orgMembers.invitationToken)),
    );
  const rows = lock ? await query.for("update") : await query;
  return rowWithToken(rows, token);
}

/** The pending invite behind a token, optionally locked until the transaction ends -- or the one refusal. */
async function usableInvite(
  tx: Tx,
  organizationId: string,
  token: string,
  lock: boolean,
): Promise<OrgMember & { orgName: string }> {
  const [workspace] = await tx
    .select({ name: organizations.name, closedAt: organizations.deletedAt })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const invite = await findInviteByToken(tx, organizationId, token, lock);
  if (
    !workspace ||
    workspace.closedAt ||
    !invite ||
    invite.acceptedAt ||
    invite.expiresAt.getTime() < Date.now()
  ) {
    throw new Refused(INVITE_UNUSABLE_REFUSAL);
  }
  return { ...invite, orgName: workspace.name };
}

/**
 * Sri, 8 Nov (decision 7) -- every acceptance holds its workspace's row (SELECT ... FOR UPDATE) until it
 * commits, so two acceptances can't both take the last seat: the second waits, then counts the first.
 * Workspaces are locked in id order, so two transactions that each lock two of them can't deadlock.
 */
async function lockWorkspaces(tx: Tx, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) return;
  await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(inArray(organizations.id, unique))
    .orderBy(organizations.id)
    .for("update");
}

/**
 * Seats are taken when an invite is sent (members/invite/route.ts counts active members and pending
 * invites). Accepting checks again, in case the plan has shrunk since: a seat for one more active member
 * besides those already there. The caller holds the workspace's row (lockWorkspaces).
 */
async function hasSeatForOneMore(
  tx: Tx,
  organizationId: string,
  inviteId: string,
): Promise<boolean> {
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

/**
 * Sri, 8 Nov (decision 9) -- why `profileId` can't switch away from `workspaceId`, or null when it can. It
 * can't when it's that workspace's only owner who can manage it (lib/governance/owners.ts) and the
 * workspace still has a subscription that isn't cancelled, anyone else (an active member, or another
 * profile in it), a pending invite (not accepted, not expired: someone on their way in), or an active
 * audit or report schedule: leaving would strand them with nobody to manage them. An empty free workspace
 * can be left. Read-only; the caller decides whether to hold the workspace's row first.
 */
export async function onlyOwnerCantLeave(
  tx: Tx,
  profileId: string,
  workspaceId: string,
): Promise<string | null> {
  const [workspace] = await tx
    .select({ name: organizations.name, closedAt: organizations.deletedAt })
    .from(organizations)
    .where(eq(organizations.id, workspaceId));
  if (!workspace || workspace.closedAt) return null;

  // Owners who can manage it (lib/governance/owners.ts, part 3): another one there, and leaving is fine.
  const owners = await ownersWhoCanManage(tx, workspaceId);
  if (owners.some((o) => o.userId !== profileId)) return null;
  // Not an owner here (the role comes from the membership alone, part 1): leaving strands nobody.
  if (!owners.some((o) => o.userId === profileId)) return null;

  const paying = await hasUncancelledSubscription(tx, workspaceId);
  const [member] = await tx
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.organizationId, workspaceId),
        eq(orgMembers.isActive, true),
        or(isNull(orgMembers.userId), ne(orgMembers.userId, profileId)),
      ),
    )
    .limit(1);
  const [profileHere] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, workspaceId), ne(users.id, profileId)))
    .limit(1);
  const [auditSchedule] = await tx
    .select({ id: auditSchedules.id })
    .from(auditSchedules)
    .where(
      and(
        eq(auditSchedules.organizationId, workspaceId),
        eq(auditSchedules.status, "active"),
        ofLiveBrand(auditSchedules.brandId),
      ),
    )
    .limit(1);
  const [reportSchedule] = await tx
    .select({ id: reportDeliverySchedules.id })
    .from(reportDeliverySchedules)
    .where(
      and(
        eq(reportDeliverySchedules.organizationId, workspaceId),
        eq(reportDeliverySchedules.isActive, true),
        or(isNull(reportDeliverySchedules.brandId), ofLiveBrand(reportDeliverySchedules.brandId)),
      ),
    )
    .limit(1);
  // Part 3 (Sri, 8 Nov): a pending invite -- not accepted, not expired -- is someone on their way in, who'd
  // arrive in a workspace with no owner.
  const [pendingInvite] = await tx
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.organizationId, workspaceId),
        isNull(orgMembers.acceptedAt),
        gt(orgMembers.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (paying || member || profileHere || auditSchedule || reportSchedule) {
    return `You're the only owner of ${workspace.name}. Make someone else owner or cancel the subscription first.`;
  }
  if (pendingInvite) {
    return `You're the only owner of ${workspace.name}. Cancel the pending invites or make someone else owner first.`;
  }
  return null;
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
  /** Only compared with the invite's address: the account gets the invite's (display-only on the form). */
  email?: string;
  passwordHash: string;
}): Promise<{ ok: true; email: string; memberId: string } | { ok: false; refusal: InviteRefusal }> {
  try {
    return await serviceDb.transaction(async (tx) => {
      await lockWorkspaces(tx, [input.organizationId]);
      const invite = await usableInvite(tx, input.organizationId, input.token, true);
      if (invite.userId !== null) {
        throw new Refused({
          status: 409,
          code: "existing_account",
          error: "This invitation is for an existing account. Sign in to accept it.",
        });
      }
      if (!invite.invitedEmail) throw new Refused(INVITE_UNUSABLE_REFUSAL);
      if (input.email !== undefined && !sameAddress(input.email, invite.invitedEmail)) {
        throw new Refused({
          status: 403,
          code: "wrong_account",
          error: `This invitation is for ${maskEmail(invite.invitedEmail)}.`,
        });
      }
      if (!(await hasSeatForOneMore(tx, input.organizationId, invite.id))) {
        throw new Refused({ status: 409, code: "no_seat", error: INVITE_NO_SEAT });
      }

      // The invite row's address, never one sent by the browser (part 3).
      const email = invite.invitedEmail.trim().toLowerCase();
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
      if (!accepted) throw new Refused(INVITE_UNUSABLE_REFUSAL);
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
 * Refused when the invite can't be used, the workspace has no seat for a "joined" account, or the profile
 * is already in it.
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
      await lockWorkspaces(tx, [input.organizationId]);
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
      const now = new Date();
      // By the account's id, as getCurrentUser finds it.
      const [profile] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.clerkUserId, input.authUserId));
      if (!profile) {
        // Accepted here and now, so it needs a seat (decision 7). A profile's invite is accepted later,
        // through joinWorkspaceByInvite, which checks then.
        if (!(await hasSeatForOneMore(tx, input.organizationId, invite.id))) {
          throw new Refused({ status: 409, code: "no_seat", error: INVITE_NO_SEAT });
        }
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
