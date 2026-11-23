import type { BeyondAiAnswers, BeyondAiBrand } from "./beyond-ai";
import {
  ENHANCED_REFRESH_TIMEOUT_MS,
  type EnhancedCheck,
  planEnhancedChecks,
  REFRESH_DIDNT_COMPLETE,
  REFRESH_TIMED_OUT,
  type RefreshOutcome,
  SITE_CHECKS,
} from "./enhanced-checks";

/**
 * S01 part 9 (LLD 8.1.7, D-RT4): the refresh step before an Enhanced report renders. Reads the checks as the report
 * would print them now, re-runs only the ones older than their window through their existing functions (the runners
 * write their results where they always do, so the audit page and the next report see them too), waits at most
 * five minutes in all, then says what happened to each one it ran. A check that failed or ran out of time is reported
 * as such and the report still renders (applyRefreshOutcomes). Directory profiles and crawler visits are never
 * fetched. Nothing here reaches a customer but the tiles: the runners' own provider calls stay operator-side.
 */

export interface EnhancedRunners {
  /** One run of the existing technical audit: robots.txt (AI crawler access), the ABR lookup (identity), the score. */
  site: (brand: BeyondAiBrand) => Promise<void>;
  /** The existing YouTube presence check for the brand's linked channel. */
  youtube: (brand: BeyondAiBrand) => Promise<void>;
}

export async function refreshEnhancedChecks(input: {
  brand: BeyondAiBrand;
  /** The checks as of a moment (getBeyondAiAnswers under the workspace's RLS context). */
  read: (asOf: Date) => Promise<BeyondAiAnswers>;
  runners: EnhancedRunners;
  youtubeEnabled: boolean;
  now?: () => Date;
  timeoutMs?: number;
}): Promise<RefreshOutcome[]> {
  const clock = input.now ?? (() => new Date());
  const started = clock();
  const before = await input.read(started);
  const plan = planEnhancedChecks(before, started, { youtubeEnabled: input.youtubeEnabled });
  const due = plan.filter((r) => r.decision === "run");
  if (due.length === 0) return [];

  const runSite = due.some((r) => SITE_CHECKS.includes(r.check));
  const runYoutube = due.some((r) => r.check === "youtube");
  const tasks: Array<{ checks: EnhancedCheck[]; run: Promise<"done" | "failed"> }> = [];
  const settle = (p: Promise<void>) =>
    p.then(
      () => "done" as const,
      (err: unknown) => {
        console.warn(
          JSON.stringify({
            event: "enhanced_check_failed",
            brandId: input.brand.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        return "failed" as const;
      },
    );
  if (runSite)
    tasks.push({
      checks: due.filter((r) => SITE_CHECKS.includes(r.check)).map((r) => r.check),
      run: settle(input.runners.site(input.brand)),
    });
  if (runYoutube)
    tasks.push({ checks: ["youtube"], run: settle(input.runners.youtube(input.brand)) });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timed_out">((resolve) => {
    timer = setTimeout(() => resolve("timed_out"), input.timeoutMs ?? ENHANCED_REFRESH_TIMEOUT_MS);
  });
  const results = await Promise.all(tasks.map((t) => Promise.race([t.run, timedOut])));
  if (timer) clearTimeout(timer);

  // A second ahead: the results just written carry the database's microseconds, which a millisecond Date can fall
  // just short of (a row written in the same millisecond as this read would be left out).
  const after = await input.read(new Date(clock().getTime() + 1000));
  const tileDate = (check: EnhancedCheck): string | null => after[check].checkedAt;
  const outcomes: RefreshOutcome[] = [];
  tasks.forEach((task, i) => {
    for (const check of task.checks) {
      const previousCheckedAt = plan.find((r) => r.check === check)?.checkedAt ?? null;
      const latest = tileDate(check);
      const wroteNewer =
        latest !== null && (previousCheckedAt === null || latest > previousCheckedAt);
      if (wroteNewer && results[i] !== "timed_out") {
        outcomes.push({
          check,
          previousCheckedAt,
          result: after[check].status === "failed" ? "failed" : "measured",
          reason: after[check].status === "failed" ? after[check].failure : null,
        });
      } else {
        outcomes.push({
          check,
          previousCheckedAt,
          result: "failed",
          reason: results[i] === "timed_out" ? REFRESH_TIMED_OUT : REFRESH_DIDNT_COMPLETE,
        });
      }
    }
  });
  // Operators see each refresh (LLD 14, "Enhanced report checks" by check); customers see only the tiles.
  for (const o of outcomes)
    console.info(
      JSON.stringify({
        event: "enhanced_check_refreshed",
        brandId: input.brand.id,
        check: o.check,
        result: o.result,
        reason: o.reason,
      }),
    );
  return outcomes;
}
