import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Follow-ups from d247ba7..f13411d, part 3 -- an invite's token is the only key to it (the public routes
 * under /api/invites take nothing else), so:
 * - it's 256 bits from the operating system's cryptographic random source (node:crypto randomBytes),
 *   URL-safe: 43 characters. nanoid(21), before, was 126 bits.
 * - it's compared in constant time: sameToken hashes both sides to the same length and compares them with
 *   timingSafeEqual, so how long a comparison takes says nothing about how much of a guess was right. The
 *   database is never asked to compare one (a b-tree lookup by the token would be the timing leak), so
 *   inviteRowsByToken reads a workspace's token-holding invites by its id, and compares each in here.
 * Tokens are still stored as they are (org_members.invitation_token); storing a hash is proposed in
 * db/proposals/invite-token-hash/, for Sri to decide.
 */

const TOKEN_BYTES = 32;

/** A new invite token: 256 random bits, base64url. */
export function newInviteToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Whether `given` is `stored`, taking the same time wherever they differ. */
export function sameToken(stored: string, given: string): boolean {
  return timingSafeEqual(digest(stored), digest(given));
}

/**
 * The one row among `rows` whose token is `token`, comparing every row (no early exit), so the time taken
 * depends on how many invites the workspace has, never on the token.
 */
export function rowWithToken<T extends { invitationToken: string | null }>(
  rows: readonly T[],
  token: string,
): T | null {
  let found: T | null = null;
  for (const row of rows) {
    const matches = row.invitationToken !== null && sameToken(row.invitationToken, token);
    if (matches && found === null) found = row;
  }
  return found;
}
