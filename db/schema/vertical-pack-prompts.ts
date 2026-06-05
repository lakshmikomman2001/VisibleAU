import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { verticalPacks } from "./vertical-packs";

export const verticalPackPrompts = pgTable("vertical_pack_prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: uuid("pack_id")
    .references(() => verticalPacks.id, { onDelete: "cascade" })
    .notNull(),
  promptTemplate: text("prompt_template").notNull(),
  rank: integer("rank").notNull(),
  category: text("category"),
  topic: text("topic"),
  expectedMentionType: text("expected_mention_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const verticalPackPromptsRelations = relations(verticalPackPrompts, ({ one }) => ({
  pack: one(verticalPacks, {
    fields: [verticalPackPrompts.packId],
    references: [verticalPacks.id],
  }),
}));
