import { bigint, boolean, index, pgTable, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const crawlerVisitLogs = pgTable("crawler_visit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  crawlerName: text("crawler_name").notNull(),
  crawlerTier: text("crawler_tier").notNull(),
  visitedUrl: text("visited_url").notNull(),
  statusCode: integer("status_code"),
  responseTimeMs: integer("response_time_ms"),
  errorType: text("error_type"),
  rawLogLine: text("raw_log_line"),
  isActiveAgent: boolean("is_active_agent").notNull().default(false),
  referrerAiSession: text("referrer_ai_session"),
  visitPurpose: text("visit_purpose"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sourceIp: text("source_ip"),
  verificationStatus: text("verification_status"),
  verifiedVia: text("verified_via"),
  bytes: bigint("bytes", { mode: "number" }),
  ingestSource: text("ingest_source").notNull().default("visit_api"),
}, (t) => ({
  brandIdx: index("crawler_logs_brand_idx").on(t.brandId, t.visitedAt),
  crawlerIdx: index("crawler_logs_crawler_idx").on(t.crawlerName, t.visitedAt),
  verificationIdx: index("crawler_logs_verification_idx").on(t.brandId, t.verificationStatus, t.visitedAt),
  // crawler_logs_dedup_idx — psql-managed expression index, DO NOT DROP via drizzle-kit.
  // Definition (0025): UNIQUE (brand_id, crawler_name, visited_url, visited_at, COALESCE(source_ip, '0.0.0.0'::inet))
  // Drizzle cannot express COALESCE in uniqueIndex().on(), so this index lives in migrations only.
}));
