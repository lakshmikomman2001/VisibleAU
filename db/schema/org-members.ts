import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    // Migration 0131 (team follow-ups, item 4) -- NULL for an invite to an address with no account yet: a
    // pending invite with invited_email and a token (org_members_profile_or_pending_invite). Signing up
    // through its link sets it, by the token (app/api/invites/[orgId]/[token]/sign-up/route.ts).
    userId: uuid("user_id").references(() => users.id),
    role: text("role").notNull().default("viewer"),
    brandAccess: jsonb("brand_access").$type<string[] | null>().default(null),
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    // Migration 0134 -- SHA-256 of the invite's token, as 64 hex characters (lib/auth/invite-token.ts). The
    // token itself is only in the emailed link. Cleared when the invite is accepted. (The plain column it
    // replaced isn't named here any more, so migration 0141 can drop it once this code is live.)
    invitationTokenHash: text("invitation_token_hash"),
    // Migration 0130 (team follow-ups, item 1) -- the address the invite was emailed to, as the inviter typed
    // it, written with the invite and on each resend. The invitee's profile is in their own workspace, which
    // this one's RLS context can't read, so this is how a pending invite says who it's for. NULL for an
    // owner's own membership and for rows from before 0130.
    invitedEmail: text("invited_email"),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex("org_members_org_user_idx").on(table.organizationId, table.userId),
    // Migration 0134: an invite is found by its token's hash, so each hash names one invite.
    invitationTokenHashUnique: uniqueIndex("org_members_invitation_token_hash_idx")
      .on(table.invitationTokenHash)
      .where(sql`${table.invitationTokenHash} IS NOT NULL`),
    // Migration 0131: one invite per address per workspace while it has no account.
    pendingAddressUnique: uniqueIndex("org_members_pending_address_idx")
      .on(table.organizationId, sql`lower(${table.invitedEmail})`)
      .where(sql`${table.userId} IS NULL`),
  }),
);
