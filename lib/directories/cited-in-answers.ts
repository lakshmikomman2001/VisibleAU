/**
 * Mock-gate and retention follow-ups (9 Nov), part 6 -- audit #42 (Omega Services) listed each directory as
 * "cited in k of 40 answers", then its High action said "They're cited in 32 of 48 directory citations": 48 was
 * answer-directory pairs, not answers, so it read like a different denominator. Every directory count is now in
 * the one unit, answers (lib/directories/citation-counts.ts counts a directory once per answer that cites it), and
 * written by these two functions: the audit page's panel and actions, the PDF, and the action items.
 */

function ofAnswers(totalAnswers: number): string {
  return `of ${totalAnswers} ${totalAnswers === 1 ? "answer" : "answers"}`;
}

/** "cited in 12 of 40 answers" */
export function citedInAnswers(citedCount: number, totalAnswers: number): string {
  return `cited in ${citedCount} ${ofAnswers(totalAnswers)}`;
}

/**
 * Several directories by name (13 Nov, part 3: a reason names everything its title names, so a count can't be
 * matched to the wrong directory): "hipages is cited in 8, Word of Mouth in 6 and Localsearch in 5 of 40 answers".
 */
export function namedCitedInAnswersList(
  rows: ReadonlyArray<{ name: string; citedCount: number }>,
  totalAnswers: number,
): string {
  const [first, ...rest] = rows;
  if (!first) return "";
  if (rest.length === 0)
    return `${first.name} is ${citedInAnswers(first.citedCount, totalAnswers)}`;
  const parts = [
    `${first.name} is cited in ${first.citedCount}`,
    ...rest.map((r) => `${r.name} in ${r.citedCount}`),
  ];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} ${ofAnswers(totalAnswers)}`;
}

/** Several directories, each counted in answers: "cited in 12, 10 and 10 of 40 answers". */
export function citedInAnswersList(counts: readonly number[], totalAnswers: number): string {
  const numbers =
    counts.length <= 1
      ? counts.join("")
      : `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}`;
  return `cited in ${numbers} ${ofAnswers(totalAnswers)}`;
}
