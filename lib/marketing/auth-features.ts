/**
 * The four lines beside the sign-in and sign-up forms, in one place so the two pages can't drift.
 *
 * 20 Nov (Sri's decision, part 3): the first line was "AU-first vertical content & compliance" -- a compliance claim no
 * one has checked, and not what the product does. It says what an audit measures now: how often AI answers name the
 * business, on the engines its plan includes (lib/llm/tier-engines.ts). No line may claim compliance or a
 * certification (tests/unit/pricing/pricing-claims.test.tsx guards every page but /privacy and /terms).
 */
export const AUTH_PAGE_FEATURES = [
  "How often AI answers name your business, across the engines on your plan",
  "Suburb-level tracking, not just metro",
  "Flat agency tiers — no per-brand surprises",
  "Research-backed Action Center",
] as const;
