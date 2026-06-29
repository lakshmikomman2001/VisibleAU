# Claude Code — DIAGNOSTIC (no changes): does `getBestProvider` sort by latency?

Closing Finding 2 from Section 2 (provider latency NULL → "would compare Infinity"). Canon resolves the seed
side: `average_latency_ms` is intentionally NOT in the §5.5 seed matrix (nullable, left NULL by design), and
the `getBestProvider` spec (§6.4 / LLD 5052) selects by `is_enabled=true` + tier — it does NOT mention latency.
So the only open question is whether the *implementation* added latency sorting beyond spec. Find out — change
nothing.

> Read-only. Do NOT edit code. Just report what `getBestProvider` actually does.

## THE CHECK
```bash
# 1. Locate getBestProvider and show its body:
grep -rn "getBestProvider" lib/platform/ app/ --include=*.ts
#    then open the file and read the method.

# 2. Does it sort/order by latency anywhere?
grep -rniE "average_latency|latency|sort|orderBy|\.sort\(|order by" lib/platform/provider-capability.registry.ts 2>/dev/null
#    (adjust path to the actual file from step 1)

# 3. What ARE its selection criteria? (should be is_enabled + tier per canon):
grep -niE "is_enabled|isEnabled|tier|TIER_ENGINES|filter|where" lib/platform/provider-capability.registry.ts 2>/dev/null
```

## INTERPRET + REPORT (no fix in this task)
- **If getBestProvider does NOT reference latency** (selects by `is_enabled` + tier only) → **Finding 2 is
  fully closed, nothing to fix.** The test's "would compare Infinity" was hypothetical — the code never sorts
  by latency, so NULL latency is harmless. The seed (latency NULL) and the service both match canon. Confirm
  this and we're done.

- **If getBestProvider DOES sort by latency** (an ORDER BY / `.sort()` on `average_latency_ms`) → that's an
  **implementation beyond canon spec** (§6.4 lists only is_enabled + tier). Report it as a finding for Sri:
  with all 4 providers' latency NULL, the sort orders by NULL/Infinity → provider selection is effectively
  arbitrary rather than deterministic. **Do NOT fix it in this task** — Sri decides between: (a) remove the
  latency sort to match canon (selection by is_enabled + tier), or (b) add a defined tie-break/fallback for the
  all-NULL case (e.g. stable order by provider_key) if latency-optimisation is intended later. Either way, do
  NOT seed fake latency values — canon intentionally leaves them NULL.

## OUTPUT
- Paste the `getBestProvider` method body (or the relevant lines).
- State plainly: does it sort by latency — YES or NO.
- If NO → "Finding 2 closed, no action."
- If YES → describe the sort + the all-NULL consequence, flag for Sri's decision (don't apply a fix).
