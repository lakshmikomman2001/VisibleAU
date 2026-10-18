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
 */
export const METHODOLOGY_VERSION = 2;

export const METHODOLOGY_LABELS: Record<number, string> = {
  1: "memory-only (v1)",
  2: "web-grounded (v2)",
};

export function methodologyLabel(version: number | null | undefined): string {
  return METHODOLOGY_LABELS[version ?? 1] ?? METHODOLOGY_LABELS[1];
}
