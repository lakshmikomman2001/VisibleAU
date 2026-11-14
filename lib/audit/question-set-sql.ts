import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, engineCallFailures } from "@/db/schema";
import { ORGANIC_ONLY } from "./organic-filter";
import {
  type QuestionSetChange,
  type QuestionSetOf,
  questionSetChange,
  questionsChangedNote,
  sameQuestionSet,
} from "./question-set";

/**
 * 15 Nov, part 2: the SQL side of ./question-set.ts. An audit's question set is its distinct everyday questions:
 * the prompts of its everyday answers (citations.is_branded_prompt IS NOT TRUE, ./organic-filter.ts) and of its
 * failed everyday calls (engine_call_failures), as the report's question list counts them
 * (lib/reports/report-data.ts). Its hash is their SHA-256 (hex), sorted bytewise (COLLATE "C") and joined with a
 * newline.
 *
 * The same expression is migration 0150's backfill (db/migrations/0150_audits_question_set_hash.sql, with `a.id`
 * for the audit), so a backfilled hash and a newly written one agree; tests/integration/question-set.
 * integration.test.ts runs both and compares.
 */
export function questionSetHashSql(auditId: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT encode(sha256(convert_to(string_agg(q.prompt, E'\\n' ORDER BY q.prompt COLLATE "C"), 'UTF8')), 'hex')
    FROM (
      SELECT c.prompt FROM citations c WHERE c.audit_id = ${auditId} AND c.is_branded_prompt IS NOT TRUE
      UNION
      SELECT f.prompt FROM engine_call_failures f WHERE f.audit_id = ${auditId} AND NOT f.is_branded_prompt
    ) q
  )`;
}

/** Each audit's distinct everyday questions (an audit with none is absent). */
export async function loadEverydayQuestions(
  db: DbClient,
  auditIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (auditIds.length === 0) return out;
  const ids = [...new Set(auditIds)];
  const [answered, failed] = await Promise.all([
    db
      .selectDistinct({ auditId: citations.auditId, prompt: citations.prompt })
      .from(citations)
      .where(and(inArray(citations.auditId, ids), ORGANIC_ONLY)),
    db
      .selectDistinct({ auditId: engineCallFailures.auditId, prompt: engineCallFailures.prompt })
      .from(engineCallFailures)
      .where(
        and(
          inArray(engineCallFailures.auditId, ids),
          eq(engineCallFailures.isBrandedPrompt, false),
        ),
      ),
  ]);
  for (const r of [...answered, ...failed]) {
    const set = out.get(r.auditId) ?? new Set<string>();
    set.add(r.prompt);
    out.set(r.auditId, set);
  }
  return out;
}

export type AuditWithQuestionSet = QuestionSetOf & { id: string; auditNumber: number };

/**
 * For audits in the order they're shown (oldest first), the note at each one whose everyday questions differ
 * from the one before it: "Questions changed between #48 and #50 (one question removed), so these aren't
 * compared." Keyed by the later audit's id; the questions are read only for the audits at a change.
 */
export async function questionChangeNotes(
  db: DbClient,
  ordered: readonly AuditWithQuestionSet[],
): Promise<Map<string, string>> {
  const pairs: Array<[AuditWithQuestionSet, AuditWithQuestionSet]> = [];
  for (let i = 1; i < ordered.length; i++) {
    if (!sameQuestionSet(ordered[i - 1], ordered[i])) pairs.push([ordered[i - 1], ordered[i]]);
  }
  const notes = new Map<string, string>();
  if (pairs.length === 0) return notes;
  const questions = await loadEverydayQuestions(
    db,
    pairs.flat().map((a) => a.id),
  );
  for (const [earlier, later] of pairs) {
    notes.set(
      later.id,
      questionsChangedNote(
        earlier.auditNumber,
        later.auditNumber,
        changeBetween(questions, earlier.id, later.id),
      ),
    );
  }
  return notes;
}

/** The note for one pair (the compare page, "vs previous audit"); null when they asked the same questions. */
export async function questionChangeNote(
  db: DbClient,
  earlier: AuditWithQuestionSet,
  later: AuditWithQuestionSet,
): Promise<string | null> {
  return (await questionChangeNotes(db, [earlier, later])).get(later.id) ?? null;
}

function changeBetween(
  questions: ReadonlyMap<string, Set<string>>,
  earlierId: string,
  laterId: string,
): QuestionSetChange | null {
  const earlier = questions.get(earlierId);
  const later = questions.get(laterId);
  return earlier && later ? questionSetChange(earlier, later) : null;
}
