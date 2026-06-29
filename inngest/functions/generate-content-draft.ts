import { db } from "@/db/client";
import { remediationTasks, brands, organizations, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { contentDrafts } from "@/db/schema";
import { selectModel } from "@/lib/llm/model-selector";
import { selectContentFormat } from "@/lib/workflow/content-format-selector";
import { mapRecommendationKeyToDraftType } from "@/lib/workflow/content-generator";
import { getLLMService } from "@/lib/llm";
import type { ModelTask } from "@/lib/llm/interface";
import { enginesForTier } from "@/lib/llm/tier-engines";
import type { Tier } from "@/db/schema/enums";

export const generateContentDraft = inngest.createFunction(
  {
    id: "generate-content-draft",
    concurrency: { limit: 5 },
    triggers: [{ event: "draft/generate" }],
  },
  async ({
    event,
  }: {
    event: {
      data: {
        taskId: string;
        brandId: string;
        orgId: string;
        contentFormat?: string;
      };
    };
  }) => {
    const { taskId, brandId, orgId } = event.data;

    const [task] = await db
      .select()
      .from(remediationTasks)
      .where(eq(remediationTasks.id, taskId));

    if (!task) throw new Error(`Task not found: ${taskId}`);

    const [sub] = await db
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, orgId));

    const tier = (sub?.tier ?? "free") as Tier;
    const engines = enginesForTier(tier);
    const engine = engines[0];

    const draftType = task.recommendationKey
      ? mapRecommendationKeyToDraftType(task.recommendationKey)
      : "expert_article";

    const { format, reason } = event.data.contentFormat
      ? { format: event.data.contentFormat, reason: "Format specified by user" }
      : selectContentFormat(null, task.recommendationKey);

    const modelTask: ModelTask = "content_draft";
    const model = selectModel(tier, engine, modelTask);

    const prompt = [
      `Generate a ${format} content draft.`,
      `Draft type: ${draftType}`,
      `Title: ${task.title}`,
      task.description ? `Context: ${task.description}` : "",
      "Write in a professional, authoritative tone suitable for Australian businesses.",
      "Focus on accuracy, citing relevant sources where appropriate.",
    ]
      .filter(Boolean)
      .join("\n");

    const llm = getLLMService();
    const result = await llm.complete({
      engine,
      prompt,
      task: modelTask,
      model,
    });

    const [draft] = await db
      .insert(contentDrafts)
      .values({
        organizationId: orgId,
        brandId,
        taskId,
        draftType,
        contentFormat: format,
        formatRecommendationReason: reason,
        title: task.title,
        body: result.response,
        wordCount: result.response.split(/\s+/).length,
        status: "draft",
      })
      .returning();

    return { draftId: draft.id };
  },
);
