/**
 * 15 Nov, part 2 (Sri's review of audit #50): Hero Home Services' PDF joined #48 (25%, 11 everyday questions,
 * question generator v3, including the off-topic question 0bd1221 removed) and #50 (33%, 10 everyday questions,
 * generator v4) with one line. That reads as a rise, but the questions changed.
 *
 * audits.prompt_pack_version didn't catch it: it's stamped from the brand when the audit row is created, and
 * lib/audit/get-audit-prompts.ts regenerates a pack behind PROMPT_GENERATOR_VERSION only later, when the audit
 * runs, so #50 ran the v4 questions under #48's pack version. Each audit now stores the hash of the everyday
 * questions it actually asked (migration 0150's audits.question_set_hash, ./question-set-sql.ts), and two audits
 * with different everyday questions are never compared: the report PDF's trend, the brand page's audit history,
 * drift alerts, portfolio and agency movement, the weekly visibility trend and the wins feed, "vs previous audit"
 * in the export and the PDF builder, the compare page and the metrics API.
 *
 * Pure (no database): client components use it too.
 */

/** What an audit says about its everyday questions (audits.question_set_hash, audits.prompt_pack_version). */
export interface QuestionSetOf {
  questionSetHash: string | null;
  promptPackVersion: number | null;
}

/**
 * Two audits asked the same everyday questions: the same stored hash. When either has none (no stored everyday
 * row), the pack versions decide, as before migration 0150.
 */
export function sameQuestionSet(a: QuestionSetOf, b: QuestionSetOf): boolean {
  if (a.questionSetHash && b.questionSetHash) return a.questionSetHash === b.questionSetHash;
  return (a.promptPackVersion ?? 1) === (b.promptPackVersion ?? 1);
}

/** How the everyday questions changed from one audit to the next: questions added, and removed. */
export interface QuestionSetChange {
  added: number;
  removed: number;
}

export function questionSetChange(
  earlier: ReadonlySet<string>,
  later: ReadonlySet<string>,
): QuestionSetChange {
  let added = 0;
  let removed = 0;
  for (const q of later) if (!earlier.has(q)) added++;
  for (const q of earlier) if (!later.has(q)) removed++;
  return { added, removed };
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/** "one question removed", "two questions added and one removed"; null when there's nothing to say. */
export function questionSetChangeWords(change: QuestionSetChange | null): string | null {
  if (!change) return null;
  const { added, removed } = change;
  const noun = (n: number) => (n === 1 ? "question" : "questions");
  if (added > 0 && removed > 0) {
    return `${inWords(added)} ${noun(added)} added and ${inWords(removed)} removed`;
  }
  if (added > 0) return `${inWords(added)} ${noun(added)} added`;
  if (removed > 0) return `${inWords(removed)} ${noun(removed)} removed`;
  return null;
}

/**
 * "Questions changed between #48 and #50 (one question removed), so these aren't compared." Without the
 * questions themselves (an audit with no stored everyday row), no parenthesis.
 */
export function questionsChangedNote(
  earlierAuditNumber: number,
  laterAuditNumber: number,
  change: QuestionSetChange | null,
): string {
  const words = questionSetChangeWords(change);
  return `Questions changed between #${earlierAuditNumber} and #${laterAuditNumber}${words ? ` (${words})` : ""}, so these aren't compared.`;
}
