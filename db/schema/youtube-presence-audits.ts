import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const youtubePresenceAudits = pgTable(
  "youtube_presence_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    marketCode: text("market_code").notNull().default("AU_EN"),
    channelUrl: text("channel_url"),
    channelExists: boolean("channel_exists"),
    channelSubscriberCount: integer("channel_subscriber_count"),
    channelTotalVideos: integer("channel_total_videos"),
    longformVideoCount: integer("longform_video_count"),
    shortsCount: integer("shorts_count"),
    longformRatio: numeric("longform_ratio", { precision: 4, scale: 3 }),
    howtoVideoCount: integer("howto_video_count"),
    explainerVideoCount: integer("explainer_video_count"),
    brandTopicVideoCount: integer("brand_topic_video_count"),
    videosWithTranscript: integer("videos_with_transcript"),
    videosWithChapters: integer("videos_with_chapters"),
    avgChapterCount: numeric("avg_chapter_count", { precision: 4, scale: 1 }),
    avgDescriptionLength: integer("avg_description_length"),
    embeddingPagesCount: integer("embedding_pages_count"),
    embeddingPagesWithSchema: integer("embedding_pages_with_schema"),
    embeddingPagesWithTranscript: integer("embedding_pages_with_transcript"),
    anyVideoCitedInAudit: boolean("any_video_cited_in_audit"),
    citedVideoUrls: jsonb("cited_video_urls"),
    presenceScore: integer("presence_score"),
    gaps: jsonb("gaps"),
    auditedAt: timestamp("audited_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandIdx: index("youtube_brand_idx").on(t.brandId, t.auditedAt),
  }),
);
