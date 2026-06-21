import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { organizations } from "./organizations";

export const auditExports = pgTable(
  "audit_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    format: text("format").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    fileSizeBytes: integer("file_size_bytes"),
    downloadCount: integer("download_count").default(0).notNull(),
  },
  (table) => ({
    auditFormatIdx: uniqueIndex("audit_exports_audit_format_idx").on(
      table.auditId,
      table.format,
    ),
  }),
);
