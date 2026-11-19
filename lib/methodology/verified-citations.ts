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
/*
 * 19 Nov (Sri's review of /methodology), every source re-opened that day:
 * - aggarwalGEO: arXiv 2311.09735, "Accepted to KDD 2024"; its HTML version says Cite Sources, Quotation Addition
 *   and Statistics Addition "achieved a relative improvement of 30-40% on the Position-Adjusted Word Count metric",
 *   and Fluency Optimization and Easy-to-Understand "a significant visibility boost of 15-30%". The KDD version is
 *   doi 10.1145/3637528.3671900.
 * - ahrefsBenchmark: published 12 Dec 2025 (Louise Linehan), "75,000 brands", mentions "in ChatGPT, AI Mode, and AI
 *   Overviews" -- not Claude, Gemini or Perplexity. "YouTube mentions show the strongest correlation with AI
 *   visibility (~0.737)"; "Branded web mentions still correlate highly with AI visibility (0.66–0.71)". It was named
 *   after a Q1 2026 benchmark report, a name the post doesn't use (only a May 2026 press release files the finding
 *   under one).
 * - ahrefsSchema: "We Tracked 1,885 Pages Adding Schema. AI Citations Barely Moved." (11 May 2026): 1,885 pages that
 *   added JSON-LD between August 2025 and March 2026, against 4,000 control pages; ChatGPT +2.2% and Google AI Mode
 *   +2.4%, each "Statistically indistinguishable from zero".
 * - indigFrontLoad: "44.2% of all citations come from the first 30% of text (the intro)", Kevin Indig, "The science of
 *   how AI pays attention" (17 Feb 2026, his Growth Memo post republished in full on Search Engine Journal): "18,012
 *   verified citations for positional analysis", from Gauge's "roughly 3 million AI answers from ChatGPT". ChatGPT
 *   only. It was credited to "Zyppy (via Leapd analysis)": Leapd's post names Zyppy with no link, and no Zyppy study
 *   with the figure could be found.
 * - ahrefsMisinformation: the experiment itself (Mateusz Makosiewicz, 10 Dec 2025: a made-up brand, 56 questions, 8
 *   AI tools, fake sources planted, "an official FAQ to fight back"). It was cited by a press release
 *   (businesswire.com) that gives no figures and refuses automated readers.
 */
export const VERIFIED_CITATIONS = {
  aggarwalGEO: {
    name: "Aggarwal et al., GEO (Princeton, KDD 2024)",
    url: "https://arxiv.org/abs/2311.09735",
  },
  ahrefsBenchmark: {
    name: "Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)",
    url: "https://ahrefs.com/blog/ai-brand-visibility-correlations/",
  },
  ahrefsSchema: {
    name: "Ahrefs, schema and AI citations (1,885 pages, May 2026)",
    url: "https://ahrefs.com/blog/schema-ai-citations/",
  },
  indigFrontLoad: {
    name: "Kevin Indig, The science of how AI pays attention (Feb 2026; ChatGPT)",
    url: "https://www.searchenginejournal.com/the-science-of-how-ai-pays-attention/567597/",
  },
  ahrefsMisinformation: {
    name: "Ahrefs, made-up brand experiment (Dec 2025)",
    url: "https://ahrefs.com/blog/ai-vs-made-up-brand-experiment/",
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
