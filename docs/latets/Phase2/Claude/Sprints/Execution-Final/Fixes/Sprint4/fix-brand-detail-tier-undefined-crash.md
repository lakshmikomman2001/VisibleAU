# Claude Code — FIX (HIGH regression): brand-detail page crashes — `tier is not defined`

**Regression introduced by the Reports-card fix.** The brand-detail page now crashes for EVERY brand:
```
Runtime ReferenceError: tier is not defined
app/(auth)/brands/[brandId]/page.tsx (120:15) @ BrandDetailPage
> 120 |    tier={tier}
```
The Reports-card change added `tier={tier}` (line 120) — passing tier to `BrandDetailClient` for the new Reports
card's Growth+ gate — **but the `tier` variable was never defined/computed in the server component.** So the page
references an undefined variable → ReferenceError → the whole brand-detail page shows "Something went wrong."

This got past "78 tests green, 0 TS errors" because the tests don't render this server page with real data, and the
crash is a runtime ReferenceError on the server page (not a type error). It only appears when the page actually
loads — which is why the manual pass caught it.

Severity: HIGH — brand-detail (a core page) is completely broken for all brands.

## The fix — define `tier` in the server component before passing it
Line 119 already passes `isFree={isFree}`, so `isFree` IS computed in this server component. `tier` must be computed
the SAME way (from the subscription) and passed at line 120.

> Investigate-first: read the server page + see how `isFree` (and any existing tier/subscription lookup) is derived.
```bash
sed -n '1,130p' "app/(auth)/brands/[brandId]/page.tsx"
grep -n "isFree\|tier\|subscription\|getSubscription\|subscriptions\." "app/(auth)/brands/[brandId]/page.tsx"
# How is tier derived elsewhere (the canonical source — subscriptions.tier, NOT organizations.tier)?
grep -rn "subscriptions.tier\|getTier\|resolveTier\|\.tier" lib/ app/ | grep -iE "subscription\|tier" | head
```

Then, in `page.tsx`, **derive `tier`** from the org's subscription (the same subscription lookup that produces
`isFree`) and use it for the `tier={tier}` prop:
- **`tier` must come from `subscriptions.tier`** (the sole tier source of truth — NOT `organizations.tier`, per LLD
  3962/5132). If `isFree` is derived from a subscription object already fetched here, read `tier` off that same
  object (e.g. `const tier = subscription?.tier ?? 'free'`) rather than fetching again.
- Match whatever tier VALUES the client expects. The Reports card gates on `GROWTH_PLUS_TIERS` (free/starter locked;
  growth/agency/agency_pro/enterprise active) — so `tier` must be one of those string values. Confirm the casing/
  format the client's `GROWTH_PLUS_TIERS` array uses and produce a matching value.
- If there's genuinely no subscription (edge case), default to the safe lowest tier (`'free'` / `'starter'` per the
  app's convention) so the Reports card shows locked, not a crash.

## INVARIANTS
- `tier` from **`subscriptions.tier`** (never organizations.tier). Reuse the existing subscription fetch that
  produces `isFree` — don't add a redundant query.
- The value must match the client's `GROWTH_PLUS_TIERS` expectations (correct string/casing) so gating works.
- No crash when subscription is absent — safe default to a locked tier.
- Don't change the Reports card or the other 12 cards; this is purely defining the missing server-side variable.
- TS strict, no `any`.

## VERIFY (on screen — the fix is only real if the page loads)
1. Reload `/brands/026acf75-188f-4a9f-9126-6ed2fb324f91` — the page **loads** (no "Something went wrong", no
   `tier is not defined`). The 12 intelligence cards + the new Reports card all render.
2. This brand is **Agency tier** → the Reports card is **active** (not locked) and clicks through to
   `/brands/[brandId]/reports`.
3. Load a **Starter/Free**-tier brand (if available) → the page loads AND the Reports card shows the **locked**
   teaser (Growth+ gate working via the real tier value).
4. Console: **no ReferenceError**, no error boundary (only the usual PostHog 404 / Fast Refresh noise is fine).
5. 78 Sprint 4 tests still green; 0 TS errors.

## REPORT
- Where/how `tier` is now derived (the subscription source; confirm subscriptions.tier not organizations.tier) + the
  default for the no-subscription case.
- Screenshot/confirm the brand-detail page LOADS (Agency brand) with the Reports card active; a Starter brand loads
  with it locked.
- Confirm: no ReferenceError; reused the isFree subscription fetch (no redundant query); tier value matches
  GROWTH_PLUS_TIERS; 78 tests green.

## NOTE — process
The Reports-card fix was reported "verified, card appears correctly" but it was verified by READING the code (lines
405-544 of the client), not by LOADING the page — so the server-page ReferenceError at line 120 wasn't caught.
Runtime-render verification (actually loading the page) is required for a UI fix, not just reading the diff — the
same lesson that's recurred: code-reads-correct ≠ page-loads. After this fix, LOAD the page to confirm, don't just
re-read it.
