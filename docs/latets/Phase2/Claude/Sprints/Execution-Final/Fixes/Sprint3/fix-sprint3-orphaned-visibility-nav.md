# Claude Code — FIX (orphaned nav, 5th occurrence): add the Visibility entry-point card to the brand-detail tools grid

**Finding:** the Sprint 3 **Visibility hub** (`/brands/[brandId]/visibility`) is built and works (loads via direct
URL, renders, routes return 200), but there is **NO entry-point card on the brand-detail page** to reach it. The
tools grid shows Workflow, Technical Audit, Robots.txt, llms.txt, Schema, SSR Check, Answer Capsules, Brand Entity,
Signals, Local SEO, Audit Schedule — **no Visibility card.** The hub is orphaned: reachable only by typing the URL.

This is the **5th occurrence of the same orphaned-navigation pattern** in this project (Sprint 7 technical tab,
Sprint 9 agency surfaces, Sprint 2 Workflow card, Smart Prompt Pack trigger) — a surface gets built but the nav to
reach it is lost in prototype→sprint translation. The Sprint 3 prompt specified the hub SCREEN (§6U.2) but did not
ensure a card was added to the brand-detail tools grid. Fix = add the card, matching the pattern the **Sprint 2
Workflow card** already established (a card in the tools grid, tier-gated).

> **Because this pattern recurs, this fix does TWO things:** (1) add the Visibility card, and (2) AUDIT all Sprint 3
> surfaces for reachability — so the next orphaned one isn't found three screenshots later.

> Investigate-first: read the brand-detail tools grid to see how the existing cards (esp. the Workflow card added in
> Sprint 2) are structured — the component, the card shape, how tier-gating + the href + the icon + the
> title/subtitle work — and MATCH that pattern exactly. Do NOT invent a new card style.
```bash
# The brand-detail tools grid + how the Workflow card was added (the pattern to mirror):
grep -rln "Workflow\|Tasks & remediation\|tools grid\|brand-detail" app/ components/ --include=*.tsx | head
cat components/domain/brand/brand-detail-client.tsx 2>/dev/null | grep -nE "Workflow|Technical Audit|card|href|tier|Lock|LayerBadge" | head -30
```

---

## PART 1 — Add the Visibility card to the brand-detail tools grid

Add a **Visibility** card matching the existing card pattern (mirror the Sprint 2 Workflow card):
- **Title/subtitle:** e.g. "Visibility" / "Share of voice & trends" (match the LayerBadge "visibility" framing +
  the sibling cards' subtitle style).
- **Icon:** consistent with the other tool cards (pick the icon the prototype/LayerBadge uses for visibility, or a
  sensible lucide icon matching the set).
- **href:** `/brands/[brandId]/visibility` (the working hub route).
- **Placement:** in the same tools grid as the other cards (the empty skeleton slots suggest the grid already
  expects more cards — the Visibility card fills one). Order sensibly among the analytics/intelligence cards.
- **Tier-gating (match the pattern):** the visibility hub is a Growth+ analytics surface. Follow how the other
  cards gate:
  - Growth+ (e.g. Bondi = Growth) → **active card, links to the hub.**
  - If a lower tier (Starter/Free) shouldn't have the full hub → **locked/dimmed card with a Lock icon** (the same
    treatment the Workflow card / other tier-gated cards use), OR a teaser — match whatever convention the existing
    tier-gated cards on this page use. Read `subscriptions.tier` (NOT `organizations.tier`) via the established
    tier resolver.
  - (The competitive-benchmark WITHIN the hub has its own finer tiering — Growth 1 competitor / Agency 3 / Starter
    teaser — but that's inside the hub, already built per §6U.4. This card is just the entry point; gate it at the
    hub's access tier.)
- Use the existing shared card component / LayerBadge / tier-gate helpers — consume, don't reinvent (§6U says the
  shared foundation from S2 exists).

## PART 2 — AUDIT all Sprint 3 surfaces for reachability (the recurring-pattern check)
Since orphaned nav has recurred 5×, verify EVERY Sprint 3 surface is reachable through the UI (not just by URL):
```bash
# Do links/cards exist pointing to each Sprint 3 surface?
grep -rnE "/visibility|/citation-failure|competitive-benchmark|SoV strip|share-of-voice" app/ components/ --include=*.tsx | grep -iE "href|Link|push\(" | head
```
Check each:
1. **Visibility hub** (`/brands/[brandId]/visibility`) — fixed in PART 1 (card added). ✅
2. **Citation Failure Diagnosis** (`/brands/[brandId]/visibility/citation-failure`) — is it reachable FROM the
   visibility hub (a link/tab/CTA within the hub)? It's a sub-route of visibility, so it should be linked from the
   hub, not the brand-detail grid. Confirm there's a path to it (the hub links to it). If NOT, add the link within
   the hub.
3. **Competitive Benchmark panel** — this renders WITHIN the visibility hub (§6U.4) as a section/panel, so it's
   reachable once the hub is. Confirm it actually appears in the hub (not a separate orphaned route).
4. **Dashboard SoV strip** (§6U.5) — this is an increment ON the main dashboard (EnhancedDashboard). Confirm the
   strip actually renders on the dashboard (reachable via the existing dashboard nav — it's not a new route, it's
   an addition to an existing screen). If the strip was built but not wired into the dashboard, that's another
   orphaned increment — flag + fix.
5. **Wins feed** (`/api/brands/[id]/wins`) — API + any UI surface. Confirm whatever consumes it is reachable (if
   it's surfaced in the dashboard or hub).

**Report which Sprint 3 surfaces were reachable vs orphaned**, and fix any orphaned ones (add the missing
link/card/wiring) in this pass — matching existing patterns.

## INVARIANTS
- Match the EXISTING card/tier-gate pattern (mirror the Sprint 2 Workflow card) — no new card style.
- `subscriptions.tier` (never `organizations.tier`) for the tier check, via the established resolver.
- Cross-tier gating consistent with the other cards (active vs locked/teaser as the page's convention dictates).
- Sub-surfaces (citation-failure, competitive-benchmark) link from WITHIN the hub, not the brand-detail grid; the
  dashboard SoV strip is an addition to the dashboard, not a new route.
- Don't change the hub/route logic — this is navigation wiring only (add card + any missing links).
- Don't regress the 68/68 tests or the other cards.

## VERIFY
1. **The Visibility card appears** on the brand-detail page (Bondi Plumbing, Growth tier) in the tools grid, and
   clicking it navigates to `/brands/[brandId]/visibility` (no URL typing needed).
2. **Tier-gating correct:** Growth+ sees an active card; if a lower tier is tested, it shows the locked/teaser
   treatment matching the other cards.
3. **PART 2 audit:** every Sprint 3 surface is reachable through the UI — visibility hub (card), citation-failure
   (linked from hub), competitive-benchmark (renders in hub), dashboard SoV strip (renders on dashboard), wins
   (surfaced where intended). Any orphaned one found is now fixed.
4. No regression: 68/68 tests green; other tool cards unchanged.

## REPORT
- The Visibility card added (title/subtitle/icon/href/tier-gate), mirroring the Workflow card pattern.
- **PART 2 reachability audit:** a table of each Sprint 3 surface → reachable-via-UI (yes/no before) → fixed if
  orphaned. (This is the important part — confirm no OTHER Sprint 3 surface is orphaned.)
- Tier-gating: `subscriptions.tier` used; Growth+ active / lower-tier treatment matches the page convention.
- Confirm: navigation-only changes, existing patterns reused, 68/68 green, no card regressions.

## NOTE — the recurring pattern + the manual-pass value
This is the 5th orphaned-nav occurrence. Two things to bank: (1) for future sprints, the build prompt should
explicitly require "every new surface has a nav entry-point (card/link/tab) from an existing reachable screen, not
just a route" — add that to the sprint-prompt convention so surfaces ship reachable. (2) This is exactly why manual
on-screen testing matters: 68/68 tests passed, but the Visibility hub was unreachable and 3 routes were 500ing
(unmigrated tables) — both invisible to the test suite, both caught by clicking through the actual UI. The manual
pass is doing its job. After this: the behavioural proof (run an audit with Inngest up → confirm the 5 visibility
functions fire + populate the now-existing tables) is still the next step to see REAL data in the hub.
