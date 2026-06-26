export type CitabilityMethod = {
  id: string;
  name: string;
  dimension: "frequency" | "position" | "sentiment" | "context" | "accuracy";
  effectSizeDelta: string;
  description: string;
  citation: string;
  citationUrl?: string;
  effort: "low" | "medium" | "high";
};

export const CITABILITY_METHODS: CitabilityMethod[] = [
  {
    id: "cite-sources",
    name: "Add Citations to Reliable Sources",
    dimension: "position",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description:
      "Including citations from credible sources is one of three top-performing GEO methods, improving visibility by 30–40% on the Position-Adjusted Word Count metric in the Princeton study. Most effective for factual queries.",
    citation: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    citationUrl: "https://arxiv.org/abs/2311.09735",
    effort: "medium",
  },
  {
    id: "statistics-addition",
    name: "Add Relevant Statistics",
    dimension: "context",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description:
      "Adding relevant quantitative data to content was a top-3 GEO method (+30–40% Position-Adjusted Word Count). A separate SE Ranking study found pages with 19+ data points averaged 5.4 ChatGPT citations vs 2.8 for data-sparse pages.",
    citation: "GEO (KDD 2024); SE Ranking 129K-domain study",
    citationUrl: "https://arxiv.org/abs/2311.09735",
    effort: "medium",
  },
  {
    id: "quotation-addition",
    name: "Include Credible Expert Quotes",
    dimension: "context",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description:
      "Incorporating credible quotes was the third top-performing GEO method. Corroborated by SE Ranking: pages with expert quotes averaged 4.1 ChatGPT citations vs 2.4 without.",
    citation: "GEO (KDD 2024); SE Ranking 129K-domain study",
    citationUrl: "https://foglift.io/blog/ai-search-ranking-factors",
    effort: "medium",
  },
  {
    id: "fluency-optimization",
    name: "Improve Fluency & Readability",
    dimension: "context",
    effectSizeDelta: "+15–30% (GEO-bench)",
    description:
      "Stylistic improvements (Fluency Optimization and Easy-to-Understand) produced a 15–30% visibility boost in the Princeton study — evidence that generative engines value clear, readable writing, not just content additions.",
    citation: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    citationUrl: "https://arxiv.org/abs/2311.09735",
    effort: "low",
  },
  {
    id: "youtube-presence",
    name: "Build YouTube Brand Mentions",
    dimension: "frequency",
    effectSizeDelta: "strongest correlate (r≈0.74)",
    description:
      "Across 75,000 brands, mentions in YouTube video titles, transcripts and descriptions were the single strongest correlate of AI visibility (r≈0.737) — ahead of every other signal. Note: this is a correlation, not a guaranteed lift.",
    citation: "Ahrefs Q1-2026 AI Search Benchmark (75K brands)",
    citationUrl: "https://ahrefs.com/blog/ai-brand-visibility-correlations/",
    effort: "high",
  },
  {
    id: "brand-web-mentions",
    name: "Earn Branded Web Mentions",
    dimension: "frequency",
    effectSizeDelta: "high correlate (r≈0.66–0.71)",
    description:
      "Branded web mentions correlate strongly with AI visibility (r≈0.66–0.71) across the same 75K-brand study. Earned media outperforms owned-channel content for AI citations. Correlation, not a direct lift.",
    citation: "Ahrefs Q1-2026 AI Search Benchmark (75K brands)",
    citationUrl: "https://ahrefs.com/blog/ai-brand-visibility-correlations/",
    effort: "high",
  },
  {
    id: "structured-data-faq",
    name: "Add FAQ & Structured Data Schema",
    dimension: "frequency",
    effectSizeDelta: "+44% citations",
    description:
      "Pages implementing structured data and FAQ blocks saw a 44% increase in AI search citations (BrightEdge); schema is also associated with roughly +40% more AI Overview appearances. A supporting factor, not a guarantee.",
    citation: "BrightEdge",
    citationUrl: "https://foglift.io/blog/ai-search-ranking-factors",
    effort: "low",
  },
  {
    id: "comparison-tables",
    name: "Add Structured Comparison Tables",
    dimension: "context",
    effectSizeDelta: "+44% citations",
    description:
      "Comparison tables (and FAQ blocks) were part of the BrightEdge finding of +44% AI search citations — AI engines frequently extract well-structured tables for recommendation and comparison answers.",
    citation: "BrightEdge",
    citationUrl: "https://foglift.io/blog/ai-search-ranking-factors",
    effort: "low",
  },
  {
    id: "front-load-answers",
    name: "Front-Load the Answer (first 30%)",
    dimension: "position",
    effectSizeDelta: "44.2% of citations",
    description:
      "Analysis of thousands of ChatGPT citations found 44.2% of all LLM citations come from the first 30% of a page. Put your direct answer, key facts and strongest data in the opening third.",
    citation: "Zyppy (via Leapd analysis)",
    citationUrl:
      "https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026",
    effort: "low",
  },
  {
    id: "heading-structure",
    name: "Use Clear Heading Structure",
    dimension: "position",
    effectSizeDelta: "2.8x more likely",
    description:
      "Pages with well-organised headings (clean H1–H3 hierarchy, lists) are 2.8x more likely to earn citations in AI search results — clear structure makes content machine-extractable.",
    citation: "AirOps",
    citationUrl: "https://www.superlines.io/articles/ai-search-statistics/",
    effort: "low",
  },
  {
    id: "authoritative-lists",
    name: 'Get Featured on "Best of" Lists',
    dimension: "frequency",
    effectSizeDelta: "41% of recommendations",
    description:
      '41% of ChatGPT commercial recommendations are influenced by industry rankings and "best of" compilations — the single largest driver of AI brand recommendations in the Onely analysis (awards 18%, reviews 16%).',
    citation: "Onely",
    citationUrl: "https://foglift.io/blog/ai-search-ranking-factors",
    effort: "high",
  },
  {
    id: "nap-consistency",
    name: "Keep NAP & Entity Facts Consistent",
    dimension: "accuracy",
    effectSizeDelta: "reduces hallucination (directional)",
    description:
      "Consistent Name/Address/Phone and entity facts across directories reduce AI hallucinations about your business. An Ahrefs experiment showed models repeated fabricated claims as fact — even when an official FAQ denied them — underscoring why consistent, authoritative facts matter. Directional finding, not a % lift.",
    citation: "Ahrefs Q1-2026 AI misinformation experiment",
    citationUrl: "https://www.businesswire.com/news/home/20260526119691/en/",
    effort: "low",
  },
];

export function getMethodsData() {
  const all = CITABILITY_METHODS;
  return {
    all,
    total: all.length,
    top10: all.slice(0, 10),
  };
}
