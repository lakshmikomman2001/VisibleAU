import { sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import type { QuestionReach } from "@/db/schema";
import { REACH_ORDER } from "./places";

/**
 * S04B part 4 (LLD amendment 102; contract P07.reachFilter): the audit page's per-engine table and competitor context
 * for one reach. The answers are counted as the headline counts them (lib/reach/results.ts computeAuditReachResults):
 * everyday (not naming the business) run-1 answers, a mention unless 'unverified', each question's reach its item's in
 * the audit's set (Local when it has none). One grouped read gives every reach's per-engine counts, and one more its
 * failures -- never a query per reach. Google's AI answers aren't engine rows of the table, so they aren't here. The
 * competitor context's shares for a reach come from the one counter (lib/visibility/share-of-voice.ts
 * shareOfVoiceInReach).
 */

export interface ReachEngineCounts {
  engine: string;
  sampleCount: number;
  mentionedCount: number;
}

export interface ReachFailureCount {
  engine: string;
  errorClass: string;
  count: number;
}

export interface ReachBreakdown {
  /** The reaches the audit's everyday questions were in, in reach order. */
  reaches: QuestionReach[];
  answers: Map<QuestionReach, ReachEngineCounts[]>;
  failures: Map<QuestionReach, ReachFailureCount[]>;
}

const reachOf = (auditId: string) => sql`
  reach_of AS (
    SELECT DISTINCT ON (question_text_key(q.text)) question_text_key(q.text) AS key, i.reach
    FROM audits a
    JOIN brand_question_set_items i ON i.set_id = a.question_set_id
    JOIN brand_questions q ON q.id = i.question_id
    WHERE a.id = ${auditId} AND i.kind = 'everyday'
    ORDER BY question_text_key(q.text), i.position
  )`;

export async function loadReachBreakdown(db: DbClient, auditId: string): Promise<ReachBreakdown> {
  const answerRows = (await db.execute(sql`
    WITH ${reachOf(auditId)}
    SELECT coalesce(r.reach, 'local') AS reach, c.engine,
           count(*)::int AS sample_count,
           count(*) FILTER (WHERE c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified')::int
             AS mentioned_count
    FROM citations c LEFT JOIN reach_of r ON r.key = question_text_key(c.prompt)
    WHERE c.audit_id = ${auditId} AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1
    GROUP BY 1, 2
  `)) as unknown as Array<{
    reach: QuestionReach;
    engine: string;
    sample_count: number;
    mentioned_count: number;
  }>;
  const failureRows = (await db.execute(sql`
    WITH ${reachOf(auditId)}
    SELECT coalesce(r.reach, 'local') AS reach, f.engine, f.error_class, count(*)::int AS count
    FROM engine_call_failures f LEFT JOIN reach_of r ON r.key = question_text_key(f.prompt)
    WHERE f.audit_id = ${auditId} AND NOT f.is_branded_prompt
    GROUP BY 1, 2, 3
  `)) as unknown as Array<{
    reach: QuestionReach;
    engine: string;
    error_class: string;
    count: number;
  }>;

  const answers = new Map<QuestionReach, ReachEngineCounts[]>();
  for (const r of answerRows) {
    const list = answers.get(r.reach) ?? [];
    list.push({
      engine: r.engine,
      sampleCount: Number(r.sample_count),
      mentionedCount: Number(r.mentioned_count),
    });
    answers.set(r.reach, list);
  }
  const failures = new Map<QuestionReach, ReachFailureCount[]>();
  for (const r of failureRows) {
    const list = failures.get(r.reach) ?? [];
    list.push({ engine: r.engine, errorClass: r.error_class, count: Number(r.count) });
    failures.set(r.reach, list);
  }
  const reaches = REACH_ORDER.filter((reach) => answers.has(reach) || failures.has(reach));
  return { reaches, answers, failures };
}

/** The per-engine rows of one reach, one per engine the audit asked (0 of 0 when none of its answers came back). */
export function reachEngineRows(
  breakdown: ReachBreakdown,
  reach: QuestionReach,
  engines: readonly string[],
): ReachEngineCounts[] {
  const rows = breakdown.answers.get(reach) ?? [];
  return engines.map(
    (engine) =>
      rows.find((r) => r.engine === engine) ?? { engine, sampleCount: 0, mentionedCount: 0 },
  );
}
