import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const canaryPrompts = pgTable("canary_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptText: text("prompt_text").notNull(),
  engine: text("engine").notNull(),
  model: text("model").notNull(),
  lastResponseHash: text("last_response_hash").notNull(),
  lastResponseSummary: text("last_response_summary"),
  driftDetected: text("drift_detected").default("false").notNull(),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).defaultNow().notNull(),
  driftFirstSeenAt: timestamp("drift_first_seen_at", { withTimezone: true }),
});
