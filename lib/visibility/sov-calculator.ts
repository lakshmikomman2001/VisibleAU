import { classifyByScore } from "@/lib/confidence-labels/classify";
import type { SovEntry } from "./types";

interface MentionCount {
  domain: string;
  count: number;
}

interface SovInput {
  engine: string;
  promptCategory: string;
  brandDomain: string;
  mentions: MentionCount[];
  totalPrompts: number;
}

export interface CitationRow {
  engine: string;
  brandMentioned: boolean;
  citedSources: unknown;
  /** Whether the source prompt named the brand directly (task AA). `true`
   * excludes the citation from the mention pool entirely -- a branded
   * prompt guarantees a trivial mention for whichever domain it names, for
   * every domain it cites, not just the brand's own count. `null` (rows
   * written before this was tracked) is treated as not-branded. */
  isBrandedPrompt: boolean | null;
}

export interface EngineMentionGroup {
  engine: string;
  category: string;
  mentions: MentionCount[];
  totalPrompts: number;
}

/**
 * Groups an audit's citation rows into per-engine mention counts, ready for
 * calculateShareOfVoice. Skips every citation from a branded prompt (both
 * the brand's own mention AND anything else that response cited) so the
 * remaining pool stays a coherent, honest sample of unprompted visibility.
 */
export function groupCitationsByEngine(
  rows: CitationRow[],
  brandDomain: string,
): EngineMentionGroup[] {
  const grouped = new Map<
    string,
    { engine: string; category: string; mentions: Map<string, number>; total: number }
  >();

  for (const row of rows) {
    if (row.isBrandedPrompt === true) continue;

    const category = "general";
    const key = `${row.engine}:${category}`;
    const entry = grouped.get(key) ?? {
      engine: row.engine,
      category,
      mentions: new Map<string, number>(),
      total: 0,
    };
    entry.total++;

    if (row.brandMentioned) {
      entry.mentions.set(brandDomain, (entry.mentions.get(brandDomain) ?? 0) + 1);
    }

    const sources = Array.isArray(row.citedSources) ? row.citedSources : [];
    for (const src of sources as Array<{ url?: string; domain?: string }>) {
      const domain = src.domain ?? (src.url ? new URL(src.url).hostname : null);
      if (domain && domain !== brandDomain) {
        entry.mentions.set(domain, (entry.mentions.get(domain) ?? 0) + 1);
      }
    }

    grouped.set(key, entry);
  }

  return Array.from(grouped.values()).map((g) => ({
    engine: g.engine,
    category: g.category,
    mentions: Array.from(g.mentions.entries()).map(([domain, count]) => ({ domain, count })),
    totalPrompts: g.total,
  }));
}

export function calculateShareOfVoice(input: SovInput): SovEntry[] {
  const { engine, promptCategory, brandDomain, mentions, totalPrompts } = input;

  if (totalPrompts === 0) return [];

  const totalMentions = mentions.reduce((sum, m) => sum + m.count, 0);
  if (totalMentions === 0) return [];

  const brandEntry = mentions.find((m) => m.domain.toLowerCase() === brandDomain.toLowerCase());
  const brandMentionCount = brandEntry?.count ?? 0;
  const brandShare = (brandMentionCount / totalMentions) * 100;

  const sampleQuality = classifyByScore(totalPrompts >= 30 ? 80 : totalPrompts >= 10 ? 50 : 20);

  const competitors = mentions.filter((m) => m.domain.toLowerCase() !== brandDomain.toLowerCase());

  return competitors.map((competitor) => ({
    competitorDomain: competitor.domain,
    promptCategory,
    engine,
    brandShare: Math.round(brandShare * 100) / 100,
    competitorShare: Math.round((competitor.count / totalMentions) * 100 * 100) / 100,
    totalPrompts,
    sampleQuality,
    // Raw counts, so a caller combining multiple engine groups can sum
    // counts (correct) instead of averaging or maxing rounded percentages
    // that each have their own denominator (wrong).
    brandMentionCount,
    competitorMentionCount: competitor.count,
    totalMentionCount: totalMentions,
  }));
}
