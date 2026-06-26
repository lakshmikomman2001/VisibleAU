// =============================================================================
// VisibleAU — lib/methodology/methods.ts (REBUILT with VERIFIABLE data, 26 Jun 2026)
// =============================================================================
//
// WHY THIS FILE WAS REBUILT
// The prior version of methods.ts attributed specific effect-size deltas (+12%,
// +15%, +18%, …) to named papers (Princeton KDD 2024, "AutoGEO ICLR 2026", etc.)
// where those exact per-method numbers do NOT appear in the cited sources — and
// "AutoGEO, ICLR 2026" is a FUTURE conference (ICLR 2026 had not occurred), so a
// peer-reviewed citation to it is impossible. On VisibleAU's methodology page —
// the one surface whose entire purpose is "we cite REAL research with REAL effect
// sizes" — fabricated/misattributed numbers are an existential brand risk: they
// are the exact snake-oil this product positions against.
//
// This rebuild replaces every entry with a claim that is:
//   (a) traceable to a real, checkable source, and
//   (b) framed honestly — the number means what the source actually measured.
//
// HONESTY RULES BAKED IN (keep these when you edit/extend):
//   1. Every `effectSizeDelta` must be a number that appears in the cited source,
//      OR be labelled as a correlation / directional finding (not a causal lift).
//   2. Correlations are NOT causal lifts. The Ahrefs 75k-brand study reports
//      CORRELATIONS (r-values) — phrase them as "correlates with", never "causes
//      a +X% lift". (The study itself says: improving the metric won't
//      automatically boost visibility.)
//   3. The GEO paper's numbers are RELATIVE improvements on its own metrics
//      (Position-Adjusted Word Count / Subjective Impression) measured on
//      GEO-bench — say so; don't imply they're universal real-world lifts.
//   4. Prefer ranges where the source gives a range ("30–40%"), not a fake-precise
//      single number.
//   5. `citation` names the source; `citationUrl` links to it. No source → no
//      number (drop the delta or mark it directional).
//
// THE 10 REAL SOURCES USED (all verified 26 Jun 2026):
//   - GEO (Aggarwal et al., Princeton, KDD 2024) — arxiv.org/abs/2311.09735
//     Headline: GEO boosts visibility up to ~40%; top methods (Cite Sources,
//     Quotation Addition, Statistics Addition) +30–40% on Position-Adjusted Word
//     Count, +15–30% Subjective Impression; best method +41%/+28%; Fluency/
//     Easy-to-Understand +15–30%; a rank-5 site saw +115% from Cite Sources;
//     combining strategies adds >5.5%; Keyword Stuffing performed WORSE than
//     baseline. Effectiveness varies by domain.
//   - SE Ranking 2025 ChatGPT-citation study, ~129K domains / 216K pages
//     (reported by Search Engine Journal; synthesised by Foglift)
//     foglift.io/blog/ai-search-ranking-factors — pages with expert quotes avg
//     4.1 citations vs 2.4 without; 19+ stat data points avg 5.4 vs 2.8.
//   - BrightEdge — structured data + FAQ/comparison-table pages saw +44% AI
//     search citations; schema → ~+40% AI Overview appearances.
//   - Ahrefs Q1-2026 AI Search Benchmark, 75,000 brands
//     ahrefs.com/blog/ai-brand-visibility-correlations — YouTube mentions are the
//     single strongest correlate of AI visibility (r≈0.737); branded web mentions
//     r≈0.66–0.71. (CORRELATIONS, not lifts.)
//   - Onely — 41% of ChatGPT commercial recommendations influenced by industry
//     "best of" lists/rankings; awards 18%, reviews 16%.
//   - Zyppy / Leapd — 44.2% of LLM citations come from the first 30% of a page.
//   - AirOps — pages with well-organised headings 2.8x more likely to be cited.
//   - "AI misinformation" experiment (Ahrefs Q1-2026) — models repeated fabricated
//     claims as fact even when an official FAQ denied them → consistent NAP/entity
//     facts matter for accuracy. (Directional, not a % lift.)
//   - Robots/crawler access: blocking GPTBot/ClaudeBot/PerplexityBot in robots.txt
//     = zero AI visibility (binary). (Foglift synthesis.)
//   - GEO domain-variance finding (same paper) — citations help factual queries;
//     statistics help Law/Government. (Used to keep claims honest about variance.)
//
// SCHEMA (unchanged from IL3):
//   id, name, dimension('frequency'|'position'|'sentiment'|'context'|'accuracy'),
//   effectSizeDelta (string), description, citation, citationUrl?, effort.
//
// SCOPE: This file currently holds the TOP ~12 verifiable methods. The page renders
// top-10 always-visible + "Show all N". Author additional rows ONLY when you have a
// real source for the claim — it is fine to ship fewer than 47 honest methods rather
// than 47 with invented numbers. If you keep the "47" language on the page, the page
// copy MUST match the actual array length (use `all.length`, not a hardcoded 47).
// =============================================================================

export type CitabilityMethod = {
  id: string;
  name: string;
  dimension: 'frequency' | 'position' | 'sentiment' | 'context' | 'accuracy';
  effectSizeDelta: string;   // a real number from the source, or a labelled correlation/range
  description: string;       // 1–2 sentences; honest about what the source measured
  citation: string;          // real source name
  citationUrl?: string;      // link to the source
  effort: 'low' | 'medium' | 'high';
};

export const CITABILITY_METHODS: CitabilityMethod[] = [
  {
    id: 'cite-sources',
    name: 'Add Citations to Reliable Sources',
    dimension: 'position',
    effectSizeDelta: '+30–40% (GEO-bench)',
    description:
      'Including citations from credible sources is one of three top-performing GEO methods, improving visibility by 30–40% on the Position-Adjusted Word Count metric in the Princeton study. Most effective for factual queries.',
    citation: 'Aggarwal et al., GEO (Princeton, KDD 2024)',
    citationUrl: 'https://arxiv.org/abs/2311.09735',
    effort: 'medium',
  },
  {
    id: 'statistics-addition',
    name: 'Add Relevant Statistics',
    dimension: 'context',
    effectSizeDelta: '+30–40% (GEO-bench)',
    description:
      'Adding relevant quantitative data to content was a top-3 GEO method (+30–40% Position-Adjusted Word Count). A separate SE Ranking study found pages with 19+ data points averaged 5.4 ChatGPT citations vs 2.8 for data-sparse pages.',
    citation: 'GEO (KDD 2024); SE Ranking 129K-domain study',
    citationUrl: 'https://arxiv.org/abs/2311.09735',
    effort: 'medium',
  },
  {
    id: 'quotation-addition',
    name: 'Include Credible Expert Quotes',
    dimension: 'context',
    effectSizeDelta: '+30–40% (GEO-bench)',
    description:
      'Incorporating credible quotes was the third top-performing GEO method. Corroborated by SE Ranking: pages with expert quotes averaged 4.1 ChatGPT citations vs 2.4 without.',
    citation: 'GEO (KDD 2024); SE Ranking 129K-domain study',
    citationUrl: 'https://foglift.io/blog/ai-search-ranking-factors',
    effort: 'medium',
  },
  {
    id: 'fluency-optimization',
    name: 'Improve Fluency & Readability',
    dimension: 'context',
    effectSizeDelta: '+15–30% (GEO-bench)',
    description:
      'Stylistic improvements (Fluency Optimization and Easy-to-Understand) produced a 15–30% visibility boost in the Princeton study — evidence that generative engines value clear, readable writing, not just content additions.',
    citation: 'Aggarwal et al., GEO (Princeton, KDD 2024)',
    citationUrl: 'https://arxiv.org/abs/2311.09735',
    effort: 'low',
  },
  {
    id: 'youtube-presence',
    name: 'Build YouTube Brand Mentions',
    dimension: 'frequency',
    effectSizeDelta: 'strongest correlate (r≈0.74)',
    description:
      'Across 75,000 brands, mentions in YouTube video titles, transcripts and descriptions were the single strongest correlate of AI visibility (r≈0.737) — ahead of every other signal. Note: this is a correlation, not a guaranteed lift.',
    citation: 'Ahrefs Q1-2026 AI Search Benchmark (75K brands)',
    citationUrl: 'https://ahrefs.com/blog/ai-brand-visibility-correlations/',
    effort: 'high',
  },
  {
    id: 'brand-web-mentions',
    name: 'Earn Branded Web Mentions',
    dimension: 'frequency',
    effectSizeDelta: 'high correlate (r≈0.66–0.71)',
    description:
      'Branded web mentions correlate strongly with AI visibility (r≈0.66–0.71) across the same 75K-brand study. Earned media outperforms owned-channel content for AI citations. Correlation, not a direct lift.',
    citation: 'Ahrefs Q1-2026 AI Search Benchmark (75K brands)',
    citationUrl: 'https://ahrefs.com/blog/ai-brand-visibility-correlations/',
    effort: 'high',
  },
  {
    id: 'structured-data-faq',
    name: 'Add FAQ & Structured Data Schema',
    dimension: 'frequency',
    effectSizeDelta: '+44% citations',
    description:
      'Pages implementing structured data and FAQ blocks saw a 44% increase in AI search citations (BrightEdge); schema is also associated with roughly +40% more AI Overview appearances. A supporting factor, not a guarantee.',
    citation: 'BrightEdge',
    citationUrl: 'https://foglift.io/blog/ai-search-ranking-factors',
    effort: 'low',
  },
  {
    id: 'comparison-tables',
    name: 'Add Structured Comparison Tables',
    dimension: 'context',
    effectSizeDelta: '+44% citations',
    description:
      'Comparison tables (and FAQ blocks) were part of the BrightEdge finding of +44% AI search citations — AI engines frequently extract well-structured tables for recommendation and comparison answers.',
    citation: 'BrightEdge',
    citationUrl: 'https://foglift.io/blog/ai-search-ranking-factors',
    effort: 'low',
  },
  {
    id: 'front-load-answers',
    name: 'Front-Load the Answer (first 30%)',
    dimension: 'position',
    effectSizeDelta: '44.2% of citations',
    description:
      'Analysis of thousands of ChatGPT citations found 44.2% of all LLM citations come from the first 30% of a page. Put your direct answer, key facts and strongest data in the opening third.',
    citation: 'Zyppy (via Leapd analysis)',
    citationUrl: 'https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026',
    effort: 'low',
  },
  {
    id: 'heading-structure',
    name: 'Use Clear Heading Structure',
    dimension: 'position',
    effectSizeDelta: '2.8x more likely',
    description:
      'Pages with well-organised headings (clean H1–H3 hierarchy, lists) are 2.8x more likely to earn citations in AI search results — clear structure makes content machine-extractable.',
    citation: 'AirOps',
    citationUrl: 'https://www.superlines.io/articles/ai-search-statistics/',
    effort: 'low',
  },
  {
    id: 'authoritative-lists',
    name: 'Get Featured on "Best of" Lists',
    dimension: 'frequency',
    effectSizeDelta: '41% of recommendations',
    description:
      '41% of ChatGPT commercial recommendations are influenced by industry rankings and "best of" compilations — the single largest driver of AI brand recommendations in the Onely analysis (awards 18%, reviews 16%).',
    citation: 'Onely',
    citationUrl: 'https://foglift.io/blog/ai-search-ranking-factors',
    effort: 'high',
  },
  {
    id: 'nap-consistency',
    name: 'Keep NAP & Entity Facts Consistent',
    dimension: 'accuracy',
    effectSizeDelta: 'reduces hallucination (directional)',
    description:
      'Consistent Name/Address/Phone and entity facts across directories reduce AI hallucinations about your business. An Ahrefs experiment showed models repeated fabricated claims as fact — even when an official FAQ denied them — underscoring why consistent, authoritative facts matter. Directional finding, not a % lift.',
    citation: 'Ahrefs Q1-2026 AI misinformation experiment',
    citationUrl: 'https://www.businesswire.com/news/home/20260526119691/en/',
    effort: 'low',
  },
];

// Convenience accessors used by the page (top-10 always-visible + "Show all").
// IMPORTANT: the page copy must use these lengths, NOT a hardcoded "47".
export function getMethodsData() {
  const all = CITABILITY_METHODS;
  return {
    all,
    total: all.length,
    top10: all.slice(0, 10),
  };
}
