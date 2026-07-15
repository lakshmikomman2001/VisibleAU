# VisibleAU — Build the workspace-switcher (GH2): the nav handle to reach /agency — Claude Code
# Why: /agency (AgencyDashboard) is built and now renders (crash fixed), but there's NO UI path to it —
#   you have to type the URL. Canon's ONLY intended entry point is the top-bar workspace-switcher with
#   an "All brands → /agency" option (GH2). This builds that switcher.
# Pins: canon Sprint 9 GH2 (workspace-switcher spec, L641-651), GET /api/brands (Sprint 4 data source),
#   DoD L1096. TS strict; design tokens; both themes; str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
DESIGN ALIGNMENT (prototype) — match the EXISTING Select pattern, don't invent one
═══════════════════════════════════════════════════════════════════════════════
The prototype already shows this control visually: a **`Select` dropdown with an "All brands" option**
(prototype L2173 and L3526 — the latter is in the AgencyDashboard region). So:
- **Reuse the prototype's existing `Select` component / styling** for the switcher — do NOT design a new
  dropdown look. The "All brands" item matches what the prototype already renders
  (`{ value: 'all-brands', label: 'All brands' }`); this build makes it FUNCTIONAL (real brand list +
  routing + tier-gating) instead of the prototype's static mock.
- **Placement:** the prototype `TopBar` (L431-455) lays out: breadcrumbs → `actions` slot → `Bell` →
  `ThemeToggle`. Mount the switcher in/adjacent to that row — the `actions` slot (between breadcrumbs
  and the bell) is the natural home for this top-bar control, consistent with where page-level controls
  already sit. Keep it visually consistent with the Bell + ThemeToggle controls beside it.
NOTE: the prototype's "All brands" Select is a STATIC mock (only that one option, no real brands, no
routing). The functional behaviour below comes from canon GH2; the VISUAL comes from the prototype's
Select. Combine them — prototype look + GH2 behaviour.

═══════════════════════════════════════════════════════════════════════════════
WHAT GH2 SPECIFIES (build to this exactly)
═══════════════════════════════════════════════════════════════════════════════
`components/domain/agency/workspace-switcher.tsx` — a **top-bar** brand selector ('use client'):
- **Data source:** existing `GET /api/brands` (Sprint 4) — returns the org's brands. Do NOT add a new
  endpoint.
- **On mount:** `fetch('/api/brands')` → list of `{ id, name, domain }`.
- **Renders:** a dropdown/select of brand names.
- **On selecting a brand:** `router.push(\`/brands/${selectedId}/audits\`)`.
- **Shows the current brand name** if on a brand-specific page (read brandId from URL params).
- **For Agency-plan users:** ALSO shows an **"All brands (N)"** option that `router.push('/agency')`.
- **Props:** `{ currentBrandId?: string }` — highlighted in the dropdown if on a brand page.

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — Check what exists (avoid duplicating)
═══════════════════════════════════════════════════════════════════════════════
> - Does `components/domain/agency/workspace-switcher.tsx` already exist (partially)? If so, read it and
>   extend rather than recreate.
> - Find the top-bar / header component (likely the PageShell topbar — where the bell icon + theme
>   toggle live, visible top-right in the app). That's where the switcher mounts.
> - Confirm `GET /api/brands` returns `{ id, name, domain }[]` scoped to the current org (RLS). If the
>   current shape differs, adapt the fetch to whatever it returns (don't change the endpoint).
> - Determine how the current user's TIER is available client-side (for the agency-only option) — a
>   context, a prop, or a small fetch. Use whatever the app already uses for tier gating.
> Report: existing switcher? · the topbar component path · the /api/brands shape · how tier is read.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Build the workspace-switcher component
═══════════════════════════════════════════════════════════════════════════════
> Create/complete `components/domain/agency/workspace-switcher.tsx` ('use client') per the GH2 spec:
> - On mount, `fetch('/api/brands')` → `{ id, name, domain }[]`. Handle loading + error states (a
>   disabled/placeholder control while loading; graceful no-crash on fetch failure).
> - Render a dropdown listing brand names. If `currentBrandId` is set (on a brand page), show that
>   brand as the current selection and highlight it.
> - On choosing a brand → `router.push(\`/brands/${id}/audits\`)`.
> - **Tier-aware agency option:** if the user's tier ∈ {agency, agency_pro, enterprise}, prepend an
>   **"All brands (N)"** item (N = brand count) that routes to `/agency`. For non-agency tiers, DO NOT
>   show the "All brands" option (they'd only hit the TierGate — don't dangle a dead-end).
> - Style by **reusing the prototype's existing `Select` component** (the one used for "All brands" at
>   proto L2173/L3526) — match that dropdown's look rather than inventing one; works in both light and
>   dark themes; accessible (keyboard-navigable, proper labels).
> - Single brand / no brands: if the org has 1 brand, the switcher can still render (shows that brand);
>   if 0 brands, show a neutral empty/disabled state, no crash.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Mount it in the top bar
═══════════════════════════════════════════════════════════════════════════════
> Place `<WorkspaceSwitcher currentBrandId={...} />` in the top-bar/header (the PageShell topbar) so it
> appears across the authenticated app, next to the existing bell + theme toggle. Pass `currentBrandId`
> derived from the route params when on a `/brands/[brandId]/*` page; omit otherwise.
> - It should render on the workspace pages (Overview, Brands, etc.) AND on /agency — a persistent
>   top-bar control, not a per-page one.
> - Do NOT add it to the public client-portal layout (that's the no-sidebar/no-chrome white-label view).

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify on real data
═══════════════════════════════════════════════════════════════════════════════
> As the agency-tier user (3 brands: Bondi Plumbing, Asset Plumbing Solutions, Marrickville Dental
> Studio):
> - The top-bar switcher appears and lists the 3 brands by name.
> - Selecting a brand navigates to `/brands/{id}/audits`.
> - The **"All brands (3)"** option is present and navigates to **/agency** (the dashboard you can
>   currently only reach by typing the URL — this is the fix's whole point).
> - On a brand page, the switcher shows/highlights the current brand.
> - Both light/dark themes; keyboard-accessible; no console errors; `npm run typecheck` passes.
> - (If feasible) confirm a NON-agency tier does NOT see the "All brands" option — only the brand list.
> Report: a description/screenshot of the switcher open, showing the brand list + the "All brands (3) →
> /agency" option, and confirmation that choosing it lands on the Agency Dashboard.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **This is the missing piece that makes /agency reachable.** Canon deliberately does NOT put "Agency"
  in the sidebar — the intended entry is this top-bar switcher's "All brands" option. After this, you
  reach the Agency Dashboard via the top bar instead of typing the URL.
- **It's tier-aware on purpose:** the "All brands → /agency" option only shows for agency tiers, so
  lower tiers don't get a dead-end link into a TierGate. The brand-switching part works for everyone.
- **Reuses existing /api/brands** — no new endpoint, no scoring/schema change. Low risk; it's a
  client component + a topbar mount.
- **Doesn't touch the Top Movers 0.0 question** — that's separate (likely legitimate identical scores;
  worth confirming once a brand's score changes, e.g. after the Marrickville re-audit). This prompt is
  purely the navigation handle.
- Per your relay discipline: low-risk (UI nav only, no data writes), but worth a glance that the
  tier-gating on the "All brands" option matches how the rest of the app reads tier.
