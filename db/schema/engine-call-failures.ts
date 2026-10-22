import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { organizations } from "./organizations";

/**
 * Audit reliability, Part A -- every failed (engine, prompt) call,
 * additive (never overloads `citations`, whose every reader already
 * assumes a row IS a real, counted answer attempt -- a failure isn't
 * one, and giving it nullable columns there would mean auditing every
 * existing citations query for a missed WITHOUT-failures filter).
 * RLS via a direct organization_id column (brand_directory_listings'
 * own pattern), not citations' join-through-audits one -- this table
 * has the column, so there's no reason to pay for the EXISTS subquery.
 */
export const engineCallFailures = pgTable(
  "engine_call_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    engine: text("engine").notNull(),
    prompt: text("prompt").notNull(),
    // "Audits time out on Vercel" follow-up, item 2 -- same as
    // citations.promptIndex (see that column's own doc comment):
    // this call's position in the audit's prompt array, so a
    // replayed step after a timeout can't duplicate this row either.
    // Nullable, no backfill -- legacy rows are NULL and can't collide.
    promptIndex: integer("prompt_index"),
    isBrandedPrompt: boolean("is_branded_prompt").notNull(),
    errorClass: text("error_class", {
      enum: [
        "rate_limited",
        "overloaded",
        "timeout",
        "search_tool_error",
        "empty_response",
        "parse_error",
        "other",
      ],
    }).notNull(),
    // Truncated to 500 chars at write time (lib/llm/with-retry.ts),
    // never re-truncated here -- the column itself has no length cap.
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    // Part A, item 4: a response that came back (HTTP 200) with an
    // in-band tool error was still billed for its tokens/searches --
    // computed from that response's own usage, same as a successful
    // call. A call that threw before any response costs 0. Never
    // left NULL (there's always a real, if sometimes zero, answer).
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    auditIdx: index("engine_call_failures_audit_idx").on(table.auditId),
    orgIdx: index("engine_call_failures_org_idx").on(table.organizationId),
    // "Audits time out on Vercel" follow-up, item 2 -- see
    // citations.promptIndex's matching index for the full reasoning.
    auditEnginePromptIdxUniqueIdx: uniqueIndex(
      "engine_call_failures_audit_engine_prompt_idx_unique_idx",
    ).on(table.auditId, table.engine, table.promptIndex),
  }),
);
