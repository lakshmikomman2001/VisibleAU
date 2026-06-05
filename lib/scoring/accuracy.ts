export function accuracyDimensionScore(
  citationRows: Array<{ brandMentioned: boolean; citedSources: unknown }>,
): number {
  const mentionRows = citationRows.filter((c) => c.brandMentioned);
  if (mentionRows.length === 0) return 0;
  const withSources = mentionRows.filter((c) => {
    const sources = c.citedSources as Array<unknown>;
    return Array.isArray(sources) && sources.length > 0;
  });
  return (withSources.length / mentionRows.length) * 100;
}
