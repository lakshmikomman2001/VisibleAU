// 19 Nov (Sri's review of /methodology): every source re-opened (see ./verified-citations.ts), and no method
// carries a dimension tag any more: four said "Context", which is "Not scored" everywhere else, and none of these
// studies measured the dimensions we score (Frequency, Position, Source citation).
//
// ⚠️ Citations here must be primary-sourced: every figure needs a URL that
// actually contains it when opened. No aggregator-only, secondhand, or
// unsourced figures -- task NN removed a fabricated "SE Ranking 129K-domain
// study" (two citationUrls that didn't actually contain the claimed data,
// confirmed by opening them).
//
// Task VVV: the verified (name, url) pairs below are single-sourced from
// ./verified-citations -- db/seed/citability-methods/seed.ts imports the
// same constants, so a citation fix (or a future fabrication) can't drift
// between the two lists the way "SE Ranking Dec 2025" did (task UUU).
import { VERIFIED_CITATIONS } from "./verified-citations";

export type CitabilityMethod = {
  id: string;
  name: string;
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
    effectSizeDelta: "+30–40% (GEO-bench)",
    description:
      "Including citations from credible sources is one of three top-performing GEO methods, improving visibility by 30–40% on the Position-Adjusted Word Count metric in the Princeton study. Most effective for factual queries.",
    citation: VERIFIED_CITATIONS.aggarwalGEO.name,
    citationUrl: VERIFIED_CITATIONS.aggarwalGEO.url,
    effort: "medium",
  },
  {
    id: "statistics-addition",
    name: "Add Relevant Statistics",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description:
      "Adding relevant quantitative data to content was a top-3 GEO method (+30–40% Position-Adjusted Word Count).",
    citation: VERIFIED_CITATIONS.aggarwalGEO.name,
    citationUrl: VERIFIED_CITATIONS.aggarwalGEO.url,
    effort: "medium",
  },
  {
    id: "quotation-addition",
    name: "Include Credible Expert Quotes",
    effectSizeDelta: "+30–40% (GEO-bench)",
    description: "Incorporating credible quotes was the third top-performing GEO method.",
    citation: VERIFIED_CITATIONS.aggarwalGEO.name,
    citationUrl: VERIFIED_CITATIONS.aggarwalGEO.url,
    effort: "medium",
  },
  {
    id: "fluency-optimization",
    name: "Improve Fluency & Readability",
    effectSizeDelta: "+15–30% (GEO-bench)",
    description:
      "Stylistic improvements (Fluency Optimization and Easy-to-Understand) produced a 15–30% visibility boost in the Princeton study — evidence that generative engines value clear, readable writing, not just content additions.",
    citation: VERIFIED_CITATIONS.aggarwalGEO.name,
    citationUrl: VERIFIED_CITATIONS.aggarwalGEO.url,
    effort: "low",
  },
  {
    id: "youtube-presence",
    name: "Build YouTube Brand Mentions",
    effectSizeDelta: "strongest correlate (r≈0.74)",
    description:
      "Across 75,000 brands, mentions in YouTube video titles, transcripts and descriptions were the single strongest correlate of AI visibility (r≈0.737) — ahead of every other signal. The study covered ChatGPT and Google's AI answers, not Claude, Gemini or Perplexity. Note: this is a correlation, not a guaranteed lift.",
    citation: VERIFIED_CITATIONS.ahrefsBenchmark.name,
    citationUrl: VERIFIED_CITATIONS.ahrefsBenchmark.url,
    effort: "high",
  },
  {
    id: "brand-web-mentions",
    name: "Earn Branded Web Mentions",
    effectSizeDelta: "high correlate (r≈0.66–0.71)",
    description:
      "Branded web mentions correlate strongly with AI visibility (r≈0.66–0.71) across the same 75,000-brand study, which covered ChatGPT and Google's AI answers, not Claude, Gemini or Perplexity. Correlation, not a direct lift.",
    citation: VERIFIED_CITATIONS.ahrefsBenchmark.name,
    citationUrl: VERIFIED_CITATIONS.ahrefsBenchmark.url,
    effort: "high",
  },
  {
    id: "structured-data-faq",
    name: "Add FAQ & Structured Data Schema",
    effectSizeDelta: "mixed evidence",
    description:
      "FAQ blocks and structured data are commonly recommended for AI search visibility, but a large-scale Ahrefs study (1,885 pages, Aug 2025–Mar 2026) found no statistically significant lift in AI citations from schema alone — evidence across sources is mixed. A supporting factor, not a guarantee.",
    citation: VERIFIED_CITATIONS.ahrefsSchema.name,
    citationUrl: VERIFIED_CITATIONS.ahrefsSchema.url,
    effort: "low",
  },
  {
    id: "comparison-tables",
    name: "Add Structured Comparison Tables",
    effectSizeDelta: "directional",
    description:
      "AI engines frequently extract well-structured tables for recommendation and comparison answers — a directional best practice without a specific, verified lift figure.",
    citation: "General AEO structuring practice (no verified primary-source figure)",
    effort: "low",
  },
  {
    id: "front-load-answers",
    name: "Front-Load the Answer (first 30%)",
    effectSizeDelta: "44.2% of ChatGPT citations",
    description:
      "In 18,012 verified ChatGPT citations, 44.2% came from the first 30% of the cited page's text. ChatGPT only: the study didn't look at other engines. Put your direct answer, key facts and strongest data in the opening third.",
    citation: VERIFIED_CITATIONS.indigFrontLoad.name,
    citationUrl: VERIFIED_CITATIONS.indigFrontLoad.url,
    effort: "low",
  },
  {
    id: "heading-structure",
    name: "Use Clear Heading Structure",
    effectSizeDelta: "directional",
    description:
      "Pages with well-organised headings (clean H1–H3 hierarchy, lists) are easier for AI engines to parse and extract from — a directional best practice without a specific, verified lift figure.",
    citation: "General AEO structuring practice (no verified primary-source figure)",
    effort: "low",
  },
  {
    id: "authoritative-lists",
    name: 'Get Featured on "Best of" Lists',
    effectSizeDelta: "directional",
    description:
      'Industry rankings and "best of" compilations are commonly cited as a driver of AI commercial recommendations, alongside awards and reviews — a directional best practice without a specific, verified lift figure.',
    citation: "General AEO best practice (no verified primary-source figure)",
    effort: "high",
  },
  {
    id: "nap-consistency",
    name: "Keep NAP & Entity Facts Consistent",
    effectSizeDelta: "reduces hallucination (directional)",
    description:
      "Consistent Name/Address/Phone and entity facts across directories reduce AI hallucinations about your business. An Ahrefs experiment showed models repeated fabricated claims as fact — even when an official FAQ denied them — underscoring why consistent, authoritative facts matter. Directional finding, not a % lift.",
    citation: VERIFIED_CITATIONS.ahrefsMisinformation.name,
    citationUrl: VERIFIED_CITATIONS.ahrefsMisinformation.url,
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
