import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const clientPortalInvites = pgTable("client_portal_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  inviteToken: text("invite_token").unique().notNull(),
  inviteeName: text("invitee_name"),
  inviteeEmail: text("invitee_email"),
  status: text("status").default("active").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isRevoked: boolean("is_revoked").default(false).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
