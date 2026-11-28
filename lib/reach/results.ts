import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { auditReachResults, audits, type QuestionReach } from "@/db/schema";
import { wilsonCI } from "@/lib/scoring/wilson";
import { REACH_ORDER } from "./places";

/**
 * S04 part 7 (LLD 8.4.6, 10): an audit's Visibility per reach, stored in audit_reach_results when it completes (both
 * runners) and again when its Google part finishes (Google's AI answers count only where the audit stored "count in
 * headline", as the headline does).
 * - Each question's reach is its item's in the audit's question set (audits.question_set_id), matched by compared text
 *   (question_text_key); a question with none (an audit from the stored pack) is Local.
 * - Per reach: every everyday answer on run 1, a mention unless it's 'unverified' (lib/scoring/resolve-audit-
 *   dimensions.ts, as 0157's backfill); Google's shown everyday answers when counted, a mention when verified. So the
 *   reaches' counts add up to the headline's.
 * - The 95% Wilson interval (lib/scoring/wilson.ts, which answers in percent), stored as fractions; none when the reach
 *   has no answers.
 * - reach_hash: lib/audit/question-set-sql.ts's hash over the reach's own everyday questions (asked or failed), so a
 *   Local-only audit's Local hash is its question_set_hash, and two audits' reach compare only when its questions do.
 */

export interface AuditReachResult {
  reach: QuestionReach;
  everydayAnswers: number;
  mentioned: number;
  ciLow: number | null;
  ciHigh: number | null;
  reachHash: string;
}

type Row = { reach: QuestionReach; n: number; m: number; hash: string | null };

export async function computeAuditReachResults(
  db: DbClient,
  auditId: string,
): Promise<AuditReachResult[]> {
  const rows = (await db.execute(sql`
    WITH reach_of AS (
      SELECT DISTINCT ON (question_text_key(q.text)) question_text_key(q.text) AS key, i.reach
      FROM audits a
      JOIN brand_question_set_items i ON i.set_id = a.question_set_id
      JOIN brand_questions q ON q.id = i.question_id
      WHERE a.id = ${auditId} AND i.kind = 'everyday'
      ORDER BY question_text_key(q.text), i.position
    ),
    answers AS (
      SELECT coalesce(r.reach, 'local') AS reach,
             (c.brand_mentioned AND c.mention_verification IS DISTINCT FROM 'unverified') AS named
      FROM citations c LEFT JOIN reach_of r ON r.key = question_text_key(c.prompt)
      WHERE c.audit_id = ${auditId} AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1
      UNION ALL
      SELECT coalesce(r.reach, 'local'),
             (g.brand_mentioned AND g.mention_verification IN ('verified_domain', 'verified_location'))
      FROM google_surface_results g
      JOIN audit_google_surfaces s ON s.audit_id = g.audit_id
      LEFT JOIN reach_of r ON r.key = question_text_key(g.prompt)
      WHERE g.audit_id = ${auditId} AND g.outcome = 'shown' AND g.is_branded_prompt = false
        AND (s.settings->>'countInHeadline')::boolean IS TRUE
    ),
    asked AS (
      SELECT DISTINCT coalesce(r.reach, 'local') AS reach, question_text_key(p.prompt) AS question
      FROM (
        SELECT c.prompt FROM citations c WHERE c.audit_id = ${auditId} AND c.is_branded_prompt IS NOT TRUE
        UNION
        SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = ${auditId} AND NOT f.is_branded_prompt
      ) p
      LEFT JOIN reach_of r ON r.key = question_text_key(p.prompt)
    ),
    hashes AS (
      SELECT reach,
             encode(sha256(convert_to(string_agg(question, E'\\n' ORDER BY question COLLATE "C"), 'UTF8')), 'hex') AS hash
      FROM asked GROUP BY reach
    ),
    counts AS (
      SELECT reach, count(*)::int AS n, count(*) FILTER (WHERE named)::int AS m FROM answers GROUP BY reach
    )
    SELECT h.reach, coalesce(c.n, 0)::int AS n, coalesce(c.m, 0)::int AS m, h.hash
    FROM hashes h LEFT JOIN counts c ON c.reach = h.reach
  `)) as unknown as Row[];
  const byReach = new Map(rows.map((r) => [r.reach, r]));
  return REACH_ORDER.flatMap((reach) => {
    const r = byReach.get(reach);
    if (!r?.hash) return [];
    const n = Number(r.n);
    const m = Number(r.m);
    const ci = n > 0 ? wilsonCI(m, n) : null;
    return [
      {
        reach,
        everydayAnswers: n,
        mentioned: m,
        // wilsonCI answers in percent; stored as fractions (0157), to 4 places.
        ciLow: ci ? Math.max(0, Math.round(ci.lower * 100) / 10_000) : null,
        ciHigh: ci ? Math.min(1, Math.round(ci.upper * 100) / 10_000) : null,
        reachHash: r.hash,
      },
    ];
  });
}

/** The SQLSTATE of a failed statement: postgres-js puts it on the error as `code`; drizzle wraps that error as `cause`. */
function sqlStateOf(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Computes and stores the audit's results per reach (replacing what it had). Never throws: a failure is logged.
 *
 * S04B part 3 (LLD amendment 104):
 * - the delete and the insert are one transaction, so a re-write that fails keeps the rows already there;
 * - a failure is one structured log line (event `reach_results_not_stored`, the audit id and the SQLSTATE), never the
 *   SQL or its parameters;
 * - an audit with no everyday question asked stores Local 0 of 0 with no interval (both null), hashed as 0157's
 *   backfill hashes it (the audit's question_set_hash, else 'prompt_pack_version:' and its version). An audit whose
 *   everyday calls all failed already stores 0 of 0 per reach (computeAuditReachResults).
 */
export async function writeAuditReachResults(
  db: DbClient,
  input: { auditId: string; organizationId: string },
): Promise<void> {
  try {
    const computed = await computeAuditReachResults(db, input.auditId);
    const results = computed.length > 0 ? computed : await noAnswersResult(db, input.auditId);
    await db.transaction(async (tx) => {
      await tx.delete(auditReachResults).where(eq(auditReachResults.auditId, input.auditId));
      if (results.length === 0) return;
      await tx.insert(auditReachResults).values(
        results.map((r) => ({
          auditId: input.auditId,
          organizationId: input.organizationId,
          reach: r.reach,
          everydayAnswers: r.everydayAnswers,
          mentioned: r.mentioned,
          ciLow: r.ciLow === null ? null : r.ciLow.toFixed(4),
          ciHigh: r.ciHigh === null ? null : r.ciHigh.toFixed(4),
          reachHash: r.reachHash,
        })),
      );
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "reach_results_not_stored",
        auditId: input.auditId,
        sqlstate: sqlStateOf(err),
      }),
    );
  }
}

/** Local 0 of 0, no interval, for an audit that asked no everyday question (as 0157's backfill stores it). */
async function noAnswersResult(db: DbClient, auditId: string): Promise<AuditReachResult[]> {
  const [audit] = await db
    .select({ hash: audits.questionSetHash, version: audits.promptPackVersion })
    .from(audits)
    .where(eq(audits.id, auditId));
  if (!audit) return [];
  return [
    {
      reach: "local",
      everydayAnswers: 0,
      mentioned: 0,
      ciLow: null,
      ciHigh: null,
      reachHash: audit.hash ?? `prompt_pack_version:${audit.version ?? 1}`,
    },
  ];
}

/** S04 part 7: each prompt the audit asked and its reach (its item's in the audit's set; absent: Local). */
export async function loadAuditQuestionReaches(
  db: DbClient,
  auditId: string,
): Promise<Map<string, QuestionReach>> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT c.prompt, i.reach
    FROM citations c
    JOIN audits a ON a.id = c.audit_id
    JOIN brand_question_set_items i ON i.set_id = a.question_set_id
    JOIN brand_questions q ON q.id = i.question_id AND question_text_key(q.text) = question_text_key(c.prompt)
    WHERE c.audit_id = ${auditId}
  `)) as unknown as Array<{ prompt: string; reach: QuestionReach }>;
  return new Map(rows.map((r) => [r.prompt, r.reach]));
}

/** An audit's stored results per reach, in reach order (the P07 reach row, the PDF's, the report snapshot). */
export async function loadAuditReachResults(
  db: DbClient,
  auditId: string,
): Promise<AuditReachResult[]> {
  const rows = await db
    .select()
    .from(auditReachResults)
    .where(eq(auditReachResults.auditId, auditId));
  const byReach = new Map(rows.map((r) => [r.reach, r]));
  return REACH_ORDER.flatMap((reach) => {
    const r = byReach.get(reach);
    return r
      ? [
          {
            reach,
            everydayAnswers: r.everydayAnswers,
            mentioned: r.mentioned,
            ciLow: r.ciLow === null ? null : Number(r.ciLow),
            ciHigh: r.ciHigh === null ? null : Number(r.ciHigh),
            reachHash: r.reachHash,
          },
        ]
      : [];
  });
}

/**
 * LLD 10: a reach's trend compares an audit only with the brand's complete audits that asked the same questions in that
 * reach (equal reach_hash), oldest first; an audit excluded from trends is never compared. The headline's trend still
 * compares by question_set_hash. No S04 screen draws a reach's trend yet (the contract has none); this is the rule.
 */
export async function comparableReachResults(
  db: DbClient,
  input: { brandId: string; organizationId: string; reach: QuestionReach; reachHash: string },
): Promise<
  Array<{ auditId: string; auditNumber: number; everydayAnswers: number; mentioned: number }>
> {
  const rows = await db
    .select({
      auditId: auditReachResults.auditId,
      auditNumber: audits.auditNumber,
      everydayAnswers: auditReachResults.everydayAnswers,
      mentioned: auditReachResults.mentioned,
    })
    .from(auditReachResults)
    .innerJoin(audits, eq(audits.id, auditReachResults.auditId))
    .where(
      and(
        eq(audits.brandId, input.brandId),
        eq(auditReachResults.organizationId, input.organizationId),
        eq(auditReachResults.reach, input.reach),
        eq(auditReachResults.reachHash, input.reachHash),
        inArray(audits.status, ["complete"]),
        isNull(audits.excludedFromTrendsReason),
      ),
    )
    .orderBy(asc(audits.auditNumber));
  return rows;
}
