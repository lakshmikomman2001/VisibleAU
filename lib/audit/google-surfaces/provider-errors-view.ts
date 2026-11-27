/**
 * 19 Nov (Sri's review of /admin/settings): Provider errors showed 12 Nov's "40100 login rejected" (the bad Vercel
 * credentials, fixed that day; every Google run since succeeded) as if it were current. Now the page says, from the
 * data, "No provider errors since 12 Nov 19:31 Sydney time (last Google run: ...)" when no error is newer than the
 * last run that went cleanly, and errors from before that run are folded away under a closed expand.
 *
 * Pure and client-safe: lib/audit/google-surfaces/operator.ts loads the facts; the page splits them.
 */

/** "12 Nov 19:31" in Sydney time (the operators are in Sydney; the page shows UTC on hover). */
export function sydneyShort(iso: string | Date): string {
  return new Date(iso)
    .toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

/**
 * The latest Google run that went cleanly: it finished, at least one question was checked, and none failed or was
 * stopped (lib/audit/google-surfaces/operator.ts loadLastCleanGoogleRun).
 */
export interface CleanGoogleRun {
  /** When the run was queued (audit_google_surfaces.created_at): an error before it is older than the run. */
  startedAt: string;
  /** When it finished. */
  at: string;
  auditNumber: number | null;
  brand: string | null;
  questions: number;
  checked: number;
}

export interface ProviderErrorsSplit<G extends { at: string }> {
  /** "No provider errors since 12 Nov 19:31 Sydney time (last Google run: ...)", or null when there's a newer error. */
  summary: string | null;
  /** Errors from the last clean run's start on (or every error, with no clean run): shown. */
  recent: G[];
  /** Errors from before the last clean run: folded away. */
  older: G[];
}

/** "26 of 26 questions checked at 19 Nov 20:10 Sydney time, audit #61, Yabby Services". */
export function cleanRunText(run: CleanGoogleRun): string {
  return [
    `${run.checked} of ${run.questions} questions checked at ${sydneyShort(run.at)} Sydney time`,
    run.auditNumber !== null ? `audit #${run.auditNumber}` : null,
    run.brand,
  ]
    .filter(Boolean)
    .join(", ");
}

/** `groups` newest first (loadGoogleProviderErrorGroups), each `at` its latest failure. */
export function splitProviderErrors<G extends { at: string }>(
  groups: readonly G[],
  lastCleanRun: CleanGoogleRun | null,
): ProviderErrorsSplit<G> {
  if (!lastCleanRun) return { summary: null, recent: [...groups], older: [] };
  const cut = new Date(lastCleanRun.startedAt).getTime();
  const recent = groups.filter((g) => new Date(g.at).getTime() >= cut);
  const older = groups.filter((g) => new Date(g.at).getTime() < cut);
  const latest = older[0];
  const summary =
    recent.length === 0 && latest
      ? `No provider errors since ${sydneyShort(latest.at)} Sydney time (last Google run: ${cleanRunText(lastCleanRun)})`
      : null;
  return { summary, recent, older };
}
