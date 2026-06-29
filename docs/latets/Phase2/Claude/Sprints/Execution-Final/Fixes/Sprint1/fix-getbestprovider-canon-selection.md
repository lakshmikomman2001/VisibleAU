# Claude Code — FIX: `getBestProvider` — remove latency sort, match canon §6.4

`getBestProvider` (provider-capability.registry.ts, ~lines 76-80) sorts by `averageLatencyMs` via `.reduce()`
with an `Infinity` fallback. This is **beyond canon spec** — §6.4 (LLD 5052) specifies selection by
`is_enabled=true` + tier ONLY, no latency. With all providers' latency NULL (correct per the §5.5 seed, which
intentionally omits latency), the reduce returns the first DB row → **non-deterministic selection**. Replace the
latency sort with canon-compliant, deterministic selection.

> Targeted fix to ONE method. Don't touch the seed (latency stays NULL — canon-intended). Don't change other
> registry methods. Don't add latency back anywhere.

## CANON (the spec to match — §6.4 / LLD 5052)
`getBestProvider(market, useCase, tier): Promise<Provider>` — reads `provider_market_capabilities` filtered by
`is_enabled=true`; **respects the tier** (a Free-tier request may only return providers within
`TIER_ENGINES[tier]`). **No latency criterion.** Selection = enabled + tier-eligible.

## THE FIX
Replace the latency `.reduce()` selection with:
1. Filter to eligible providers: `is_enabled=true` AND within `TIER_ENGINES[tier]` (the existing eligibility
   logic — keep it).
2. From the eligible set, return a **deterministic** choice: order by `provider_key` ascending (alphabetical)
   and return the first. This makes "best" stable and predictable regardless of DB row order — replacing the
   arbitrary "first row" behaviour.
3. Remove the `averageLatencyMs` / `Infinity` reduce entirely. Do not reference latency in this method.
4. Preserve the existing return type (`Provider`) and the empty-case behaviour (if no eligible provider, keep
   whatever the current contract is — e.g. throw or return per existing tests; don't change that semantics).

Example shape (adapt to the actual code):
```ts
// was: eligible.reduce((best, p) => (p.averageLatencyMs ?? Infinity) < (best.averageLatencyMs ?? Infinity) ? p : best)
// now: deterministic by provider_key
const eligible = providers.filter(p => p.isEnabled && TIER_ENGINES[tier].includes(p.providerKey)); // keep existing eligibility
if (eligible.length === 0) { /* existing empty-case behaviour — unchanged */ }
return eligible.sort((a, b) => a.providerKey.localeCompare(b.providerKey))[0];
```

## DO NOT
- Do NOT seed or backfill `average_latency_ms` — canon intentionally leaves it NULL (not in §5.5 matrix).
- Do NOT keep latency anywhere in `getBestProvider`.
- Do NOT alter other registry methods or the eligibility/tier logic itself (only the SELECTION step changes).

## VERIFY
- Run the provider registry tests (`provider-capability.registry.test.ts` + the Section 1/2 additions). The
  Section 2 test that assumed/observed latency sorting should now reflect deterministic `provider_key`
  ordering — **if a test asserted lowest-latency selection, update that TEST** to assert the canon behaviour
  (enabled + tier, deterministic by provider_key), since the old assertion encoded the non-spec behaviour.
- Add/confirm a test: with all latencies NULL (the real seed state), `getBestProvider` returns the SAME
  provider every call (deterministic), and it's the alphabetically-first eligible provider — not DB-order-dependent.
- Confirm tier still respected: a Free-tier request only returns a `TIER_ENGINES['free']` provider.
- Full suite stays green.

## REPORT
- The method change (latency reduce → deterministic provider_key selection).
- Which test(s) were updated to match canon (if any asserted latency sorting).
- Confirmation: deterministic selection verified with all-NULL latencies; tier still respected; seed untouched
  (latency still NULL); no other methods changed; suite green.
