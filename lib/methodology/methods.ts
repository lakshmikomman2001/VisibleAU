// ⚠️ Citations here must be primary-sourced: every figure needs a URL that
// actually contains it when opened. No aggregator-only, secondhand, or
// unsourced figures -- task NN removed a fabricated "SE Ranking 129K-domain
// study" (two citationUrls that didn't actually contain the claimed data,
// confirmed by opening them).
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
      "Adding relevant quantitative data to content was a top-3 GEO method (+30–40% Position-Adjusted Word Count).",
    citation: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    citationUrl: "https://arxiv.org/abs/2311.09735",
    effort: "medium",
  },
  {
    id: "quotation-addition",
    name: "Include Credible Expert Quotes",
    dimension: "context",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description: "Incorporating credible quotes was the third top-performing GEO method.",
    citation: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    citationUrl: "https://arxiv.org/abs/2311.09735",
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
    effectSizeDelta: "mixed evidence",
    description:
      "FAQ blocks and structured data are commonly recommended for AI search visibility, but a large-scale Ahrefs study (1,885 pages, 7 months) found no statistically significant lift in AI citations from schema alone — evidence across sources is mixed. A supporting factor, not a guarantee.",
    citation: "Ahrefs",
    citationUrl: "https://ahrefs.com/blog/schema-ai-citations/",
    effort: "low",
  },
  {
    id: "comparison-tables",
    name: "Add Structured Comparison Tables",
    dimension: "context",
    effectSizeDelta: "directional",
    description:
      "AI engines frequently extract well-structured tables for recommendation and comparison answers — a directional best practice without a specific, verified lift figure.",
    citation: "General AEO structuring practice (no verified primary-source figure)",
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
    effectSizeDelta: "directional",
    description:
      "Pages with well-organised headings (clean H1–H3 hierarchy, lists) are easier for AI engines to parse and extract from — a directional best practice without a specific, verified lift figure.",
    citation: "General AEO structuring practice (no verified primary-source figure)",
    effort: "low",
  },
  {
    id: "authoritative-lists",
    name: 'Get Featured on "Best of" Lists',
    dimension: "frequency",
    effectSizeDelta: "directional",
    description:
      'Industry rankings and "best of" compilations are commonly cited as a driver of AI commercial recommendations, alongside awards and reviews — a directional best practice without a specific, verified lift figure.',
    citation: "General AEO best practice (no verified primary-source figure)",
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
