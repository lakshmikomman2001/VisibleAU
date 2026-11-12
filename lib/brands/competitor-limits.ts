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

/**
 * 13 Nov (part 2): adding a competitor by name, the same rule in the wizard and in Brand settings (the API
 * caps the list at MAX_COMPARISON_COMPETITORS too): trimmed, 100 characters at most, no more than the
 * cap, not one already listed (any case). The list is unchanged when there's an error.
 */
export function withCompetitorAdded(
  list: readonly string[],
  input: string,
): { list: string[]; error: string | null } {
  const name = input.trim();
  const unchanged = (error: string) => ({ list: [...list], error });
  if (!name) return unchanged("Enter a competitor's name.");
  if (name.length > 100) return unchanged("A competitor's name is 100 characters at most.");
  if (list.length >= MAX_COMPARISON_COMPETITORS) {
    return unchanged(
      `${MAX_COMPARISON_COMPETITORS} competitors at most. Remove one to add another.`,
    );
  }
  if (list.some((c) => c.toLowerCase() === name.toLowerCase())) {
    return unchanged(`${name} is already listed.`);
  }
  return { list: [...list, name], error: null };
}
