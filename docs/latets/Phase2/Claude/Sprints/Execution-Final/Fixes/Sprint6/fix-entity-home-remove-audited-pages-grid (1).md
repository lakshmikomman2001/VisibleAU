# Claude Code — FIX: remove the "Audited Pages" content grid from the Entity Home screen (content-structure bleed, §6U.6)

The Entity Home screen (`/brands/[id]/retrieval/entity-home`) shows a compliant status card (@id/sameAs/org-schema —
correct per §6U.6, just fixed) BUT also an "Audited Pages" section: per-page cards with Citation prob %, Capsule X/4,
content_format (listicle/expert_article), freshness (aging/fresh), Passages. That's CONTENT-STRUCTURE data — it belongs
on the Content Structure screen (§6U.4, content-structure/page.tsx), NOT Entity Home. §6U.6 specifies Entity Home as
"single-column **status + gap list**" — no per-page content grid. Remove the grid; keep the status card.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand
418f321f-2489-4560-aaa9-895728580465.

## Why (canon — this is bleed, not a design choice)
- §6U.6 (Entity Home): "@id present / sameAs count / org-schema present / the gaps with recommendations. RESPONSIVE:
  single-column **status + gap list**." That's the COMPLETE screen spec — status card + gaps. No per-page content grid.
- The "Audited Pages" data (Citation prob, Capsule, content_format_detected, freshness_risk, Passages) is the
  content-structure audit spec (§0.5 lines 107-109 format/freshness enums; line 208 citation_probability_score "the
  headline metric") — which is the **Content Structure screen's** content (§6U.4, content-structure/page.tsx).
- So it's DUPLICATED here from where it belongs → content-structure bleed onto Entity Home (the same bleed that caused
  the card to show Citation/Capsule before it was fixed). Removing it loses NO data — it's on /content-structure.

## STEP 1 — Find the "Audited Pages" section on the Entity Home page
```bash
cat "app/(auth)/brands/[brandId]/retrieval/entity-home/page.tsx"
grep -n "Audited Pages\|ContentStructureCard\|content.structure\|Capsule\|Citation prob\|freshness\|per-page\|pages.map\|contentStructure" "app/(auth)/brands/[brandId]/retrieval/entity-home/page.tsx" components/domain/retrieval/entity-home-card.tsx
```
Report: which section/component renders "Audited Pages" (the per-page content-structure cards) on the Entity Home page,
and how the page fetches that data (a content_structure_audits query it can stop making).

## STEP 2 — Remove the "Audited Pages" section (keep the status card)
- Delete the "Audited Pages" heading + the per-page content-structure card list from entity-home/page.tsx.
- Keep the EntityHomeCard (the compliant @id/sameAs/org-schema status card — that stays, it's §6U.6-correct).
- Remove any now-unused content-structure data fetch/props the page was doing ONLY to feed the removed grid (don't leave
  a dead query). Keep whatever the status card needs (the entity-home status object).
- Do NOT touch the Content Structure screen (§6U.4) — the per-page grid lives there and is unaffected.

## STEP 3 — Confirm §6U.6 states still work (nothing else regressed)
The Entity Home screen must still have its §6U.6 states after removal:
- **loading:** skeleton
- **empty (no entity home identified):** EmptyState "We haven't identified your Entity Home yet — run an audit"
- **error:** boundary
- **RESPONSIVE:** single-column status + gap list
Confirm removing the grid didn't break the empty/loading/error paths (e.g. the page doesn't error when there's no
content-structure data now that the grid's gone).

## STEP 4 — Verify on screen
Reload `/brands/418f321f.../retrieval/entity-home`:
- Shows ONLY the Entity Home status card (Complete · @id present · sameAs 4/3 · org-schema present) + gaps if any.
- The "Audited Pages" grid is GONE.
- The Content Structure screen (`/retrieval/content-structure`) still shows the per-page grid (unaffected — that's its
  home).
- Empty-state check (optional): a brand with no entity home → the §6U.6 empty state, not an error.
Report: Entity Home = status card + gaps only; Audited Pages gone; Content Structure screen unaffected.

## STEP 5 — Report
- The "Audited Pages" content-structure grid removed from Entity Home; the compliant status card retained.
- Any unused content-structure fetch/props removed (no dead query).
- §6U.6 states (loading/empty/error) intact; Content Structure screen (§6U.4) still has the per-page grid.
- On screen confirmed.
- Add/adjust a test: assert the Entity Home page renders the status card but NOT the per-page content-structure grid
  (re-break: re-add the grid → fail) — guards the bleed from returning.

## Constraints
- §6U.6 = status + gap list ONLY. Remove the per-page content-structure grid (Citation/Capsule/Format/freshness/
  Passages) — it's Content Structure's (§6U.4), duplicated here.
- KEEP the EntityHomeCard status card (§6U.6-compliant, just fixed) + the gap list.
- Remove dead data fetches the grid needed; keep what the status card needs. Don't touch /content-structure.
- Preserve the §6U.6 loading/empty/error states.
- Verify on screen. Local prod, never real prod. LLD v8.70 / §6U.6 / §6U.4 win.

## NOTE
The "Audited Pages" per-page content grid (Citation/Capsule/content_format/freshness/Passages) is content-structure data
(§6U.4 / §0.5 / §208) bleeding onto the Entity Home screen — §6U.6 specifies Entity Home as "single-column status + gap
list" only, no per-page grid, and this data already lives on the Content Structure screen (no data lost by removing it).
It's the same bleed that made the card show Citation/Capsule before the card fix. Remove the grid, keep the compliant
status card, drop any dead content-structure fetch, preserve the §6U.6 states. Verify: Entity Home = status card + gaps;
grid gone; Content Structure screen unaffected.
