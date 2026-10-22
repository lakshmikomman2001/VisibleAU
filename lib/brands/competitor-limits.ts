/**
 * "Cap competitor comparisons" (23 Oct), item 2 -- run-comparison-
 * prompts.ts makes one real, paid LLM call per (competitor x enabled
 * engine), with no cap anywhere on how many competitors a brand can
 * have (db/schema/brands.ts's `competitors` is a plain text[] with no
 * length constraint, and no form or API validator capped it either).
 * 5: enough to cover a brand's realistic top competitors (this
 * product's own vertical packs -- db/seed/verticals/*.ts -- never
 * reference more than a small handful by name) while keeping one
 * audit's worst-case comparison cost bounded and predictable rather
 * than scaling with however many an owner happens to type in.
 *
 * Plain constant, no server-only imports -- used from a "use client"
 * form (wizard-form.tsx) as well as server routes and the Inngest
 * function, so it must stay safe to bundle into client code.
 */
export const MAX_COMPARISON_COMPETITORS = 5;

export const MAX_COMPARISON_COMPETITORS_MESSAGE = `Comparing your first ${MAX_COMPARISON_COMPETITORS} competitors`;

/**
 * The first MAX_COMPARISON_COMPETITORS entries, oldest-added first.
 * `competitors` is only ever appended to (the wizard's addCompetitor()
 * never reorders or inserts), so array index already IS addition
 * order -- a plain slice is deterministic, not an arbitrary subset.
 */
export function selectComparisonCompetitors(competitors: readonly string[]): string[] {
  return competitors.slice(0, MAX_COMPARISON_COMPETITORS);
}
