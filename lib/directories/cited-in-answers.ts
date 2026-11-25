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

function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * S01C part 2a (LLD amendment 59): the one style for a Recommended next body, most-cited first: "Yellow Pages was
 * cited in 17, hipages in 7 and Airtasker in 5 of 40 answers"; directories cited equally often are named together,
 * "Local Business Guide and Whereis were each cited in 5 of 40 answers and Birdeye in 4" (the real reports repeated
 * "was cited in … of 40 answers" for each).
 */
export function wasCitedInAnswers(
  rows: ReadonlyArray<{ name: string; citedCount: number }>,
  totalAnswers: number,
): string {
  const groups: Array<{ names: string[]; count: number }> = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.count === r.citedCount) last.names.push(r.name);
    else groups.push({ names: [r.name], count: r.citedCount });
  }
  const [first, ...rest] = groups;
  if (!first) return "";
  const of = ofAnswers(totalAnswers);
  const together = first.names.length > 1;
  const head = together
    ? `${nameList(first.names)} were each cited in ${first.count}`
    : `${first.names[0]} was cited in ${first.count}`;
  const tail = rest.map((g) =>
    g.names.length > 1 ? `${nameList(g.names)} each in ${g.count}` : `${g.names[0]} in ${g.count}`,
  );
  if (tail.length === 0) return `${head} ${of}`;
  if (together) return `${head} ${of}${tail.length === 1 ? " and " : ", "}${nameList(tail)}`;
  return `${[head, ...tail.slice(0, -1)].join(", ")} and ${tail[tail.length - 1]} ${of}`;
}

/**
 * S01C part 2a (LLD amendment 59): what to do about cited directories whose profiles aren't linked. We only know a
 * profile isn't linked, never that the business isn't listed, so the action never says "get listed" or "create or
 * claim" as if that were known: "Add your Local Business Guide, Whereis and Birdeye profile links in brand settings,
 * or create the profiles if you don't have them". Rule i and today's directory finding print the same action.
 */
export function linkOrCreateProfilesAction(names: readonly string[]): string {
  const one = names.length === 1;
  return `Add your ${nameList(names)} ${one ? "profile link" : "profile links"} in brand settings, or create the ${one ? "profile" : "profiles"} if you don't have ${one ? "it" : "them"}`;
}
