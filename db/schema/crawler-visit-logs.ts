import {
  bigint,
  boolean,
  index,
  inet,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const crawlerVisitLogs = pgTable(
  "crawler_visit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
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
    // Task #46 (10th follow-up): native inet, not text -- migration 0024
    // converts the live column (TEXT -> INET), and 0025's own comment says
    // why: "source_ip is now INET (FIX-01), so the ::inet cast in
    // COALESCE is valid on both DBs" -- crawler_logs_dedup_idx below
    // literally cannot exist unless this column is already inet
    // (COALESCE(source_ip, '0.0.0.0'::inet) has no implicit text->inet
    // cast). Confirmed present on visibleau/visibleau_e2e already.
    // Drizzle's inet() is a pure string pass-through at the JS layer (see
    // ai-bot-ip-ranges.ts's cidr() comment) -- every existing read
    // (dns.reverse(), string split/reverse in
    // lib/agent-analytics/verify-crawler-hits.ts) and write is
    // unaffected. See docs/ops/post-launch-db-hardening.md section 46
    // (10th follow-up).
    sourceIp: inet("source_ip"),
    verificationStatus: text("verification_status"),
    verifiedVia: text("verified_via"),
    bytes: bigint("bytes", { mode: "number" }),
    ingestSource: text("ingest_source").notNull().default("visit_api"),
  },
  (t) => ({
    brandIdx: index("crawler_logs_brand_idx").on(t.brandId, t.visitedAt),
    crawlerIdx: index("crawler_logs_crawler_idx").on(t.crawlerName, t.visitedAt),
    verificationIdx: index("crawler_logs_verification_idx").on(
      t.brandId,
      t.verificationStatus,
      t.visitedAt,
    ),
    // crawler_logs_dedup_idx — psql-managed expression index, DO NOT DROP via drizzle-kit.
    // Definition (0025): UNIQUE (brand_id, crawler_name, visited_url, visited_at, COALESCE(source_ip, '0.0.0.0'::inet))
    // Drizzle cannot express COALESCE in uniqueIndex().on(), so this index lives in migrations only.
  }),
);
