/**
 * Task VVV: the citability-methods seed (`db/seed/citability-methods/seed.ts`)
 * and the methodology page's citation list (`lib/methodology/methods.ts`)
 * were two independent lists that drifted -- that drift is exactly how the
 * "SE Ranking Dec 2025" fabrication (task NN, removed from methods.ts)
 * survived unnoticed in the seed for months until task KKK found it there
 * (fixed separately in task UUU).
 *
 * Every (name, url) pair here has already been independently verified by
 * opening the URL and confirming it actually contains the claim attributed
 * to it (tasks NN/III/JJJ). Both the seed and methods.ts import from here
 * instead of re-typing the same strings, so a future citation fix (or a
 * future fabrication) can't drift between the two again.
 */
export const VERIFIED_CITATIONS = {
  aggarwalGEO: {
    name: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    url: "https://arxiv.org/abs/2311.09735",
  },
  ahrefsBenchmark: {
    name: "Ahrefs Q1-2026 AI Search Benchmark (75K brands)",
    url: "https://ahrefs.com/blog/ai-brand-visibility-correlations/",
  },
  ahrefsSchema: {
    name: "Ahrefs",
    url: "https://ahrefs.com/blog/schema-ai-citations/",
  },
  zyppyLeapd: {
    name: "Zyppy (via Leapd analysis)",
    url: "https://www.leapd.ai/blog/ai-visibility/how-chatgpt-google-ai-overviews-and-perplexity-source-information-in-2026",
  },
  ahrefsMisinformation: {
    name: "Ahrefs Q1-2026 AI misinformation experiment",
    url: "https://www.businesswire.com/news/home/20260526119691/en/",
  },
} as const;

export type VerifiedCitationKey = keyof typeof VERIFIED_CITATIONS;

/**
 * Strings that have already been proven, by direct investigation, to cite a
 * study that doesn't exist (task NN: "SE Ranking Dec 2025", confirmed to
 * exist nowhere in the literature; task UUU found it surviving in two
 * seed files + a QA fixture). A guard test asserts neither list ever
 * reintroduces any of these.
 */
export const KNOWN_FABRICATED_SOURCE_PATTERNS = [/SE Ranking/i, /4\.9 vs 4\.4/i, /5\.0 vs 3\.9/i];

/**
 * Task YYY: a DIFFERENT mis-citation class from the fabrications above --
 * a real paper, pointed at the wrong arXiv id. `db/seed/recommendations/
 * research-citations.ts` (and a QA fixture copying it) cited "Princeton
 * GEO Study (2024)" with arxiv.org/abs/**2404.11973**, which is actually
 * "A critical review of methods and challenges in large language models"
 * -- unrelated to Aggarwal et al.'s real GEO paper, arxiv.org/abs/
 * **2311.09735** (the id this module actually uses, see aggarwalGEO
 * above). A guard test asserts this wrong id never reappears anywhere.
 */
export const KNOWN_WRONG_CITATION_IDS = [/2404\.11973/];

/**
 * Task XXX: Action Center's Evidence Link renders `recommendation_research`
 * rows live, with no provenance gate at all -- unlike /methods (task VVV),
 * which only shows a source when it's one of the pairs below. This derives
 * the same honest classification at runtime for any (source, url) pair,
 * so the Evidence Link can apply the identical gate without a schema
 * change or a second hand-maintained classification.
 *
 * Deliberately an EXACT match on both name and url -- a close-but-not-
 * identical pair (wrong arXiv id, a near-miss title) must not be waved
 * through as "research" just because it looks similar. Conservative by
 * design: anything that doesn't exactly match falls through to
 * "vunnara_estimate", never "research" by accident.
 */
export function deriveSourceType(
  source: string,
  url: string | null | undefined,
): "research" | "vunnara_estimate" {
  const isVerified = Object.values(VERIFIED_CITATIONS).some(
    (c) => c.name === source && c.url === url,
  );
  return isVerified ? "research" : "vunnara_estimate";
}
