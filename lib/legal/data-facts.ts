import { AUDIT_DATA_RETENTION_MONTHS } from "@/lib/governance/residency-config";

/**
 * Mock-gate and retention follow-ups (9 Nov), part 5: what Vunnara sends to the AI providers and how long it
 * keeps an audit's results, in one place, so the privacy page, the FAQ and the Data Residency page say the same
 * thing. From the code:
 * - lib/brands/classify-brand.ts: the name, domain and home page's title, description and first heading go to
 *   Claude once, when a business is added;
 * - lib/prompts/build-prompt-pack.ts: an audit's questions never carry the domain;
 * - lib/brands/region-label.ts buildEngineLocation: a confirmed location's city and state go to ChatGPT's and
 *   Claude's web search;
 * - lib/retention/audit-retention.ts: an audit's questions and answers are deleted AUDIT_DATA_RETENTION_MONTHS
 *   after it ran.
 */
export const SENT_WHEN_A_BUSINESS_IS_ADDED =
  "When you add a business, we send its name and website address, with its home page's title, description and main heading, to Anthropic (Claude) to work out what kind of business it is.";

/** The questions an audit sends, as a phrase ("we send ... {AUDIT_QUESTIONS}."). Never the website address. */
export const AUDIT_QUESTIONS =
  "questions your customers might ask, which name your kind of business and the area you serve, and a few questions that name your business";

export const SENT_FOR_A_CONFIRMED_LOCATION =
  "Once you've confirmed your business's location, its city and state also go to ChatGPT's and Claude's web search as an approximate location.";

export const AUDIT_RESULTS_DELETED = `We delete an audit's results ${AUDIT_DATA_RETENTION_MONTHS} months after it ran, or sooner if you ask us to.`;
