# Claude Code — FIX (P1): tier read from organizations.tier instead of subscriptions.tier (2 pages) — invariant violation

## The bug
Two pages gate on the WRONG tier field:
- `app/(auth)/action-center/page.tsx:60` — reads `currentUser.organization.tier`
- `app/(auth)/agency/page.tsx:14` — reads `currentUser.organization.tier`

**Canon is explicit and repeated (verified):**
- LLD 3937: "**`subscriptions.tier` is the sole source of truth for tier** … never `organizations.tier` (can diverge
  between webhook firings)."
- LLD 5107-5110: "CRITICAL: Tier source of truth is subscriptions.tier (not organizations.tier). organizations.tier can
  diverge from subscriptions.tier between Stripe webhook firings."
- LLD 3660 / 4590: the established read path is `lib/quota/check.ts`, which reads `subscriptions.tier` (canonical).
- LLD 9381: "`subscriptions.tier`: canonical tier source."

**Why it matters (real divergence, not theoretical):** `organizations.tier` LAGS `subscriptions.tier` between Stripe
webhook firings, and may never have been backfilled. So a user who upgraded/downgraded gets WRONG tier-gating on the
Action Center and Agency pages — e.g. an upgraded Agency user still gated as Growth, or a lapsed user still seeing
Agency features — until (or unless) the org row catches up. These two pages are the last places still reading the
deprecated field.

Env: local PROD DB, real LLMs. Change is server-side tier resolution on 2 pages.

## STEP 1 — Read both call sites + the canonical tier accessor
```bash
sed -n '1,80p' "app/(auth)/action-center/page.tsx" | grep -n "tier\|currentUser\|organization\|subscription\|getTier\|checkQuota\|requireOrg\|getCurrentUser"
sed -n '1,40p' "app/(auth)/agency/page.tsx" | grep -n "tier\|currentUser\|organization\|subscription\|getTier\|checkQuota\|requireOrg\|getCurrentUser"
# How does the REST of the app resolve tier canonically? (match this pattern — don't invent a new one)
grep -rn "subscriptions.tier\|subscription.tier\|getTier\|resolveTier\|checkQuota\|from(subscriptions)\|\.tier" lib/quota/ lib/auth/ lib/ | grep -i "subscription\|tier" | head -20
sed -n '1,60p' lib/quota/check.ts 2>/dev/null
```
Report: how do these two pages currently obtain `currentUser.organization.tier` (what loads `currentUser`)? And what is
the canonical accessor the rest of the app uses to get `subscriptions.tier` (e.g. a `getTier(orgId)` / `checkQuota` /
a Drizzle query joining subscriptions)? Use THAT — don't hand-roll a new query if one exists.

## STEP 2 — Replace the org.tier read with the canonical subscriptions.tier read
On BOTH pages, resolve tier from `subscriptions.tier` for the current org, via the existing canonical path. Shape
(adapt to the repo's actual accessor):
```ts
// WRONG:
const tier = currentUser.organization.tier;
// RIGHT — read the sole source of truth (match lib/quota/check.ts pattern):
const tier = await getTier(currentUser.organizationId);        // if such a helper exists
// or, if the app queries directly:
const [sub] = await db.select({ tier: subscriptions.tier })
  .from(subscriptions)
  .where(eq(subscriptions.organizationId, currentUser.organizationId))
  .limit(1);
const tier = sub?.tier ?? 'free';                              // sane default if no subscription row
```
- Use the SAME helper/pattern the rest of the app uses (STEP 1) — consistency over a bespoke query.
- Handle the no-subscription-row case with the app's existing convention (likely defaults to 'free'/'starter') — don't
  crash if a subscription is absent.
- Do NOT read `organizations.tier` anywhere in these two pages after the fix.

## STEP 3 — Sweep for any OTHER organizations.tier reads (this is likely not the only pair)
```bash
grep -rn "organization\.tier\|organization_tier\|organizations\.tier\|\.organization\.tier" app/ lib/ components/ | grep -v "subscriptions\|node_modules"
```
Report EVERY remaining `organization.tier` / `organizations.tier` read outside the subscriptions context. Fix the ones
that gate features/quota; LIST any that are ambiguous for a decision. (Canon says organizations.tier is deprecated as a
tier source everywhere — the only legitimate writer is the Stripe webhook mirroring into it, if at all.)

## STEP 4 — VERIFY
```bash
grep -rn "organization\.tier\|organizations\.tier" "app/(auth)/action-center/page.tsx" "app/(auth)/agency/page.tsx"   # → 0 hits
grep -rn "subscriptions\.tier\|getTier\|checkQuota" "app/(auth)/action-center/page.tsx" "app/(auth)/agency/page.tsx"   # → the canonical read present
```
Functional check: confirm both pages tier-gate correctly for the current Agency-tier org (Test Org Agency 1) — they
should show Agency-level access, sourced from subscriptions.tier. If you can, verify the divergence case: a
subscriptions.tier that differs from organizations.tier now follows subscriptions.tier on these pages.
Report: both pages read subscriptions.tier; org.tier reads gone; gating still correct for the Agency org.

## Constraints
- `subscriptions.tier` is the SOLE source of truth (LLD 3937/5107/9381) — no `organizations.tier` for gating.
- Reuse the app's existing canonical accessor (lib/quota/check.ts pattern) — don't invent a parallel query.
- Default gracefully if no subscription row (match existing convention; don't crash).
- Server-side resolution (these are server components) — don't leak the query to the client.
- Additive/corrective only; no schema change (organizations.tier column stays; we just stop READING it for tier).

## NOTE
This is a real correctness bug against a hard, thrice-documented invariant, not a style nit: organizations.tier lags
subscriptions.tier between Stripe webhooks, so these two pages can gate the wrong tier for anyone who recently changed
plans. Fix both to read subscriptions.tier via the canonical path, sweep for any siblings (STEP 3 — there may be more),
and confirm org.tier reads are gone. The whole point of the invariant is that tier decisions never depend on a field
that can silently drift.
