import { createHash, randomBytes } from "node:crypto";

/**
 * An invite's token is the only key to it (the public routes under /api/invites take nothing else).
 *
 * Follow-ups from d247ba7..f13411d, part 3: 256 bits from the operating system's cryptographic random
 * source (node:crypto randomBytes), URL-safe: 43 characters. nanoid(21), before, was 126 bits.
 *
 * Follow-ups from 6e27afc..01a6a8c, part 4 (Sri, 8 Nov; migration 0134): stored only as its SHA-256 hash
 * (org_members.invitation_token_hash). The token itself exists only in the link that was emailed; a backup,
 * a query log or someone with database access can't use what's stored. To find an invite, the app hashes
 * the token it's given and looks the hash up (lib/auth/invite.ts findInviteByToken).
 *
 * Why the lookup can be the database's own comparison of hashes, by its index, rather than a constant-time
 * one in here: how long that comparison takes can only say how many leading characters of two hashes
 * agree. Making that useful would mean producing tokens whose hashes share a chosen beginning with the
 * stored one -- the search SHA-256 exists to make hopeless -- and it reveals nothing about the token, which
 * is 256 random bits. Each guess also counts against the per-caller and per-token rate limits
 * (lib/auth/invite-rate-limit.ts).
 */

const TOKEN_BYTES = 32;

/** A new invite token: 256 random bits, base64url. */
export function newInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The hash stored for a token: SHA-256 of its UTF-8 bytes, as 64 lower-case hex characters -- the same as
 * Postgres's encode(sha256(convert_to(token, 'UTF8')), 'hex'), which migration 0134 used for the tokens it
 * found, so links emailed before it (21 characters or 43) keep working.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
