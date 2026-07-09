# Claude Code — DIAGNOSE then FIX: Trust hub built but no tile on the brand page (nav-orphaned, like Sprint 4)

Sprint 5 built 8 trust screens + 13 components under `app/(auth)/brands/[brandId]/trust/`, but the brand detail page
shows 13 section tiles (Workflow, Visibility, Technical Audit, Robots.txt, llms.txt, Schema, SSR Check, Answer Capsules,
Brand Entity, Signals, Local SEO, Audit Schedule, Reports) with **NO Trust tile**. Users can't reach the trust hub from
the UI — same nav-orphan class as Sprint 4's report-templates/delivery-schedules. Confirm the cause, then wire the tile.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`, never prod. Brand
418f321f-2489-4560-aaa9-895728580465, org "Test Org Agency 1" (Agency tier).

## STEP 1 — DIAGNOSE which cause (direct-URL test)
```bash
# Does the trust route exist + load?  (canon: app/(auth)/brands/[brandId]/trust/page.tsx, prototype 2438)
ls "app/(auth)/brands/[brandId]/trust/"
sed -n '1,50p' "app/(auth)/brands/[brandId]/trust/page.tsx"
```
Then in the browser, navigate DIRECTLY to `/brands/418f321f-2489-4560-aaa9-895728580465/trust`. Report which:
- **LOADS fine** → the pages work; it's purely the missing hub tile (cause 1 — nav-wiring fix, STEP 3). Most likely.
- **404 / redirect** → route not registered (cause 2 — deeper; report the route structure).
- **Tier-lock shown** → the gate is suppressing it. Trust hub = Growth+ (spec §62); this is an Agency org, so a lock
  would be a GATE bug — check STEP 2.

## STEP 2 — Find the brand-hub tile grid + confirm the tier-gate source
```bash
# Where are the 13 tiles defined? (the grid that needs a 14th Trust tile)
grep -rln "Technical Audit\|Answer Capsules\|Local SEO\|Brand Entity\|Audit Schedule" "app/(auth)/brands/[brandId]/" components/
grep -rn "Technical Audit\|href.*technical\|/visibility\|/reports\|/entity\|tile\|SectionCard\|hub" "app/(auth)/brands/[brandId]/page.tsx" components/**/brand* | head -20
# Is there ALREADY a Trust tile that's tier-hidden? And does the gate read subscriptions.tier (not organizations.tier)?
grep -rn "trust\|Trust\|/trust" "app/(auth)/brands/[brandId]/page.tsx" components/**/brand* | head
grep -rn "tier\|TierGate\|Growth\|subscriptions.tier\|organization.tier" "app/(auth)/brands/[brandId]/page.tsx" | head
```
Report: the file + structure where the tiles are defined (array of tiles? individual cards?), and whether a Trust tile
exists-but-hidden vs is entirely absent. If a gate is involved, confirm it reads `subscriptions.tier` (the tier-source
invariant — Sprint 4 fixed 14 places; a new S5 tile reading organization.tier would be a regression).

## STEP 3 — FIX: add the Trust tile to the brand hub (matching the existing 13)
Add a Trust section tile to the hub grid, consistent with how the other tiles are defined (same component/shape, icon,
title, subtitle, href). Per canon §6U.2:
- Title: **Trust** (or "Trust Intelligence"); subtitle e.g. "Hallucination risk & authority" (match the style of the
  others — "Share of voice & trends", "8-dimension score", etc.)
- href: `/brands/${brandId}/trust`
- Icon: a shield/verified-style icon consistent with the tile set (Brand Entity uses a shield-like icon — pick a
  distinct trust/shield icon from the same lucide set the other tiles use).
- Tier gate: **Growth+** (spec §62) — if the hub tiles are individually gated, gate this one Growth+ reading
  `subscriptions.tier`; if the whole hub is already tier-appropriate, match the pattern. Agency org must SEE it.
- Place it logically in the grid (near Brand Entity / the authority-related tiles, or wherever the section order fits).
```bash
# after adding, confirm the tile references the trust route + the correct gate:
grep -rn "/trust\|Trust" "app/(auth)/brands/[brandId]/page.tsx" components/**/brand*
```

## STEP 4 — VERIFY on screen (not just grep)
1. Reload the brand detail page → the **Trust tile now appears** in the grid (14 tiles).
2. Click it → navigates to the trust hub, which renders (the Hallucination Risk card / trust score — §6U.2).
3. Confirm for the Agency org it's visible; (optional) confirm a Starter/Free org gates it if the hub is Growth+.
Report: the tile appears, clicking it reaches the working trust hub.

## STEP 5 — (while here) sweep for OTHER orphaned S5 pages
Sprint 5 has 8 trust screens — the hub tile gets you to the hub, but are the sub-screens (evidence archive, entity
score, consensus, LinkedIn, etc.) reachable FROM the hub, or also orphaned?
```bash
# Do the trust sub-pages have nav/links from the hub, or are they URL-only?
grep -rn "href\|Link\|push\|/trust/" "app/(auth)/brands/[brandId]/trust/page.tsx" components/domain/trust/ | grep -i "trust\|evidence\|entity\|consensus\|linkedin\|youtube\|citation" | head
```
Report: are the 8 trust sub-screens linked from the hub, or is only the hub reachable and the sub-screens orphaned?
(If orphaned, that's a finding — the hub needs section tiles/links to them, per §6U.2 "Section tiles". Report; fix in a
follow-up if extensive.)

## Constraints
- Match the EXISTING tile pattern (same component, icon set, grid) — don't invent a new tile style.
- Tier gate reads `subscriptions.tier`, never organizations.tier (the invariant — a new S5 tile must not regress it).
- Verify ON SCREEN (tile appears + click reaches the hub), not just that the code contains "/trust".
- Dev DB `visibleau`, never prod. (The /e?ip=0 404s in console are PostHog noise — ignore.)
- LLD v8.70 / §6U.2 win on any conflict.

## NOTE
This is the Sprint 4 nav-orphan class again: the trust hub + 8 screens are BUILT but the brand page has no Trust tile,
so users can't reach them. STEP 1's direct-URL test confirms it's just the missing tile (most likely) vs a route/gate
problem. The fix adds the Trust tile to the hub grid (Growth+, reading subscriptions.tier, href /brands/{id}/trust),
matching the other 13. STEP 5 checks whether the 8 sub-screens are also orphaned (reachable only by URL) — the same
pattern one level deeper. Verify the tile appears and clicking it reaches a working hub — on screen, not by grep.
