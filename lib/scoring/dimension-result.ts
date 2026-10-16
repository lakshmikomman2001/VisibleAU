import { DIMENSION_WEIGHTS } from "./constants";

/**
 * Task #46 Phase 1: the single source of truth for whether a dimension
 * (or the composite) is a real measurement or "insufficient data".
 *
 * Root cause this exists to fix: Position, Sentiment, Context and
 * Accuracy ("Source citation" -- see lib/scoring/accuracy.ts's own
 * comment) are each computed from the audit's brand-MENTION rows only.
 * With zero mention rows, each of those scorer functions already
 * returns a real, non-fabricated `0` (lib/scoring/position.ts,
 * sentiment.ts, context.ts, accuracy.ts all do `if (...length === 0)
 * return 0`) -- but a `0` stored for "nothing to measure" is
 * byte-identical to a `0` stored for "measured and it's bad", and every
 * downstream reader (the composite blend, the CI, the audit page, and
 * -- per the Phase 1 diagnosis -- roughly 25 other surfaces Phase 2
 * covers) can't tell the two apart. `DimensionResult` makes that
 * distinction explicit and typed, so a reader has to handle
 * "insufficient_data" instead of silently treating it as a real 0.
 *
 * Frequency is the one exception: 0 mentions out of N calls IS itself a
 * real, meaningful measurement (the brand's AI-visibility rate), not a
 * missing one -- so Frequency is always "scored", never
 * "insufficient_data". See resolveDimension's `alwaysScored` option.
 */
export type DimensionKey = "frequency" | "position" | "sentiment" | "context" | "accuracy";

export interface ScoredDimension {
  status: "scored";
  value: number;
  ci: { lower: number; upper: number };
}

export interface InsufficientDataDimension {
  status: "insufficient_data";
  reason: "no_mentions";
}

export type DimensionResult = ScoredDimension | InsufficientDataDimension;

/**
 * Resolves one dimension's raw (already-computed) value + CI into a
 * DimensionResult, gated on how many brand-mention rows fed it.
 * `mentionRowCount` should be the TRUE independent sample count (organic,
 * run_number = 1, brand_mentioned = true) -- the same basis the value
 * and ci were computed from -- not a replay-inflated count.
 */
export function resolveDimension(
  value: number,
  ci: { lower: number; upper: number },
  mentionRowCount: number,
  options: { alwaysScored?: boolean } = {},
): DimensionResult {
  if (!options.alwaysScored && mentionRowCount === 0) {
    return { status: "insufficient_data", reason: "no_mentions" };
  }
  return { status: "scored", value, ci };
}

export interface CompositeResult {
  value: number;
  ci: { lower: number; upper: number };
  /**
   * "frequency_only": the brand was never mentioned, so the only real
   * measurement is Frequency (0) -- the composite equals Frequency's
   * own score and CI, not a five-dimension blend of zeros.
   * "weighted": at least one mention exists; the composite blends every
   * SCORED dimension, with weights renormalised to sum to 1 when any
   * dimension is excluded.
   */
  basis: "frequency_only" | "weighted";
  weightsUsed: Partial<Record<DimensionKey, number>>;
}

/**
 * The composite's own read of the Phase 1 diagnosis's "decide and
 * document one rule" ask. Frequency is required (resolveDimension
 * guarantees it's always "scored") and anchors the frequency_only case;
 * every other scored dimension is blended in with its weight
 * renormalised against whatever subset is actually scored. The
 * composite is never itself "insufficient_data" -- Frequency alone is
 * always a real measurement to fall back to.
 *
 * The composite isn't a true proportion (it's a weighted blend of five
 * differently-shaped dimension scores), so its CI isn't computed with a
 * proportion-CI formula either way: it's the same weights applied to
 * each scored dimension's own CI bounds -- an honest, simple,
 * deterministic range, not a rigorous statistical CI. (The other two
 * options the Phase 1 task considered -- a response-level bootstrap, or
 * showing no CI at all for a blended score -- are documented as
 * rejected-for-now in docs/ops; this is the simplest of the three
 * sanctioned choices, chosen for determinism and testability.)
 */
export function resolveComposite(
  dims: Record<DimensionKey, DimensionResult>,
  weights: Record<DimensionKey, number> = DIMENSION_WEIGHTS,
): CompositeResult {
  const keys = Object.keys(dims) as DimensionKey[];
  const scoredKeys = keys.filter((k) => dims[k].status === "scored");

  if (scoredKeys.length === 1 && scoredKeys[0] === "frequency") {
    const freq = dims.frequency as ScoredDimension;
    return {
      value: freq.value,
      ci: freq.ci,
      basis: "frequency_only",
      weightsUsed: { frequency: 1 },
    };
  }

  const totalWeight = scoredKeys.reduce((sum, k) => sum + weights[k], 0);
  const weightsUsed: Partial<Record<DimensionKey, number>> = {};
  let value = 0;
  let lower = 0;
  let upper = 0;
  for (const k of scoredKeys) {
    const d = dims[k] as ScoredDimension;
    const w = totalWeight > 0 ? weights[k] / totalWeight : 0;
    weightsUsed[k] = w;
    value += d.value * w;
    lower += d.ci.lower * w;
    upper += d.ci.upper * w;
  }
  return { value, ci: { lower, upper }, basis: "weighted", weightsUsed };
}
