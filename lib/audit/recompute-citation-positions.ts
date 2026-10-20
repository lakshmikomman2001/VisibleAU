import { detectBrandMention } from "@/lib/audit/detect-mention";

export interface CitationPositionInput {
  brandMentioned: boolean;
  responseText: string | null;
  responseSnippet: string | null;
}

/**
 * Vunnara (21 Oct, hotfix: "Usually #16") -- the one shared way every
 * remaining per-citation-row or per-engine display recomputes a real
 * list rank, instead of trusting the stored `citations.position`
 * column (the OLD character-offset heuristic -- see lib/scoring/
 * resolve-audit-dimensions.ts's own doc comment for the full story).
 * That file's own batched, multi-audit recompute already covers the
 * headline dimension grid; this is for the OTHER surfaces that still
 * read the column directly -- the audit page's raw per-answer list,
 * the brand page's engine breakdown, the `/full` and `/export` API
 * routes, and the PDF -- each bounded to one audit's own (already-
 * fetched) rows, never a new per-row query.
 *
 * detectBrandMention is async only for interface consistency (pure
 * regex/string matching inside, no I/O), so mapping an already-fetched
 * row set through it is one extra in-process pass, not N+1.
 */
export async function recomputeCitationPositions<T extends CitationPositionInput>(
  rows: readonly T[],
  brand: { name: string; domain: string },
): Promise<(T & { realPosition: number | null })[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.brandMentioned) return { ...row, realPosition: null };
      const text = row.responseText ?? row.responseSnippet ?? "";
      const mention = await detectBrandMention(text, brand);
      return { ...row, realPosition: mention.position };
    }),
  );
}
