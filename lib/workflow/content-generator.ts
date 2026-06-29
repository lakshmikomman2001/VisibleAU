import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { selectModel } from "@/lib/llm/model-selector";
import { getLLMService } from "@/lib/llm";
import type { Engine, ModelTask } from "@/lib/llm/interface";
import type { Tier } from "@/db/schema/enums";
import { selectContentFormat } from "./content-format-selector";

const RECOMMENDATION_KEY_TO_DRAFT_TYPE: Record<string, string> = {
  "wikipedia-article": "wikipedia_article",
  "comparison-article": "comparison_article",
  "faq-block": "faq_block",
  "press-release": "press_release",
  "reddit-absence": "reddit_comment",
  "linkedin-presence": "linkedin_post",
  "linkedin-article": "linkedin_article",
  "answer-capsule": "answer_capsule",
  "fan-out-content": "fan_out_content",
  "topical-gap-article": "topical_gap_article",
  "outreach-brief": "outreach_brief",
  "how-to-guide": "how_to_guide",
  "listicle": "listicle",
};

export function mapRecommendationKeyToDraftType(
  recommendationKey: string,
): string {
  return RECOMMENDATION_KEY_TO_DRAFT_TYPE[recommendationKey] ?? "expert_article";
}

export interface GenerateDraftInput {
  taskId: string;
  brandId: string;
  orgId: string;
  tier: Tier;
  engine: Engine;
  recommendationKey: string | null;
  detectedFormat: string | null;
  title: string;
  description: string | null;
}

export async function generateContentDraft(
  input: GenerateDraftInput,
): Promise<string> {
  const task: ModelTask = "content_draft";
  const model = selectModel(input.tier, input.engine, task);

  const draftType = input.recommendationKey
    ? mapRecommendationKeyToDraftType(input.recommendationKey)
    : "expert_article";

  const { format, reason } = selectContentFormat(
    input.detectedFormat,
    input.recommendationKey,
  );

  const prompt = buildDraftPrompt(input.title, input.description, draftType, format);

  const llm = getLLMService();
  const result = await llm.complete({
    engine: input.engine,
    prompt,
    task,
    model,
  });

  const [draft] = await db
    .insert(contentDrafts)
    .values({
      organizationId: input.orgId,
      brandId: input.brandId,
      taskId: input.taskId,
      draftType,
      contentFormat: format,
      formatRecommendationReason: reason,
      title: input.title,
      body: result.response,
      status: "draft",
    })
    .returning();

  return draft.id;
}

function buildDraftPrompt(
  title: string,
  description: string | null,
  draftType: string,
  format: string,
): string {
  return [
    `Generate a ${format} content draft.`,
    `Draft type: ${draftType}`,
    `Title: ${title}`,
    description ? `Context: ${description}` : "",
    "Write in a professional, authoritative tone suitable for Australian businesses.",
    "Focus on accuracy, citing relevant sources where appropriate.",
  ]
    .filter(Boolean)
    .join("\n");
}
