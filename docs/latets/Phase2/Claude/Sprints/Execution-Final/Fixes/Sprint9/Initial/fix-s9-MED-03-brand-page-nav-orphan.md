# FIX S9-MED-03 (F10) — NAV-ORPHAN: Health Check + Autopilot absent from the brand-page tile grid

## Severity: MEDIUM — the two headline S9 screens are unreachable from the brand page (URL-only for every brand except the one on the dashboard banner)

## The finding (confirmed on screen)
The brand page (`/brands/{brandId}`) renders a tile grid linking **every** brand-scoped layer:
Workflow · Visibility · Technical Audit · Robots.txt · llms.txt · Schema · SSR Check · Answer
Capsules · Brand Entity · Trust · Signals · Audit Schedule · Reports · Retrieval · Discovery.

**Health Check and Autopilot — the two headline S9 screens — are NOT in the grid.**

Both exist as routes:
- `/brands/{brandId}/health-check` (Growth+)
- `/brands/{brandId}/autopilot` (Growth+)

…but from a brand page there is **no way to reach either**. The only entry points today are:
- the **dashboard banner** ("X's AI Visibility Health Check is ready") — a PROMOTIONAL surface that
  features exactly ONE brand (the org's first brand). For every OTHER brand, the Health Check is
  effectively URL-only.
- the dashboard Autopilot card's "View full loop →" — same problem (dashboard-scoped, not per-brand).

**This is the NAV-ORPHAN class — 5th consecutive sprint (S5 → S6 → S7 → S8 → S9).** The S8 nav guard
(`scripts/qa/sprint8-invariants.sh`, the settings set-difference check) does NOT cover this surface —
it guards the **settings sidebar**, not the **brand-page tile grid**. So the guard passed while the
bug shipped again, on a different nav surface.

## Task

### Step 1 — Add both tiles to the brand-page grid
Find the tile grid and its config:
```bash
cd c:/startup/VisibleAU/src
grep -rn "Workflow\|Technical Audit\|Answer Capsules\|Brand Entity\|Audit Schedule\|Retrieval\|Discovery" \
  "app/(auth)/brands/[brandId]/page.tsx" components/domain/brands/*.tsx 2>/dev/null | head
# Locate the array/config that drives the tiles (name + description + href + icon + tier?):
grep -rn "href.*brands.*technical\|href.*brands.*discovery\|tiles\|BRAND_TILES\|sections" \
  "app/(auth)/brands/[brandId]/page.tsx" components/domain/brands/*.tsx 2>/dev/null | head
```
Add two entries, matching the existing tile shape (icon + title + one-line description + href):
- **Autopilot** → `/brands/{brandId}/autopilot` — e.g. "The visible loop: gap → draft → measure"
- **Health Check** → `/brands/{brandId}/health-check` — e.g. "Cross-layer traffic-light + #1 action"

**Placement matters (product judgment):** these are the S9 capstone screens — the "aha" surfaces. They
should be PROMINENT, not appended last after Discovery. Put them FIRST in the grid (or in their own
lead row), since Health Check is the post-audit landing experience and Autopilot is the flagship loop.
Use the S9/autopilot accent (the gradient/target icon already used on the dashboard) so they read as
the headline actions.

### Step 2 — Respect the tier gate
Both are **Growth+**. Match how the existing grid handles tier-gated tiles (if any do):
- If other tiles show a locked/upgrade state for lower tiers → do the same (reuse the canonical
  `TierGate`/lock pattern).
- If the grid simply hides tiles the tier can't use → follow that convention.
Do NOT show a working link that 403s on click. Whatever the existing convention is, match it.

### Step 3 — Keep the dashboard entry points
Do NOT remove the dashboard banner or "View full loop →" — they're the promotional/first-run surfaces
and they're fine. This fix ADDS the per-brand navigation that's missing.

## Step 4 — Close the guard gap (so this is the LAST time)
The nav-orphan class has now shipped 5 sprints running because each guard only covered the surface of
its own sprint. The S8 guard checks the **settings sidebar**; nothing checks the **brand-page grid**.
Add a set-difference guard for THIS surface (mirroring the S8 nav guard's approach):
- Enumerate the brand-scoped route dirs under `app/(auth)/brands/[brandId]/*/page.tsx`.
- Enumerate the hrefs in the brand-page tile grid.
- **Assert every brand-scoped route has a tile** (set-difference = empty), with an explicit waiver
  list for any route deliberately not tiled (document WHY in the waiver, e.g. a sub-route that's
  reached from within another screen).
- The guard must FAIL if a new `/brands/[brandId]/<something>/page.tsx` is added without a tile — that
  is the whole point: it catches the NEXT orphan without editing the test.
Put it alongside the existing QA invariants (`scripts/qa/`) and/or the walk-regression test file.

## Verify
- **On screen:** open `/brands/{metropolitanId}` → **Autopilot** and **Health Check** tiles are
  present and prominent; clicking each navigates to the right route.
- Do the same on a SECOND brand (not the dashboard-banner brand) — the point is that EVERY brand can
  reach these screens, not just the featured one.
- Lower tier (Free/Starter) → the tiles follow the grid's existing tier convention (locked or hidden),
  never a link that 403s.
- The new guard: add a throwaway `app/(auth)/brands/[brandId]/_orphan_test/page.tsx` → the guard FAILS
  → remove it → passes.

## Constraints
- Match the existing tile shape/styling (icon + title + description + href); token-driven.
- Tier gate per the grid's existing convention; `subscriptions.tier` as the source.
- Don't remove the dashboard entry points.
- The new guard must be a **set-difference** (catches the next orphan automatically), not a hardcoded
  list of the current tiles.

## Report back (paste inline)
1. Where the tile grid config lives + the two entries added (placement + tier handling).
2. **Screenshot `/brands/{metropolitanId}`** showing the Autopilot + Health Check tiles.
3. Confirmation a SECOND brand also shows them (not just the banner brand).
4. The new brand-grid nav guard + its re-break (throwaway route → guard RED → removed → green).
