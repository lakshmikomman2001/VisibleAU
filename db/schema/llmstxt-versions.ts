import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const llmstxtVersions = pgTable("llmstxt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  content: text("content").notNull(),
  depthScore: integer("depth_score").notNull(),
  hostedUrl: text("hosted_url"),
  isCurrent: boolean("is_current").notNull().default(true),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
});
