import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { clientPortalInvites } from "./client-portal-invites";
import { organizations } from "./organizations";

export const clientPortalViews = pgTable("client_portal_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteId: uuid("invite_id").references(() => clientPortalInvites.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).defaultNow().notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  pageViewed: text("page_viewed").default("overview").notNull(),
});
