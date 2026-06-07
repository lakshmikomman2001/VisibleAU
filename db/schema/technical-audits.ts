import { index, jsonb, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const technicalAudits = pgTable(
  "technical_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditId: uuid("audit_id").references(() => audits.id),
    scoreRobots: numeric("score_robots", { precision: 5, scale: 2 }),
    scoreLlmsTxt: numeric("score_llms_txt", { precision: 5, scale: 2 }),
    scoreSchema: numeric("score_schema", { precision: 5, scale: 2 }),
    scoreMeta: numeric("score_meta", { precision: 5, scale: 2 }),
    scoreContent: numeric("score_content", { precision: 5, scale: 2 }),
    scoreBrandEntity: numeric("score_brand_entity", { precision: 5, scale: 2 }),
    scoreSignals: numeric("score_signals", { precision: 5, scale: 2 }),
    scoreAiDiscovery: numeric("score_ai_discovery", { precision: 5, scale: 2 }),
    scoreComposite: numeric("score_composite", { precision: 5, scale: 2 }),
    findings: jsonb("findings").default("{}").notNull(),
    crawledAt: timestamp("crawled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    auditIdx: index("technical_audits_audit_id_idx").on(table.auditId),
    brandCreatedIdx: index("technical_audits_brand_created_idx").on(
      table.brandId,
      table.createdAt,
    ),
  }),
);
