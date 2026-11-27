import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";
import { isCountedMention } from "@/lib/audit/organic-citations";
import { questionAgencyName } from "@/lib/questions/agency-name";

import type { QuestionMix } from "@/lib/questions/mix-line";

export { type QuestionMix, questionMixLine, questionSplitLine } from "@/lib/questions/mix-line";

/**
 * S03 part 6 (LLD 8.3.3, decision D2; contract P07.mix, P07.split, P09.method): what an audit asked, by who wrote it --
 * the mix line on the audit page, the report's Method page and the client portal -- and, when it asked both kinds,
 * the Visibility of each kind under the headline. The headline itself still counts every everyday question.
 *
 * Who wrote a question comes from the set the audit recorded when it started (audits.question_set_id): the agency's
 * own (source agency) against everything else (the original set, template and AI suggestions: "AI-suggested", as LLD 10
 * groups them). An audit from before S02 recorded no set and asked the brand's stored pack: all from the original set.
 * An answer counts toward a kind's Visibility as it counts toward the headline (isCountedMention, everyday answers).
 */

type ItemRow = { question_id: string; text: string; kind: string; source: string };
type AnswerRow = {
  question_id: string | null;
  prompt: string;
  brand_mentioned: boolean;
  mention_verification: string | null;
};
type PromptRow = { prompt: string; branded: boolean };

/** The audit's question mix, or null for an audit that isn't the workspace's. */
export async function loadAuditQuestionMix(
  db: DbClient,
  input: { organizationId: string; auditId: string },
): Promise<QuestionMix | null> {
  const [audit] = await db
    .select({ brandId: audits.brandId, setId: audits.questionSetId })
    .from(audits)
    .where(and(eq(audits.id, input.auditId), eq(audits.organizationId, input.organizationId)));
  if (!audit) return null;
  const agencyName = await questionAgencyName(db, input.organizationId, audit.brandId);

  if (!audit.setId) {
    // Before S02: the stored pack, typed by the run-time branded check the answers and failures recorded.
    const prompts = await db.execute<PromptRow>(sql`
      SELECT prompt, bool_or(is_branded_prompt) AS branded FROM (
        SELECT prompt, is_branded_prompt FROM citations WHERE audit_id = ${input.auditId}
        UNION ALL
        SELECT prompt, is_branded_prompt FROM engine_call_failures WHERE audit_id = ${input.auditId}
      ) p GROUP BY prompt`);
    const rows = [...prompts];
    const branded = rows.filter((r) => r.branded).length;
    const everyday = rows.length - branded;
    return {
      total: rows.length,
      everyday,
      branded,
      agency: 0,
      nonAgency: everyday,
      allOriginal: true,
      agencyName,
      split: null,
    };
  }

  const items = [
    ...(await db.execute<ItemRow>(sql`
      SELECT i.question_id, q.text, i.kind, i.source
      FROM brand_question_set_items i JOIN brand_questions q ON q.id = i.question_id
      WHERE i.set_id = ${audit.setId}`)),
  ];
  const everydayItems = items.filter((i) => i.kind === "everyday");
  const branded = items.length - everydayItems.length;
  const agency = everydayItems.filter((i) => i.source === "agency").length;
  const nonAgency = everydayItems.length - agency;
  const mix: QuestionMix = {
    total: items.length,
    everyday: everydayItems.length,
    branded,
    agency,
    nonAgency,
    allOriginal: everydayItems.every((i) => i.source === "original"),
    agencyName,
    split: null,
  };
  if (agency === 0 || nonAgency === 0) return mix;

  // Both kinds: each one's Visibility over its own everyday answers, counted as the headline counts them
  // (lib/scoring/resolve-audit-dimensions.ts: every everyday answer on run 1, a mention unless it's 'unverified'), so the
  // two splits add up to the headline's AI-engine answers. A question is matched by the id the answer recorded, else
  // by its text (an answer written before citations.question_id).
  const sourceById = new Map(items.map((i) => [i.question_id, i.source]));
  const sourceByText = new Map(items.map((i) => [i.text, i.source]));
  const answers = await db.execute<AnswerRow>(sql`
    SELECT question_id, prompt, brand_mentioned, mention_verification
    FROM citations
    WHERE audit_id = ${input.auditId} AND is_branded_prompt IS NOT TRUE AND run_number = 1`);
  const split = { ai: { m: 0, n: 0 }, agency: { m: 0, n: 0 } };
  for (const a of answers) {
    const source = (a.question_id && sourceById.get(a.question_id)) ?? sourceByText.get(a.prompt);
    if (!source) continue;
    const bucket = source === "agency" ? split.agency : split.ai;
    bucket.n++;
    if (
      isCountedMention({
        brandMentioned: a.brand_mentioned,
        mentionVerification: a.mention_verification,
      })
    )
      bucket.m++;
  }
  return { ...mix, split };
}
