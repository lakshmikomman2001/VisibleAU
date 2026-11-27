/**
 * S03 part 6 (LLD 8.3.3, D2; contract P07.mix, P07.split, P09.method; appendix E): the question mix line and the split
 * line, from an audit's question mix (lib/questions/mix.ts loads it). No database here: the report PDF prints the line
 * from its stored snapshot.
 */

export interface QuestionMix {
  total: number;
  everyday: number;
  branded: number;
  /** Everyday questions the agency wrote. */
  agency: number;
  /** Everyday questions from the original set, templates or AI suggestions. */
  nonAgency: number;
  /** Every everyday question is from the original set (no template, AI or agency question). */
  allOriginal: boolean;
  agencyName: string;
  /** Each kind's mentioned / successful everyday answers; only when the audit asked both kinds (D2). */
  split: { ai: { m: number; n: number }; agency: { m: number; n: number } } | null;
}

const pct = (m: number, n: number) => (n > 0 ? Math.round((m / n) * 100) : 0);

/** "{total} questions: {everyday} everyday ({...}) and {branded} that name the business." Zero parts left out. */
export function questionMixLine(mix: Omit<QuestionMix, "split">): string {
  let sources: string | null;
  if (mix.everyday === 0) sources = null;
  else if (mix.agency === 0)
    sources = mix.allOriginal ? "all from the original set" : `${mix.nonAgency} AI-suggested`;
  else
    sources = [
      mix.nonAgency > 0 ? `${mix.nonAgency} AI-suggested` : null,
      `${mix.agency} written by ${mix.agencyName}`,
    ]
      .filter(Boolean)
      .join(", ");
  const everyday =
    mix.everyday > 0 ? `${mix.everyday} everyday${sources ? ` (${sources})` : ""}` : null;
  const branded =
    mix.branded > 0
      ? `${mix.branded} that ${mix.branded === 1 ? "names" : "name"} the business`
      : null;
  const parts = [everyday, branded].filter(Boolean).join(" and ");
  return `${mix.total} ${mix.total === 1 ? "question" : "questions"}: ${parts}.`;
}

/** "AI-suggested questions: {pct}% ({m} of {n}) · Written by {agencyName}: {pct}% ({m} of {n})", or null. */
export function questionSplitLine(mix: QuestionMix): string | null {
  if (!mix.split) return null;
  const { ai, agency } = mix.split;
  return `AI-suggested questions: ${pct(ai.m, ai.n)}% (${ai.m} of ${ai.n}) · Written by ${mix.agencyName}: ${pct(agency.m, agency.n)}% (${agency.m} of ${agency.n})`;
}
