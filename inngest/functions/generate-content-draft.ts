import { and, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, contentDrafts, organizations, remediationTasks, subscriptions } from "@/db/schema";
import type { Tier } from "@/db/schema/enums";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { selectContentFormat } from "@/lib/workflow/content-format-selector";
import { mapRecommendationKeyToDraftType } from "@/lib/workflow/content-generator";

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

    // Task #46 (14th follow-up): serviceDb audit found this read had no
    // ownership check at all -- `taskId` comes from the request body of
    // app/api/brands/[brandId]/drafts/route.ts (only validated as a
    // well-formed UUID, never checked to belong to this brandId/orgId).
    // Without this filter, a caller who somehow obtained another org's
    // taskId could get that org's remediationTasks.title/description
    // (lines below) pulled into an LLM prompt and stored as a draft
    // under their OWN org/brand -- a cross-tenant read via a resource id,
    // not an org-id, but the same unvalidated-request-input shape this
    // whole follow-up is auditing for. Fixed by scoping the lookup to
    // the event's own orgId/brandId, which the calling route already
    // derived from the authenticated session + assertBrandAccess, never
    // from the request body.
    const [task] = await serviceDb
      .select()
      .from(remediationTasks)
      .where(
        and(
          eq(remediationTasks.id, taskId),
          eq(remediationTasks.organizationId, orgId),
          eq(remediationTasks.brandId, brandId),
        ),
      );

    if (!task) throw new Error(`Task not found: ${taskId}`);

    const [sub] = await serviceDb
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

    const llm = getLLMService(engine);
    const result = await llm.complete({
      engine,
      prompt,
      task: modelTask,
      model,
    });

    const [draft] = await serviceDb
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
