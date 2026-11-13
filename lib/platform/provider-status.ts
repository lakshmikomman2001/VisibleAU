import { and, eq, gte, inArray, isNotNull, max, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, citations, engineCallFailures } from "@/db/schema";
import { googleSurfaceResults } from "@/db/schema/google-surfaces";
import { describeEngineFailure, type EngineFailureReasonKey } from "@/lib/audit/engine-failure";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { dataForSeoErrorCategory, stopsTheRun } from "@/lib/serp/dataforseo-errors";

/**
 * 13 Nov (Sri's walk-through, part 12): the dashboard said "All systems normal" -- a fixed label, checking
 * nothing -- the morning after Claude had answered "Provider spend limit reached" for all 14 questions of
 * audit #47 and 6 of #46. What it says now is measured, across every workspace's calls (provider state,
 * not anyone's answers), over the last 24 hours:
 * - a provider is unavailable when a failure that stops it until someone acts -- a spend limit, a daily
 *   search limit, an account or credit problem, a rejected key, denied access, a missing model (engines);
 *   a refused login or credit (DataForSEO) -- came after its last successful answer;
 * - "answered" only when answers were actually measured in that time; with none, nothing is claimed.
 * Rate limits, overloads and timeouts pass on their own and aren't an outage.
 */

export const STATUS_WINDOW_MS = 24 * 60 * 60_000;

const STOPS_THE_ENGINE: ReadonlySet<EngineFailureReasonKey> = new Set([
  "spend_limit",
  "search_daily_limit",
  "account_or_credit",
  "authentication",
  "permission",
  "model_not_found",
]);

export interface ProviderOutage {
  /** An engine ("claude") or "dataforseo". */
  provider: string;
  name: string;
  /** The first stopping failure after the last success. */
  since: Date;
  reason: string;
}

export interface ProviderStatus {
  outages: ProviderOutage[];
  /** Successful answers (engines and Google) measured in the window. */
  answered: number;
}

/** Pure: the outages from each provider's stopping failures and last success in the window. */
export function providerOutages(input: {
  failures: Array<{ provider: string; at: Date; reason: string; stops: boolean }>;
  lastSuccess: Record<string, Date | undefined>;
}): ProviderOutage[] {
  const outages = new Map<string, ProviderOutage>();
  for (const f of [...input.failures].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (!f.stops) continue;
    const success = input.lastSuccess[f.provider];
    if (success && success.getTime() >= f.at.getTime()) continue;
    if (outages.has(f.provider)) continue;
    outages.set(f.provider, {
      provider: f.provider,
      name:
        f.provider === "dataforseo"
          ? "Google AI checks"
          : ((ENGINE_DISPLAY_NAMES as Record<string, string>)[f.provider] ?? f.provider),
      since: f.at,
      reason: f.reason,
    });
  }
  // A success after the first stopping failure means it recovered, then failed again: the outage starts
  // at the first stopping failure after that success (handled by the lastSuccess check above).
  return [...outages.values()];
}

/** `onlyWorkspaces` narrows it to some workspaces (tests); the dashboard reads every workspace. */
export async function loadProviderStatus(
  now: Date = new Date(),
  onlyWorkspaces?: readonly string[],
): Promise<ProviderStatus> {
  const since = new Date(now.getTime() - STATUS_WINDOW_MS);
  const ids = onlyWorkspaces ? [...onlyWorkspaces] : null;
  const [engineFailures, googleFailures, engineSuccess, googleSuccess] = await Promise.all([
    serviceDb
      .select({
        engine: engineCallFailures.engine,
        at: engineCallFailures.createdAt,
        errorClass: engineCallFailures.errorClass,
        message: engineCallFailures.errorMessage,
      })
      .from(engineCallFailures)
      .where(
        and(
          gte(engineCallFailures.createdAt, since),
          ids ? inArray(engineCallFailures.organizationId, ids) : undefined,
        ),
      ),
    serviceDb
      .select({
        at: googleSurfaceResults.updatedAt,
        code: googleSurfaceResults.providerStatusCode,
      })
      .from(googleSurfaceResults)
      .where(
        and(
          gte(googleSurfaceResults.updatedAt, since),
          ids ? inArray(googleSurfaceResults.organizationId, ids) : undefined,
          inArray(googleSurfaceResults.outcome, ["failed", "not_completed"]),
          isNotNull(googleSurfaceResults.providerStatusCode),
        ),
      ),
    serviceDb
      .select({
        engine: citations.engine,
        last: max(citations.createdAt),
        count: sql<number>`count(*)::int`,
      })
      .from(citations)
      .where(
        and(
          gte(citations.createdAt, since),
          eq(citations.isCacheHit, false),
          ids
            ? inArray(
                citations.auditId,
                serviceDb
                  .select({ id: audits.id })
                  .from(audits)
                  .where(inArray(audits.organizationId, ids)),
              )
            : undefined,
        ),
      )
      .groupBy(citations.engine),
    serviceDb
      .select({ last: max(googleSurfaceResults.updatedAt), count: sql<number>`count(*)::int` })
      .from(googleSurfaceResults)
      .where(
        and(
          gte(googleSurfaceResults.updatedAt, since),
          ids ? inArray(googleSurfaceResults.organizationId, ids) : undefined,
          inArray(googleSurfaceResults.outcome, ["shown", "not_shown"]),
        ),
      ),
  ]);

  const lastSuccess: Record<string, Date | undefined> = {};
  let answered = 0;
  for (const row of engineSuccess) {
    if (row.last) lastSuccess[row.engine] = new Date(row.last);
    answered += Number(row.count);
  }
  if (googleSuccess[0]?.last) lastSuccess.dataforseo = new Date(googleSuccess[0].last);
  answered += Number(googleSuccess[0]?.count ?? 0);

  const failures = [
    ...engineFailures.map((f) => {
      const reason = describeEngineFailure({ errorClass: f.errorClass, message: f.message });
      return {
        provider: f.engine,
        at: f.at,
        reason: reason.label,
        stops: STOPS_THE_ENGINE.has(reason.key),
      };
    }),
    ...googleFailures.map((f) => {
      const category = dataForSeoErrorCategory(f.code);
      return {
        provider: "dataforseo",
        at: f.at,
        reason:
          category === "login_rejected"
            ? "the provider refused the login"
            : "the provider's credit ran out",
        stops: stopsTheRun(category),
      };
    }),
  ];
  return { outages: providerOutages({ failures, lastSuccess }), answered };
}

export interface ProviderStatusLine {
  tone: "ok" | "down";
  text: string;
  /** The provider the line is about, when it's an outage (the dashboard links its latest affected audit). */
  provider: string | null;
}

/** "22:30" today in Sydney, "12 Nov 22:30" on another day. */
function whenSydney(at: Date, now: Date): string {
  const day = (d: Date) => d.toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" });
  const time = at.toLocaleTimeString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (day(at) === day(now)) return time;
  const date = at.toLocaleDateString("en-AU", {
    timeZone: "Australia/Sydney",
    day: "numeric",
    month: "short",
  });
  return `${date} ${time}`;
}

/**
 * What the dashboard says for this workspace: an outage of an engine in its plan ("Claude unavailable since
 * 22:30 — audits use 3 engines"), or of Google's checks when its audits use them; else "answered" when
 * answers were measured; else nothing (null) -- never a status nobody measured.
 */
export function providerStatusLine(
  status: ProviderStatus,
  workspace: { planEngines: readonly string[]; usesGoogle: boolean },
  now: Date = new Date(),
): ProviderStatusLine | null {
  const relevant = status.outages.filter((o) =>
    o.provider === "dataforseo" ? workspace.usesGoogle : workspace.planEngines.includes(o.provider),
  );
  if (relevant.length > 0) {
    const down = relevant.filter((o) => workspace.planEngines.includes(o.provider)).length;
    const left = workspace.planEngines.length - down;
    const engines = down > 0 ? ` — audits use ${left} engine${left === 1 ? "" : "s"}` : "";
    return {
      tone: "down",
      text: `${relevant.map((o) => `${o.name} unavailable since ${whenSydney(o.since, now)}`).join("; ")}${engines}`,
      provider: relevant[0].provider,
    };
  }
  if (status.answered > 0) {
    return { tone: "ok", text: "AI engines answered in the last 24 hours", provider: null };
  }
  return null;
}
