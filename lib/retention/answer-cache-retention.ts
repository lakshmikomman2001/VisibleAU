import { sql } from "drizzle-orm";
import type { db as DbForType } from "@/db/client";

/**
 * Mock-gate and retention follow-ups (Sri, 2 Nov), part 2: the answer cache (llm_response_cache) was never purged,
 * though the Data Residency page claimed "30 days" for it. Each row holds an engine's answer to one question. It
 * is reused only until expires_at (ANSWER_CACHE_REUSE_HOURS, lib/governance/residency-config.ts); both readers in
 * lib/llm/cache.ts require expires_at > now, so an expired row is never served again. The weekly retention job
 * deletes expired rows with this, so a copy of an answer doesn't outlive the audit it came from.
 *
 * Bounded (batchSize rows per statement, maxBatches per run) and idempotent; an error throws, failing the run.
 */
export const ANSWER_CACHE_PURGE_BATCH_SIZE = 5000;
export const ANSWER_CACHE_PURGE_MAX_BATCHES = 20;

export interface ExpiredAnswerCachePurge {
  deletedCacheRows: number;
  /** True when the batch cap stopped the run with expired rows left: the next run continues. */
  more: boolean;
}

/** `db` is the job's serviceDb: the cache is shared across workspaces. */
export async function deleteExpiredAnswerCache(
  db: typeof DbForType,
  now: Date,
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<ExpiredAnswerCachePurge> {
  const batchSize = options.batchSize ?? ANSWER_CACHE_PURGE_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? ANSWER_CACHE_PURGE_MAX_BATCHES;
  // A raw sql`` parameter must be a string here (postgres.js won't take a Date through drizzle's raw query).
  const cutoff = now.toISOString();
  let deletedCacheRows = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const deleted = await db.execute<{ id: string }>(sql`
      DELETE FROM llm_response_cache
      WHERE id IN (
        SELECT id FROM llm_response_cache
        WHERE expires_at < ${cutoff}::timestamptz
        ORDER BY expires_at
        LIMIT ${batchSize}
      )
      RETURNING id
    `);
    deletedCacheRows += deleted.length;
    if (deleted.length < batchSize) return { deletedCacheRows, more: false };
  }
  return { deletedCacheRows, more: true };
}
