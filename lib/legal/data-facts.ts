import { RESPONSE_SNIPPET_CHARS } from "@/lib/audit/response-snippet";
import {
  AUDIT_DATA_RETENTION_MONTHS,
  CRAWLER_LOG_RETENTION_DAYS,
  SAMPLE_AUDIT_RETENTION_HOURS,
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
 * 20 Nov (part 4): what goes to DataForSEO with each question besides the question itself -- the Google location it's
 * checked from (lib/serp/dataforseo.ts `location_code`, lib/google-surfaces/location.ts). One phrase for the FAQ
 * (lib/marketing/google-ai.ts googleAiDataSentence) and the privacy page, which didn't say it. Here, not in google-ai.ts,
 * so the privacy page reads it without the Google setting-aware wording (tests/unit/google-surfaces guard).
 */
export const GOOGLE_CHECKED_FROM_PLACE =
  "the place they're checked from (your postcode where Google supports it, otherwise your suburb, city or state capital)";

/**
 * 20 Nov (part 4): what the information is used for, as the code uses it. The privacy page said "used solely to run AI
 * visibility audits and deliver reports", but adding a business also sends its home page to Anthropic to work out what
 * kind of business it is (lib/brands/classify-brand.ts), and the account's email gets sign-in, invite and alert emails.
 */
export const INFORMATION_USE =
  "We use your information to run your audits and show you their results, to work out what kind of business each one you add is (from its home page, by Anthropic's Claude, as above), and to send the emails and reports you sign up for or ask for. We do not sell your data.";

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
 * weekly job deletes them CRAWLER_LOG_RETENTION_DAYS after the visit. 20 Nov (part 5): the file itself waits in private
 * storage only until it's read, and is deleted then (or when reading it fails for the last time); it went into the
 * background-job service's (Inngest's) event, which keeps events for its own period
 * (lib/agent-analytics/log-upload-storage.ts).
 */
export const SERVER_LOGS_KEPT = `If you upload your server logs, we keep the AI crawlers' visits from them (the crawler, the page, the time, the response code and the IP address it came from) for ${CRAWLER_LOG_RETENTION_DAYS} days. The file itself is deleted once we've read it.`;

/**
 * 20 Nov (part 9): the free sample audit on the home page (no sign-up) keeps the website address it was given, with the
 * kind of business and the suburb, and its questions and answers, for SAMPLE_AUDIT_RETENTION_HOURS -- then the daily
 * clean-up deletes all of it, the address included (lib/sample-audit/retention.ts; the weekly retention job runs it too).
 */
export const SAMPLE_DATA_DELETED = `If you run the free sample audit, we delete the website address you gave and its questions and answers ${SAMPLE_AUDIT_RETENTION_HOURS === 24 ? "a day" : `${SAMPLE_AUDIT_RETENTION_HOURS} hours`} after you ran it.`;
