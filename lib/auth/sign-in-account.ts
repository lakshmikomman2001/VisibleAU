import { sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";

/**
 * Live invite test follow-ups (8 Nov), part 2 -- "this address has an account" means a sign-in account
 * (better-auth's auth_users) exists for it, with or without a profile. One rule, read here only, by the
 * invite route (which email to send, and where it points), the invite page, and the invite sign-up
 * (lib/auth/invite.ts inviteIsForNewAccount). Profiles only count for which one an invite points at.
 *
 * Only a boolean leaves the database (SELECT EXISTS): no account, id or profile is found by an address
 * here, so nothing can be granted from it -- the intent of tests/unit/auth/no-profile-lookup-by-email.test.ts,
 * which allows exactly these two functions to name an address against auth_users.
 */
export async function signInAccountExists(address: string): Promise<boolean> {
  const [row] = await serviceDb.execute<{ found: boolean }>(
    sql`SELECT EXISTS (SELECT 1 FROM auth_users WHERE lower(email) = lower(trim(${address}))) AS found`,
  );
  return row?.found === true;
}

/**
 * Part 2 -- an invite's token proves its address, as it does for an account made through the invite: the
 * token only ever left the app in the email to that address. Called only by the invite sign-in
 * (app/api/invites/[orgId]/[token]/sign-in), after better-auth has accepted the account's password for that
 * same address, with the address read from the invite row -- never one the browser sent. Records it where
 * better-auth's own link would: auth_users.email_verified. Never in bulk: the address is unique.
 */
export async function markInvitedAddressVerified(invitedAddress: string): Promise<boolean> {
  const updated = await serviceDb.execute<{ id: string }>(
    sql`UPDATE auth_users SET email_verified = true, updated_at = now()
        WHERE lower(email) = lower(trim(${invitedAddress})) AND NOT email_verified
        RETURNING id`,
  );
  return updated.length > 0;
}
