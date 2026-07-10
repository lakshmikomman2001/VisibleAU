import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const dataResidencyLog = pgTable(
  "data_residency_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    dataType: text("data_type").notNull(),
    storageRegion: text("storage_region").notNull(),
    provider: text("provider").notNull(),
    retentionPeriod: text("retention_period").notNull().default("12 months"),
    encryptionStatus: text("encryption_status")
      .notNull()
      .default("AES-256 at rest, TLS 1.3 in transit"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgDataTypeUnique: uniqueIndex("data_residency_org_type_idx").on(
      table.organizationId,
      table.dataType,
    ),
  }),
);
