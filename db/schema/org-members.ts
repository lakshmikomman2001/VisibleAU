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
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("viewer"),
    brandAccess: jsonb("brand_access").$type<string[] | null>().default(null),
    invitedBy: uuid("invited_by").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    invitationToken: text("invitation_token").unique(),
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
  }),
);
