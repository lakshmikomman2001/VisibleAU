import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";
import {
  AUDIT_DATA_RETENTION_MONTHS,
  CRAWLER_LOG_RETENTION_DAYS,
} from "@/lib/governance/residency-config";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { TIER_ENGINES } from "@/lib/llm/tier-engines";

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

/**
 * 19 Nov (Sri's review of the landing page's "Is my data safe?"): the companies an audit's questions go to, by name,
 * not "the AI providers" -- one per engine (lib/llm/interface.ts), as the privacy page's Third-party services lists
 * them.
 */
export const AUDIT_AI_PROVIDERS =
  "OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini) and Perplexity";

/** "ChatGPT and Perplexity": the Free plan's engines (lib/llm/tier-engines.ts). */
export const FREE_PLAN_ENGINE_NAMES = (TIER_ENGINES.free ?? [])
  .map((engine) => ENGINE_DISPLAY_NAMES[engine])
  .join(" and ");

/**
 * What the 12-month job (inngest/functions/audit-data-retention.ts, lib/retention/audit-retention.ts) doesn't delete:
 * generated PDF reports (generated_reports and their files in storage) and the evidence archive (evidence_snapshots)
 * outlive the audit (residency-config's KEPT_UNTIL_ASKED). The privacy page and the FAQ say so in these words.
 */
export const KEPT_UNTIL_YOU_ASK = `Two copies are kept until you ask us to delete them: PDF reports you've made, and your business's evidence archive (the first ${RESPONSE_SNIPPET_CHARS} characters of each answer, with its question).`;

/**
 * Uploaded server logs (the Agent Analytics upload, inngest/functions/parse-crawler-log.ts): only the lines from a
 * known AI crawler are saved (lib/agent-analytics/parse-crawler-log.ts discards the rest), each with the crawler's
 * name, the page, the response code, the time, the size and the IP address it came from (crawler_visit_logs), and the
 * weekly job deletes them CRAWLER_LOG_RETENTION_DAYS after the visit. Not "nothing else is kept": the upload route
 * sends the whole file to the background-job service (Inngest) in its event, which keeps events for its own period.
 */
export const SERVER_LOGS_KEPT = `If you upload your server logs, we keep the AI crawlers' visits from them (the crawler, the page, the time, the response code and the IP address it came from) for ${CRAWLER_LOG_RETENTION_DAYS} days.`;
