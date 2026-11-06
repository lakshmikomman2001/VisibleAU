import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { isCountedMention } from "@/lib/audit/organic-citations";

export function accuracyDimensionScore(
  citationRows: Array<{
    brandMentioned: boolean;
    mentionVerification: string | null;
    citedSources: unknown;
  }>,
): number {
  const mentionRows = citationRows.filter((c) => isCountedMention(c));
  if (mentionRows.length === 0) return 0;
  // Decision 1 (6 Nov): a source the answer cited, never a search result it didn't.
  const withSources = mentionRows.filter((c) => citedSourcesOf(c.citedSources).length > 0);
  return (withSources.length / mentionRows.length) * 100;
}
