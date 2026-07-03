export interface CitationDiagnosis {
  patternKey: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  competitorCited?: string;
  remediation?: string;
  topicCluster?: string;
}

export interface SovEntry {
  competitorDomain: string;
  promptCategory: string;
  engine: string;
  brandShare: number;
  competitorShare: number;
  totalPrompts: number;
  sampleQuality: string;
}

export interface ArchetypeResult {
  brandArchetype:
    | "recognised_authority"
    | "known_but_untrusted"
    | "niche_authority"
    | "invisible";
  mentionRate: number;
  citationRate: number;
  mentionSourceRatio: number | null;
}

export interface MarketCompetitionResult {
  marketCompetitionLabel:
    | "category_leader"
    | "challenger"
    | "niche_player"
    | null;
}

export interface VisibilityTrendInput {
  brandId: string;
  organizationId: string;
  periodLabel: string;
  periodType: "weekly" | "monthly";
}

export interface FanOutSubQuery {
  subQuery: string;
  subQueryRank: number;
  brandAppeared: boolean;
  brandPosition: number | null;
  contentSimilarityScore: number | null;
  aboveThreshold: boolean;
}

export interface TopicalGap {
  topicCluster: string;
  topicLabel: string;
  vertical: string;
  brandHasContent: boolean;
  brandContentDepth: number | null;
  brandPassageCount: number | null;
  competitorCoverage: Array<{
    domain: string;
    has_content: boolean;
    depth: number;
    passage_count: number;
  }>;
  estimatedCitationImpact: number | null;
  crossPromptImpact: number | null;
}

export type WinType =
  | "new_citation"
  | "new_engine_coverage"
  | "visibility_up"
  | "competitor_down"
  | "gap_closed";

export interface Win {
  type: WinType;
  headline: string;
  metricDelta: number | null;
  reason: string;
  detectedAt: Date;
  engine?: string;
  prompt?: string;
}

export type BrandArchetype =
  | "recognised_authority"
  | "known_but_untrusted"
  | "niche_authority"
  | "invisible";

export type MarketCompetitionLabel =
  | "category_leader"
  | "challenger"
  | "niche_player";

export type VolumeTrend = "rising" | "stable" | "declining";

export type SourcePlatform =
  | "reddit"
  | "youtube"
  | "quora"
  | "news"
  | "review_site"
  | "forum"
  | "other";

export type MentionSentiment = "positive" | "neutral" | "negative";

export type CitedSourceType =
  | "reddit_thread"
  | "linkedin_post"
  | "youtube_video"
  | "wikipedia"
  | "news_article"
  | "au_directory"
  | "brand_owned"
  | "review_site"
  | "other";

export type EngineAffinity =
  | "chatgpt_primary"
  | "perplexity_primary"
  | "gemini_primary"
  | "all"
  | null;
