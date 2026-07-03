// RLS ENABLED: tenant data — organization_id scoped.
// GAP 5 stretch: Google AI Mode — separate surface from Gemini.
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const googleAiModeResults = pgTable("google_ai_mode_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  prompt: text("prompt").notNull(),
  brandAppeared: boolean("brand_appeared").notNull(),
  brandPosition: integer("brand_position"),
  subQueriesShown: jsonb("sub_queries_shown"),
  rawResponse: text("raw_response"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
});
