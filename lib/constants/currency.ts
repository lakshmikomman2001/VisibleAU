/**
 * "Before pushing e53edf2: five honesty fixes on the running-audit
 * page" (24 Oct), item 1 -- the ONE real USD -> AUD conversion, moved
 * here from lib/platform/budget-policy.service.ts (which still uses
 * it, now by importing it, not by keeping its own copy) so every
 * surface that shows a dollar figure derived from a real cost --
 * the running page, the failed page, and the 429 daily-spend-cap
 * message -- converts it exactly the way the cap guardrail itself
 * does. Replaces the old AUD_PER_USD (1.55, "approximate... not
 * billing"), which was a DIFFERENT, close-but-not-identical rate used
 * nowhere a real guardrail depends on.
 */
export const USD_TO_AUD_RATE = 100 / 0.65;

/** A real USD dollar amount -> whole AUD cents, rounded the same way
 * budget-policy.service.ts's own actualCostCents/estimatedCostCents
 * are. */
export function usdToAudCents(usdAmount: number): number {
  return Math.round(usdAmount * USD_TO_AUD_RATE);
}

/** Whole AUD cents -> a "0.00"-style dollars-and-cents string, for
 * display next to an "A$" prefix. Takes cents (not a raw USD amount)
 * so a figure already in AUD cents (checkDailySpend's own
 * spentTodayCents/capCents) is formatted directly, with no second,
 * potentially-divergent conversion. */
export function formatAudCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
