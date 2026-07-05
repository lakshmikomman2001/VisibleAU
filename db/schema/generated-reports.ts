import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { reportTemplates } from "./report-templates";

export const generatedReports = pgTable(
  "generated_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "set null" }),
    templateId: uuid("template_id")
      .references(() => reportTemplates.id, { onDelete: "set null" }),
    reportType: text("report_type").notNull(),
    periodLabel: text("period_label"),
    narrativeText: text("narrative_text").notNull(),
    headline: text("headline").notNull(),
    keyWins: jsonb("key_wins"),
    keyGaps: jsonb("key_gaps"),
    fanOutSummary: jsonb("fan_out_summary"),
    topicalSummary: jsonb("topical_summary"),
    mentionSourceSummary: jsonb("mention_source_summary"),
    linkedinSummary: jsonb("linkedin_summary"),
    consensusSummary: jsonb("consensus_summary"),
    entityHomeSummary: jsonb("entity_home_summary"),
    knowledgePanelSummary: jsonb("knowledge_panel_summary"),
    confidenceNotes: jsonb("confidence_notes"),
    pdfUrl: text("pdf_url"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandTypeIdx: index("reports_brand_type_idx").on(
      t.brandId,
      t.reportType,
      t.createdAt,
    ),
  }),
);
