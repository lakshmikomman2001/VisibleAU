import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { audits } from "./audits";

export const comparisonPromptResults = pgTable(
  "comparison_prompt_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
    competitorDomain: text("competitor_domain").notNull(),
    prompt: text("prompt").notNull(),
    engine: text("engine").notNull(),
    brandWon: boolean("brand_won"),
    brandMentioned: boolean("brand_mentioned").notNull(),
    competitorMentioned: boolean("competitor_mentioned").notNull(),
    verdictSnippet: text("verdict_snippet"),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandIdx: index("comparison_brand_idx").on(table.brandId, table.runAt),
    auditIdx: index("comparison_audit_idx").on(table.auditId),
    competitorIdx: index("comparison_competitor_idx").on(
      table.brandId,
      table.competitorDomain,
      table.runAt,
    ),
  }),
);
