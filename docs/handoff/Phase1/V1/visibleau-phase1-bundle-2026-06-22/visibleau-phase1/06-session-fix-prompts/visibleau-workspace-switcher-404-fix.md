# VisibleAU — Fix workspace-switcher 404: route to a page that EXISTS — Claude Code prompt
# Bug: selecting a brand in the workspace-switcher routes to /brands/{id}/audits → 404.
# Root cause (verified against canon): /brands/[brandId]/audits does NOT exist — it's never specified
#   in any sprint prompt. GH2's spec told the switcher to push to that route, but the page was never
#   built. The switcher is working; its DESTINATION is wrong (a GH2 spec error, not a build error).
# Pins: canon brand routes (the real /brands/[brandId]/* pages: page, local-seo, metrics,
#   technical-audit), Sprint 4 BrandDetail (audit history lives on the brand detail page — BG3/BI3).
# str_replace/exact-literal only. Tiny change.

═══════════════════════════════════════════════════════════════════════════════
ROOT CAUSE (confirmed)
═══════════════════════════════════════════════════════════════════════════════
- GH2 specified: on selecting a brand → `router.push('/brands/${selectedId}/audits')`.
- But canon defines NO `/brands/[brandId]/audits` page. The actual `/brands/[brandId]/*` routes are:
  `page` (brand detail), `local-seo`, `metrics`, `technical-audit`. There is no per-brand audits route.
- The brand's audit HISTORY actually renders ON the brand detail page (`/brands/[brandId]`) — canon
  Sprint 4 "§8 BrandDetail audit history" (the audit-history list with deltas + Wilson CI lives there).
- The cross-brand audit list is `/audits` (a separate page).
- So GH2 pointed the switcher at a phantom route → 404. Fix = route to the page that exists.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Confirm the correct destination exists
═══════════════════════════════════════════════════════════════════════════════
> - Confirm `/brands/[brandId]` (brand detail, `app/(auth)/brands/[brandId]/page.tsx`) EXISTS and
>   renders the brand's audit history (it does per canon — it's the page with the 8 dimension cards +
>   KPIs + "Audit history" section you've been reviewing).
> - Confirm there is NO `app/(auth)/brands/[brandId]/audits/page.tsx` (that's the 404 target).
> Report both.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Change the switcher's route target
═══════════════════════════════════════════════════════════════════════════════
> In `components/domain/agency/workspace-switcher.tsx`, change the per-brand navigation from the
> non-existent audits route to the brand detail page:
> - FROM: `router.push(\`/brands/${selectedId}/audits\`)`
> - TO:   `router.push(\`/brands/${selectedId}\`)`
> This lands the user on the brand detail page, which shows that brand's audit history — achieving GH2's
> intent ("switch active brand context → see that brand's audits") at the route that actually exists.
> - Also update `currentBrandId` highlighting logic if it parsed the brandId from a `/audits` URL — it
>   should read brandId from the `/brands/[brandId]` route param instead.
> - Leave the "All brands (N) → /agency" option UNCHANGED (that route works).
> - Do NOT create a new `/brands/[brandId]/audits` page just to satisfy the old target — the brand
>   detail page already serves this purpose; adding a duplicate audits page would be redundant and
>   isn't in canon.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify on real data
═══════════════════════════════════════════════════════════════════════════════
> As the agency-tier user:
> - Open the switcher, select a brand (e.g. Bondi Plumbing) → lands on `/brands/{id}` (the brand detail
>   page with its audit history), NOT a 404.
> - Repeat for the other brands (Asset Plumbing Solutions, Marrickville Dental Studio) → each loads its
>   detail page.
> - The "All brands (3)" option still → /agency (Agency Dashboard).
> - On a brand detail page, the switcher shows/highlights the current brand.
> - `npm run typecheck` passes; both themes; no console errors.
> Report: confirm selecting a brand now lands on the brand detail page (no 404), with a description/
> screenshot.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is a GH2 spec bug, not a build mistake.** Claude Code routed exactly where canon GH2 said
  (`/brands/{id}/audits`) — but that page was never specified anywhere in the sprint prompts, so it
  404s. The build followed the spec faithfully; the spec was wrong.
- **The fix is one line** — route to `/brands/{id}` (brand detail), which is where the audit history
  actually lives (canon Sprint 4 §8 BrandDetail). That satisfies GH2's intent at a real route.
- **Worth recording:** if you keep a canon-errata list, note "GH2 routes to non-existent
  /brands/[brandId]/audits; corrected to /brands/[brandId]" — so a future build/reviewer doesn't
  reintroduce it. (Same class as the FM5 audit-list and the agency ambiguous-id fixes: GH/GB spec
  items that needed real-data correction.)
- Still separate/open: Top Movers 0.0 (likely legit identical scores) and the Marrickville 13.8
  diagnostic. This prompt is only the switcher route fix.
