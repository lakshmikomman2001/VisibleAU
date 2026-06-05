import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmResponseCache } from "@/db/schema";

const TTL_HOURS = 48;

function makeKey(prompt: string, model: string): string {
  return createHash("sha256").update(`${prompt}\n${model}`).digest("hex");
}

export async function getCached(prompt: string, model: string) {
  const key = makeKey(prompt, model);
  const [hit] = await db
    .select()
    .from(llmResponseCache)
    .where(and(eq(llmResponseCache.cacheKey, key), gt(llmResponseCache.expiresAt, new Date())));
  if (!hit) return null;
  db.update(llmResponseCache)
    .set({ hitCount: hit.hitCount + 1 })
    .where(eq(llmResponseCache.id, hit.id))
    .execute()
    .catch(() => {});
  return {
    response: hit.response,
    tokensUsed: hit.tokensUsed,
    costEstimateUsd: 0,
    model: hit.model,
  };
}

export async function setCached(
  prompt: string,
  model: string,
  output: { response: string; tokensUsed: number; costEstimateUsd: number },
) {
  const key = makeKey(prompt, model);
  await db
    .insert(llmResponseCache)
    .values({
      cacheKey: key,
      prompt,
      model,
      response: output.response,
      tokensUsed: output.tokensUsed,
      costEstimateUsd: output.costEstimateUsd.toString(),
      expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
    })
    .onConflictDoUpdate({
      target: llmResponseCache.cacheKey,
      set: {
        response: output.response,
        tokensUsed: output.tokensUsed,
        costEstimateUsd: output.costEstimateUsd.toString(),
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
        hitCount: sql`${llmResponseCache.hitCount} + 1`,
      },
    });
}
