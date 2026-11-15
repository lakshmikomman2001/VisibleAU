import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { auditsCountingGoogle } from "@/lib/audit/google-surfaces/summary";
import { auditModels } from "@/lib/audit/model-drift";
import { EXCLUDE_UNVERIFIED, ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { includedInTrends } from "@/lib/audit/trend-exclusion-sql";
import { driftBaseline } from "@/lib/drift/baseline";
import { latestCompleteAudit } from "@/lib/visibility/share-of-voice";

/**
 * 17 Nov, part 3 -- one everyday question's history, audit by audit, as the audit page counts answers: of the answers
 * to this question in each audit (run 1), how many named the brand (verified). Autopilot's "Prompt trends" grouped
 * every citations row by calendar week of created_at -- unverified mentions and every run counted, branded
 * questions and old question sets listed -- and coloured the line green or red from its first and last points. Now:
 * the latest audit's everyday questions; each point one audit, included in trends and comparable with the latest
 * (the drift baseline's rule: same method, questions, models, every engine answered); with its counts.
 */

export interface QuestionTrendPoint {
  auditNumber: number;
  completedAt: string | null;
  /** Answers to this question that named the brand (verified). */
  mentioned: number;
  /** Answers to this question (run 1, every engine that answered). */
  answers: number;
}

const MAX_AUDITS = 12;

/** The latest complete audit's everyday questions. */
export async function latestEverydayQuestions(tx: DbClient, brandId: string): Promise<string[]> {
  const latest = await latestCompleteAudit(tx, brandId);
  if (!latest) return [];
  const rows = await tx
    .selectDistinct({ prompt: citations.prompt })
    .from(citations)
    .where(and(eq(citations.auditId, latest.id), ORGANIC_ONLY, eq(citations.runNumber, 1)))
    .orderBy(citations.prompt);
  return rows.map((r) => r.prompt);
}

export async function questionTrend(
  tx: DbClient,
  brandId: string,
  question: string,
): Promise<QuestionTrendPoint[]> {
  const latest = await latestCompleteAudit(tx, brandId);
  if (!latest) return [];
  const candidates = await tx
    .select()
    .from(audits)
    .where(and(eq(audits.brandId, brandId), eq(audits.status, "complete"), includedInTrends))
    .orderBy(sql`${audits.completedAt} DESC NULLS LAST`, desc(audits.auditNumber))
    .limit(MAX_AUDITS * 2);
  const latestRow = candidates.find((a) => a.id === latest.id);
  if (!latestRow) return [];
  const ids = candidates.map((a) => a.id);
  const [models, countsGoogle] = await Promise.all([
    auditModels(tx, ids),
    auditsCountingGoogle(tx, ids),
  ]);
  const comparable = candidates
    .filter(
      (a) =>
        a.id === latestRow.id ||
        driftBaseline(latestRow, [a], models, countsGoogle).previous !== null,
    )
    .slice(0, MAX_AUDITS);
  if (comparable.length === 0) return [];

  const counts = await tx
    .select({
      auditId: citations.auditId,
      answers: sql<number>`count(*)`,
      mentioned: sql<number>`COALESCE(SUM(CASE WHEN ${citations.brandMentioned} = true AND ${EXCLUDE_UNVERIFIED} THEN 1 ELSE 0 END), 0)`,
    })
    .from(citations)
    .where(
      and(
        inArray(
          citations.auditId,
          comparable.map((a) => a.id),
        ),
        eq(citations.prompt, question),
        ORGANIC_ONLY,
        eq(citations.runNumber, 1),
      ),
    )
    .groupBy(citations.auditId);
  const byAudit = new Map(counts.map((c) => [c.auditId, c]));

  return comparable
    .filter((a) => byAudit.has(a.id))
    .map((a) => {
      const c = byAudit.get(a.id) as { answers: number; mentioned: number };
      return {
        auditNumber: a.auditNumber,
        completedAt: a.completedAt ? a.completedAt.toISOString() : null,
        mentioned: Number(c.mentioned),
        answers: Number(c.answers),
      };
    })
    .reverse();
}
