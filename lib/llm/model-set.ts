import { ENGINE_DISPLAY_NAMES } from "./interface";

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 3 -- an audit is compared only with audits that asked the same
 * engines for the same models, as well as running under the same methodology. Each audit's models come from its
 * stored answers (citations.llm_model, the model the app asked for; lib/audit/model-drift.ts's auditModels), with
 * no column of their own. This covers our own switch (Gemini 2.5 Flash -> 3.5 Flash-Lite), a plan change
 * (Starter's Claude Haiku -> Growth's Sonnet, Free's two engines -> four) and Agency's models.
 *
 * Pure, so the brand page's sparkline (a client component) labels a change the same way the PDF does.
 */

/** engine -> the models the app asked it for in the audit's answers, sorted. An engine with no answer is absent. */
export type AuditModelSet = Record<string, string[]>;

/** One audit's models, from its answer rows. A row with no model recorded adds its engine with none. */
export function modelSetOf(
  rows: ReadonlyArray<{ engine: string; llmModel: string | null }>,
): AuditModelSet {
  const byEngine = new Map<string, Set<string>>();
  for (const row of rows) {
    const models = byEngine.get(row.engine) ?? new Set<string>();
    if (row.llmModel) models.add(row.llmModel);
    byEngine.set(row.engine, models);
  }
  return Object.fromEntries(
    [...byEngine.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([engine, models]) => [engine, [...models].sort()]),
  );
}

/** One string per model set, equal exactly when the sets are: "chatgpt=gpt-4.1-mini;claude=claude-haiku-4-5". */
export function modelSetKey(set: AuditModelSet): string {
  return Object.keys(set)
    .sort()
    .map((engine) => `${engine}=${set[engine].join(",")}`)
    .join(";");
}

/** Whether two audits asked the same engines for the same models. Unknown on either side is never the same. */
export function sameModelSet(a: AuditModelSet | undefined, b: AuditModelSet | undefined): boolean {
  return a !== undefined && b !== undefined && modelSetKey(a) === modelSetKey(b);
}

const MODEL_NAMES: Record<string, string> = {
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-4o": "GPT-4o",
  "claude-haiku-4-5": "Haiku 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "gemini-2.5-flash": "2.5 Flash",
  "gemini-2.5-pro": "2.5 Pro",
  "gemini-3.5-flash-lite": "3.5 Flash-Lite",
  sonar: "Sonar",
  "sonar-pro": "Sonar Pro",
};

/** A model's short name after its engine's ("Claude Haiku 4.5", "Gemini 3.5 Flash-Lite"); the id itself when unknown. */
export function modelName(model: string): string {
  return MODEL_NAMES[model] ?? model;
}

function engineName(engine: string): string {
  return (ENGINE_DISPLAY_NAMES as Record<string, string>)[engine] ?? engine;
}

function names(models: readonly string[]): string {
  return models.map(modelName).join(" and ");
}

/** An audit's models and the engines it planned (audits.engines) -- a failed engine says nothing about its model. */
export interface AuditModels {
  models: AuditModelSet;
  engines: readonly string[];
}

/** Each engine's change from `from` to `to`, in engine order: [engine, from's models, to's models, planned on each]. */
function engineChanges(from: AuditModels, to: AuditModels) {
  const engines = [...new Set([...from.engines, ...to.engines])].sort();
  return engines.flatMap((engine) => {
    const before = from.models[engine] ?? [];
    const after = to.models[engine] ?? [];
    const plannedBefore = from.engines.includes(engine);
    const plannedAfter = to.engines.includes(engine);
    const modelsDiffer =
      plannedBefore &&
      plannedAfter &&
      before.length > 0 &&
      after.length > 0 &&
      before.join(",") !== after.join(",");
    return modelsDiffer || plannedBefore !== plannedAfter
      ? [{ engine, before, after, plannedBefore, plannedAfter }]
      : [];
  });
}

/**
 * Where the models change from one audit to the next, e.g. "Models changed: Claude Haiku 4.5 → Sonnet 4.6"; an
 * engine only one of them planned is "added" or "removed". Null when nothing changed that either audit's answers
 * show (an engine with no answers on one side is left out: a failed engine isn't a model change).
 */
export function modelSetChangeNote(previous: AuditModels, next: AuditModels): string | null {
  const parts = engineChanges(previous, next).map((c) => {
    const name = engineName(c.engine);
    if (!c.plannedAfter) return `${name} removed`;
    if (!c.plannedBefore) return `${name} added${c.after.length > 0 ? ` (${names(c.after)})` : ""}`;
    return `${name} ${names(c.before)} → ${names(c.after)}`;
  });
  return parts.length > 0 ? `Models changed: ${parts.join("; ")}` : null;
}

/**
 * How one audit's models differ from the audit a report compares against, e.g. "Claude Haiku 4.5, not Sonnet
 * 4.6", "no Gemini", "also Claude". Null when they don't.
 */
export function modelSetDifference(audit: AuditModels, basis: AuditModels): string | null {
  const parts = engineChanges(basis, audit).map((c) => {
    const name = engineName(c.engine);
    if (!c.plannedAfter) return `no ${name}`;
    if (!c.plannedBefore) return `also ${name}`;
    return `${name} ${names(c.after)}, not ${names(c.before)}`;
  });
  return parts.length > 0 ? parts.join("; ") : null;
}
