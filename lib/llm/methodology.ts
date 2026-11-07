/**
 * Vunnara Build 1, Part G.7: the single source of truth for which
 * answer-gathering methodology a NEW audit runs under -- written
 * explicitly at audit-creation time (lib/audit/numbering.ts's audit-
 * insert call sites), never relied on as a bare DB column default
 * beyond "1 for every audit that predates this feature."
 *
 * 1 = memory-only: every engine answered from training data alone,
 *     with no real-time web search (every audit before this build).
 * 2 = web-grounded: chatgpt/claude/gemini can search the web per-call
 *     (lib/llm/*-impl.ts, gated per engine by ENGINE_WEB_SEARCH_
 *     <ENGINE>); perplexity was already always grounded.
 * 3 = web-grounded, improved detection ("Mention detection", 6 Nov) --
 *     shown as v2.1: the same web-grounded answers, read by the improved
 *     detection: text before and after a search kept apart, a paused or
 *     filtered answer never scored, a Claude answer kept after its 6th
 *     search, names matched through markdown and invisible characters,
 *     and verification by the pages an answer cited. Mentions can be
 *     found that version 2 missed, so a version-3 audit is never compared
 *     with an earlier one: trends show the change (methodologyChangeNote)
 *     and drift skips it.
 * 4 = web-grounded (v2.2), Sri's decision (7 Nov) -- one change covering
 *     three: Gemini's answers come from gemini-3.5-flash-lite, Google's
 *     replacement for gemini-2.5-flash, which it shuts down on 1 Dec 2026
 *     (lib/llm/model-selector.ts); every answer may run to 8,192 output
 *     tokens (lib/llm/output-limit.ts); and an audit is compared only with
 *     audits that asked the same engines for the same models
 *     (lib/llm/model-set.ts). One "Detection updated on <date>" note marks
 *     it, never three.
 */
export const METHODOLOGY_VERSION = 4;

export const METHODOLOGY_LABELS: Record<number, string> = {
  1: "memory-only (v1)",
  2: "web-grounded (v2)",
  3: "web-grounded (v2.1)",
  4: "web-grounded (v2.2)",
};

export function methodologyLabel(version: number | null | undefined): string {
  return METHODOLOGY_LABELS[version ?? 1] ?? METHODOLOGY_LABELS[1];
}

/** What changed in each methodology version, for the label where a trend crosses into it. */
const METHODOLOGY_CHANGE_NOTES: Record<number, string> = {
  2: "Web search added",
  3: "Detection improved",
  4: "Detection updated",
};

/**
 * The label where a trend meets a newer methodology than the audit before it, e.g. "Detection improved on
 * 7 Nov 2026" -- the date of the first audit under it. Null when the version didn't change, or either side
 * is unknown (a legacy audit with no version is never claimed as different).
 */
export function methodologyChangeNote(
  previousVersion: number | null | undefined,
  version: number | null | undefined,
  firstAuditAt: Date,
): string | null {
  if (previousVersion == null || version == null || previousVersion === version) return null;
  const note = METHODOLOGY_CHANGE_NOTES[version] ?? "Methodology changed";
  const date = firstAuditAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
  return `${note} on ${date}`;
}
