import { sql } from "drizzle-orm";
import { audits } from "@/db/schema";
import { matchesFailurePattern } from "@/lib/llm/failure-patterns";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";

const ENGINE_NAMES: Record<string, string> = { ...ENGINE_DISPLAY_NAMES };

/** "Claude", "Claude and Gemini", "ChatGPT, Claude and Gemini". */
export function engineNameList(engines: string[]): string {
  const names = engines.map((e) => ENGINE_NAMES[e] ?? e);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "Claude returned an error for all 13 questions, so this audit's
 * Visibility is based on 3 engines (30 answers)." -- the audit page's
 * banner and the alert email say the same thing.
 */
export function engineTotalFailureSentence(i: {
  engines: string[];
  questionCount: number;
  enginesAsked: number;
  answerCount: number;
}): string {
  const answeredEngines = i.enginesAsked - i.engines.length;
  const basis =
    answeredEngines > 0
      ? `so this audit's Visibility is based on ${answeredEngines} engine${answeredEngines === 1 ? "" : "s"} (${i.answerCount} answer${i.answerCount === 1 ? "" : "s"})`
      : "so this audit has no Visibility";
  return `${engineNameList(i.engines)} returned an error for all ${i.questionCount} question${i.questionCount === 1 ? "" : "s"}, ${basis}.`;
}

/**
 * URGENT audit #37 (31 Oct), item 2 -- a whole engine failing must be
 * loud. Two things every surface shares:
 *
 * 1. describeEngineFailure: one plain-language reason for a failed call,
 *    from engine_call_failures.error_class, the HTTP status code and a
 *    fixed list of message patterns. The message is matched HERE, on the
 *    server, and never sent to a page, an email or a log -- a provider's
 *    body can carry a masked key or an account id.
 * 2. fullyFailedEngines / everyEngineAnswered: which engines returned
 *    nothing at all, read from the audit row itself
 *    (metadata.engineFailures, written by both runners' finalize, against
 *    promptsCount) -- no extra query.
 */

export type EngineFailureReasonKey =
  | "spend_limit"
  | "account_or_credit"
  | "authentication"
  | "permission"
  | "model_not_found"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "search_tool"
  | "empty_response"
  | "parse_error"
  | "request_rejected"
  | "provider_server_error"
  | "unknown";

export interface EngineFailureReason {
  key: EngineFailureReasonKey;
  /** Shown next to the failure count, e.g. "Provider error: account/credit issue". */
  label: string;
  /** What to check, in one or two sentences. */
  check: string;
}

const REASONS: Record<EngineFailureReasonKey, Omit<EngineFailureReason, "key">> = {
  // Engine-failure follow-ups (1 Nov), item 1: audit #37's real cause -- a
  // monthly spend limit set in Anthropic's console, with credit left.
  spend_limit: {
    label: "Provider spend limit reached (a monthly limit set in the provider's console)",
    check: "Raise the monthly spend limit in the provider's console, or wait for it to reset.",
  },
  account_or_credit: {
    label: "Provider error: account/credit issue",
    check:
      "The provider says the account is out of credit or over its quota. Check billing and credits in the provider's console.",
  },
  authentication: {
    label: "Provider error: API key rejected",
    check:
      "The engine's API key is missing, wrong or revoked. Check it in Vercel's environment variables and in the provider's console.",
  },
  permission: {
    label: "Provider error: access denied",
    check:
      "The API key doesn't have access to this model or feature. Check the key's permissions in the provider's console.",
  },
  model_not_found: {
    label: "Provider error: model not found",
    check:
      "The model may have been retired or renamed. Check the engine's model against the provider's current list.",
  },
  rate_limited: {
    label: "Rate limited",
    check:
      "The provider's rate limit was still hit after retrying. It usually clears; if it repeats, check the account's rate-limit tier.",
  },
  overloaded: {
    label: "Provider overloaded",
    check:
      "The provider was over capacity, even after retrying. It usually clears on its own; check the provider's status page.",
  },
  timeout: {
    label: "Timed out",
    check:
      "The engine didn't answer in time, even after a retry. Check the provider's status page.",
  },
  search_tool: {
    label: "Web search failed",
    check: "The engine's web-search tool returned an error. Usually temporary.",
  },
  empty_response: {
    label: "Empty answer",
    check: "The engine answered with no text. Usually temporary.",
  },
  parse_error: {
    label: "Unreadable response",
    check:
      "The engine's response couldn't be read. If it repeats, the provider's format may have changed.",
  },
  request_rejected: {
    label: "Provider rejected the request",
    check:
      "The provider refused the request as sent. Check the model's limits and the request settings.",
  },
  provider_server_error: {
    label: "Provider server error",
    check: "The provider had an internal error. Usually temporary; it isn't retried today.",
  },
  unknown: {
    label: "Provider error",
    check: "No known cause. db/prod-fixes/diag-0108 shows the code and category for an audit.",
  },
};

/**
 * The HTTP status a failure message carries: "HTTP 400 ..." (written by
 * lib/llm/with-retry.ts since this change) or the first stand-alone
 * 4xx/5xx number ("Perplexity API 429: ..."). Null when there's none --
 * every AI SDK failure recorded before this change.
 */
export function statusCodeFromMessage(message: string | null | undefined): number | null {
  if (!message) return null;
  const match = message.match(/^HTTP (\d{3})\b/) ?? message.match(/\b([45]\d{2})\b/);
  if (!match) return null;
  const code = Number(match[1]);
  return code >= 400 && code <= 599 ? code : null;
}

function reason(key: EngineFailureReasonKey): EngineFailureReason {
  return { key, ...REASONS[key] };
}

export function describeEngineFailure(f: {
  errorClass: string;
  message: string | null;
}): EngineFailureReason {
  const message = f.message ?? "";
  const status = statusCodeFromMessage(f.message);
  // The patterns are lib/llm/failure-patterns.ts's, shared with the retry
  // classifier and the diag SQL. A spend limit is checked first: it can
  // arrive as 400 (Anthropic, a limit you set) or 429 (Anthropic's tier
  // cap, OpenAI), and its wording can mention billing or quota too.
  // Then an exhausted credit balance or quota: 400 (Anthropic), 402, or
  // 429 (OpenAI's insufficient_quota).
  if (matchesFailurePattern("spendLimit", message)) return reason("spend_limit");
  if (status === 402 || matchesFailurePattern("creditOrQuota", message)) {
    return reason("account_or_credit");
  }
  if (status === 401 || matchesFailurePattern("authentication", message)) {
    return reason("authentication");
  }
  if (status === 403 || matchesFailurePattern("permission", message)) return reason("permission");
  if (status === 404 || matchesFailurePattern("modelNotFound", message)) {
    return reason("model_not_found");
  }
  switch (f.errorClass) {
    case "rate_limited":
      return reason("rate_limited");
    case "overloaded":
      return reason("overloaded");
    case "timeout":
      return reason("timeout");
    case "search_tool_error":
      return reason("search_tool");
    case "empty_response":
      return reason("empty_response");
    case "parse_error":
      return reason("parse_error");
  }
  if (status !== null && status >= 400 && status < 500) return reason("request_rejected");
  if (status !== null && status >= 500) return reason("provider_server_error");
  return reason("unknown");
}

export interface EngineFailureSummary {
  failed: number;
  /** The most common reason among this engine's failures. */
  reason: EngineFailureReason;
}

/** Per engine: how many calls failed, and the main reason. */
export function summarizeEngineFailures(
  rows: Array<{ engine: string; errorClass: string; errorMessage: string | null }>,
): Map<string, EngineFailureSummary> {
  const byEngine = new Map<string, Map<EngineFailureReasonKey, number>>();
  for (const row of rows) {
    const key = describeEngineFailure({
      errorClass: row.errorClass,
      message: row.errorMessage,
    }).key;
    const counts = byEngine.get(row.engine) ?? new Map<EngineFailureReasonKey, number>();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    byEngine.set(row.engine, counts);
  }
  const out = new Map<string, EngineFailureSummary>();
  for (const [engine, counts] of byEngine) {
    let failed = 0;
    let top: EngineFailureReasonKey = "unknown";
    let topCount = 0;
    for (const [key, n] of counts) {
      failed += n;
      if (n > topCount) {
        top = key;
        topCount = n;
      }
    }
    out.set(engine, { failed, reason: reason(top) });
  }
  return out;
}

function engineFailureCounts(metadata: unknown): Record<string, number> {
  if (typeof metadata !== "object" || metadata === null) return {};
  const raw = (metadata as { engineFailures?: unknown }).engineFailures;
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, number> = {};
  for (const [engine, n] of Object.entries(raw)) {
    if (typeof n === "number" && Number.isFinite(n)) out[engine] = n;
  }
  return out;
}

/**
 * The engines that answered none of the audit's questions: every one of
 * its promptsCount calls failed. Empty for an audit still running (its
 * finalize hasn't written engineFailures yet) or one where every engine
 * answered at least once.
 */
export function fullyFailedEngines(audit: {
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
}): string[] {
  const prompts = audit.promptsCount ?? 0;
  if (prompts <= 0) return [];
  const failures = engineFailureCounts(audit.metadata);
  return (audit.engines ?? []).filter((engine) => (failures[engine] ?? 0) >= prompts);
}

/** "3 of 4 engines" when a whole engine failed; null when they all answered. */
export function engineCoverageLabel(audit: {
  engines: string[] | null;
  promptsCount: number | null;
  metadata: unknown;
}): string | null {
  const asked = audit.engines?.length ?? 0;
  const failed = fullyFailedEngines(audit).length;
  if (failed === 0 || asked === 0) return null;
  return `${asked - failed} of ${asked} engines`;
}

/**
 * The same rule as fullyFailedEngines, as a SQL condition on `audits`:
 * true when no engine's failure count reaches the audit's question count.
 * Used where audits are averaged or compared in SQL (the weekly trend).
 */
export const everyEngineAnswered = sql<boolean>`NOT EXISTS (
  SELECT 1
  FROM jsonb_each_text(
    CASE WHEN jsonb_typeof(${audits.metadata} -> 'engineFailures') = 'object'
      THEN ${audits.metadata} -> 'engineFailures' ELSE '{}'::jsonb END
  ) AS ef(engine, failed)
  WHERE coalesce(${audits.promptsCount}, 0) > 0
    AND ef.failed ~ '^[0-9]+$'
    AND ef.failed::int >= ${audits.promptsCount}
)`;
