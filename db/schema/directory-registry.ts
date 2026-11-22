import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { DirectoryKind, DirectoryRelevance } from "@/lib/directories/registry";

/**
 * S00 part 5 (22 Nov; migration 0153, directory registry; LLD 7.7, 8.8.3): every directory the product recognises,
 * one row per domain pattern ("hipages.com.au", "linkedin.com/company"), grouped into directories by
 * directory_key. Global: no organization_id, no RLS (like vertical_packs). Read through
 * lib/directories/registry-store.ts; seeded by the migration with lib/directories/registry.ts's
 * DIRECTORY_REGISTRY_SEED (a test holds the two identical).
 */
export const directoryRegistry = pgTable("directory_registry", {
  domainPattern: text("domain_pattern").primaryKey(),
  directoryKey: text("directory_key").notNull(),
  name: text("name").notNull(),
  kind: text("kind").$type<DirectoryKind>().notNull(),
  market: text("market").$type<"au" | "us">().notNull().default("au"),
  appliesTo: text("applies_to").$type<DirectoryRelevance>().notNull(),
  profileUrlHint: text("profile_url_hint"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
