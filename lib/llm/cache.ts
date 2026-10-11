import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmResponseCache } from "@/db/schema";

const TTL_HOURS = 48;

function makeKey(prompt: string, model: string): string {
  return createHash("sha256").update(`${prompt}\n${model}`).digest("hex");
}

/**
 * Task #43: both getCached and setCached are now wrapped so a cache-layer
 * failure (a DB hiccup, or -- before migration 0038 is applied -- the
 * new cited_urls column not existing yet) degrades to "cache miss" /
 * "response not cached" instead of breaking the LLM call that invoked
 * them. Previously only google-impl.ts guarded its own getCached() call;
 * openai-impl.ts, anthropic-impl.ts and perplexity-impl.ts all awaited
 * it unguarded. Centralizing the guard here protects all four engines
 * uniformly instead of relying on each call site to remember one. See
 * docs/ops/post-launch-db-hardening.md section 43.
 */
export async function getCached(prompt: string, model: string) {
  try {
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
      citedUrls: Array.isArray(hit.citedUrls) ? (hit.citedUrls as string[]) : undefined,
    };
  } catch (err) {
    console.error("[llm-cache] getCached failed (treating as cache miss)", {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function setCached(
  prompt: string,
  model: string,
  output: { response: string; tokensUsed: number; costEstimateUsd: number; citedUrls?: string[] },
) {
  try {
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
        citedUrls: output.citedUrls ?? null,
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
      })
      .onConflictDoUpdate({
        target: llmResponseCache.cacheKey,
        set: {
          response: output.response,
          tokensUsed: output.tokensUsed,
          costEstimateUsd: output.costEstimateUsd.toString(),
          citedUrls: output.citedUrls ?? null,
          expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
          hitCount: sql`${llmResponseCache.hitCount} + 1`,
        },
      });
  } catch (err) {
    console.error("[llm-cache] setCached failed (response not cached, call result still returned)", {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
