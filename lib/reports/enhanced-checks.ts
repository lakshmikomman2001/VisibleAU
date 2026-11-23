import type { BeyondAiAnswers } from "./beyond-ai";

/**
 * S01 part 9 (LLD 8.1.7 "Enhanced checks before rendering", decision D-RT4; contract P08.checks, P17 statuses): before
 * an Enhanced report, each check outside AI answers whose latest result is older than its window runs again through
 * its existing function; the rest are reused. One window logic for the panel's list ("will reuse" / "will run
 * again") and for the refresh itself, read from the same tiles the report prints (lib/reports/beyond-ai.ts).
 * - Business identity (ABN, .au, Wikipedia) 30 days, AI crawler access 7 days and the website technical score 30 days:
 *   all three come from one run of the existing technical audit (robots.txt, the ABR lookup with the GUID, the score).
 * - YouTube 7 days, only when a channel is linked and the check is enabled.
 * - Directory profiles: read from the basis audit; AI crawler visits: never fetched. Neither is refreshed.
 * None of them changes the Visibility score.
 */

export type EnhancedCheck = "identity" | "youtube" | "crawlers" | "technical";

export const ENHANCED_CHECK_WINDOW_DAYS: Record<EnhancedCheck, number> = {
  identity: 30,
  youtube: 7,
  crawlers: 7,
  technical: 30,
};

/** The whole refresh step stops after this; a check still running then prints "Couldn't check on {date}: ...". */
export const ENHANCED_REFRESH_TIMEOUT_MS = 5 * 60_000;

/** The checks one run of the existing technical audit refreshes together. */
export const SITE_CHECKS: readonly EnhancedCheck[] = ["identity", "crawlers", "technical"];

const DAY_MS = 86_400_000;

export type CheckDecision = "reuse" | "run" | "not_linked" | "off";

export interface EnhancedCheckPlanRow {
  check: EnhancedCheck;
  /** The latest result's date (ISO); null when there is none. */
  checkedAt: string | null;
  decision: CheckDecision;
}

function stale(checkedAt: string | null, windowDays: number, now: Date): boolean {
  if (!checkedAt) return true;
  return now.getTime() - new Date(checkedAt).getTime() > windowDays * DAY_MS;
}

/**
 * Which checks would run again now. `youtubeEnabled`: the check's code gate (TRUST_CHECK_IMPLEMENTED.youtubePresence);
 * without YOUTUBE_API_KEY the check itself stores "unavailable", so it isn't run for a report either.
 */
export function planEnhancedChecks(
  beyond: BeyondAiAnswers,
  now: Date,
  opts: { youtubeEnabled: boolean },
): EnhancedCheckPlanRow[] {
  const row = (check: EnhancedCheck, checkedAt: string | null): EnhancedCheckPlanRow => ({
    check,
    checkedAt,
    decision: stale(checkedAt, ENHANCED_CHECK_WINDOW_DAYS[check], now) ? "run" : "reuse",
  });
  const youtube: EnhancedCheckPlanRow =
    beyond.youtube.state === "not_linked"
      ? { check: "youtube", checkedAt: beyond.youtube.checkedAt, decision: "not_linked" }
      : !opts.youtubeEnabled
        ? { check: "youtube", checkedAt: beyond.youtube.checkedAt, decision: "off" }
        : row("youtube", beyond.youtube.checkedAt);
  return [
    row("identity", beyond.identity.checkedAt),
    youtube,
    row("crawlers", beyond.crawlers.checkedAt),
    row("technical", beyond.technical.checkedAt),
  ];
}

/** What happened to a check the refresh ran (appendix D `beyondAi.refreshed`). */
export interface RefreshOutcome {
  check: EnhancedCheck;
  previousCheckedAt: string | null;
  result: "measured" | "failed";
  /** For a failed refresh: why, in plain words ("the check took too long"). */
  reason: string | null;
}

export const REFRESH_TIMED_OUT = "the check took too long";
export const REFRESH_DIDNT_COMPLETE = "the check didn't complete";

/**
 * The tiles as the report prints them after a refresh: a check that ran but left no newer result (it failed before
 * writing one, or the step ran out of time) prints "Couldn't check on {date}: {reason}" with the refresh's date,
 * never the older result as if it were fresh. A check that wrote a result keeps that result's own tile. The outcomes
 * ride along as `refreshed` (appendix D).
 */
export function applyRefreshOutcomes(
  beyond: BeyondAiAnswers,
  outcomes: RefreshOutcome[],
  refreshedAt: Date,
): BeyondAiAnswers & { refreshed: RefreshOutcome[] } {
  const out: BeyondAiAnswers & { refreshed: RefreshOutcome[] } = { ...beyond, refreshed: outcomes };
  for (const o of outcomes) {
    if (o.result !== "failed") continue;
    const failed = {
      status: "failed" as const,
      checkedAt: refreshedAt.toISOString(),
      stale: false,
      failure: o.reason ?? REFRESH_DIDNT_COMPLETE,
    };
    if (o.check === "identity") out.identity = { ...out.identity, ...failed };
    if (o.check === "youtube") out.youtube = { ...out.youtube, ...failed };
    if (o.check === "crawlers") out.crawlers = { ...out.crawlers, ...failed };
    if (o.check === "technical") out.technical = { ...out.technical, ...failed };
  }
  return out;
}

/** P08's labels for the checks list, in the contract's order. */
export const CHECK_LABELS: Record<EnhancedCheck | "directories", string> = {
  identity: "Business identity (ABN)",
  youtube: "YouTube",
  crawlers: "AI crawler access",
  technical: "Website technical",
  directories: "Your directory profiles",
};

/** "today", "yesterday", "12 days ago", "2 months ago". */
export function checkAge(checkedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(checkedAt).getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** How long a re-run takes, roughly: the site checks crawl up to 20 pages; YouTube is one lookup. */
const DURATION: Record<EnhancedCheck, string> = {
  identity: "1 minute",
  crawlers: "1 minute",
  technical: "1 minute",
  youtube: "10 seconds",
};

/** P08.checks: each row's status line (contract copy; "Not checked yet" for a check that has never run). */
export function checkStatusLine(row: EnhancedCheckPlanRow, now: Date): string {
  if (row.decision === "not_linked") return "No channel linked · shown as not linked";
  if (row.decision === "off") return "Not checked · shown as not checked";
  const age = row.checkedAt ? `Checked ${checkAge(row.checkedAt, now)}` : "Not checked yet";
  return row.decision === "reuse"
    ? `${age} · will reuse`
    : `${age} · will run again (about ${DURATION[row.check]})`;
}

/** P08.checks's rows: the four checks with their status line, then the directory profiles from the basis audit. */
export function checksListRows(
  beyond: BeyondAiAnswers,
  now: Date,
  opts: { youtubeEnabled: boolean; basisAuditNumber: number | null },
): Array<{ key: string; label: string; status: string; willRun: boolean }> {
  const rows = planEnhancedChecks(beyond, now, { youtubeEnabled: opts.youtubeEnabled }).map(
    (r) => ({
      key: r.check,
      label: CHECK_LABELS[r.check],
      status: checkStatusLine(r, now),
      willRun: r.decision === "run",
    }),
  );
  return opts.basisAuditNumber === null
    ? rows
    : [
        ...rows,
        {
          key: "directories",
          label: CHECK_LABELS.directories,
          status: `From audit #${opts.basisAuditNumber}`,
          willRun: false,
        },
      ];
}
