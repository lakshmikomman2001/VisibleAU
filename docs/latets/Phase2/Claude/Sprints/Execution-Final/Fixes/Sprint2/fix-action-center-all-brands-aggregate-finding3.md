# Claude Code — FIX (Finding 3, design decision resolved): Action Center → workspace-level "All brands" queue with filter

Action Center is currently in an inconsistent state: it's positioned **workspace-level** (Phase 1 `ActionCenter`
screen, in the workspace sidebar) but **behaves single-brand** — it shows one brand's recommendations with **no
brand selector and no way to see across brands**. The canon prototype intended per-brand; the product is
agency-first (LLD: white-label/multi-brand/workflow + execution-first is the core differentiator vs monitoring-only
tools).

**Decision (Sri): Option 2 — workspace-level aggregate queue with an "All brands ▾" selector.** Action Center
shows a UNIFIED recommendation queue across all the user's brands, defaulting to **All brands**, with the option to
filter to a single brand. This gives agencies the "show me everything across my clients that needs action" triage
queue (the execution-first value prop), and is **consistent with the two aggregate decisions already made this
session** (dashboard "Work Completed" + org-progress both aggregate-across-brands with narrow-down). Workspace
surfaces aggregate-with-filter; brand surfaces (Workflow) stay per-brand — one coherent model.

Canon context the fix MUST respect:
- Recommendations are brand-specific (a gap belongs to a brand). Tasks link via `remediation_tasks.recommendation_id
  → recommendations`. The Action Center sort is **`cross_prompt_impact DESC NULLS LAST`** (the "HIGH LEVERAGE — fix
  this gap → improves N prompts" ordering — LLD ~3171/3174). Preserve this sort.
- An existing cross-brand aggregate pattern exists (agency dashboard "rolls up ... across all brands in the org",
  LLD ~4390) — mirror its approach for scoping/attribution; don't invent a new one.
- **Brand isolation:** "the user's brands" is gated by `org_members.brand_access` / `assertBrandAccess` — null =
  all org brands; non-null array = only those. BUT note (per the dashboard work): `brand_access` enforcement is
  **stored-but-inert app-wide until Sprint 8**. So scope the aggregate to org brands now, with a **marked TODO**
  to switch to accessible-brands when Sprint 8 builds `assertBrandAccess` (same pattern + same TODO marker as
  `getOrgProgressSummary` in progress-summary.ts — keep them consistent).

> **Investigate-first. Confirm the current shape before changing.** Read:
> - The Action Center page + client component (`app/(auth)/action-center/...` / `ActionCenter`). Confirm how it
>   currently selects which brand's recommendations to show (the implicit single-brand behaviour — is it a
>   `.limit(1)` first-brand, a hardcoded brand, a missing filter?).
> - The recommendations data source + query (where Action Center reads recommendations/gaps from) and its sort
>   (`cross_prompt_impact DESC NULLS LAST`). Confirm the table/fields.
> - The existing brand selector pattern elsewhere (the top-bar "Bondi Plumbing ▾" brand switcher, or the agency
>   dashboard's multi-brand view) — reuse that selector component + the "All brands" option convention rather than
>   building a new one.
> - `getOrgProgressSummary` in `lib/workflow/progress-summary.ts` — the just-built org-aggregate pattern (org
>   brands now, brand_access TODO) — mirror its scoping for consistency.
> Report: the current single-brand mechanism, the recommendations query + sort, and the selector component to
> reuse — then implement.

---

## THE FIX — aggregate queue + "All brands ▾" selector

1. **Default to All brands (aggregate).** Action Center loads showing recommendations across ALL the user's brands
   (org brands now; brand_access-scoped when Sprint 8 lands — marked TODO), as one unified queue.
   - Query recommendations with `brand_id = ANY($brandIds)` (the user's brand list), NOT a single brand. One
     aggregate query — no N+1, no per-brand loop.
   - Preserve the canonical sort: **`cross_prompt_impact DESC NULLS LAST`** across the merged set (highest-leverage
     gaps first, regardless of brand).
2. **Add the "All brands ▾" selector.** Reuse the existing brand-selector component (the same one used in the
   top-bar brand switcher / agency views). Options: **All brands** (default) + each accessible brand.
   - Selecting a specific brand filters the queue to that brand's recommendations (the per-brand view, on demand).
   - Selecting "All brands" returns to the aggregate.
3. **Per-row brand attribution.** In the aggregate view, EACH recommendation row must clearly show **which brand**
   it belongs to (a brand name/label/badge on the row) — otherwise a merged queue is ambiguous. In a single-brand
   filtered view, the brand label is redundant (optional to keep).
4. **Preserve the recommendation detail + actions.** Clicking a recommendation still opens its detail with the
   "Create task" / "Mark as done" / "Dismiss" actions (the TC-01 flow, already working). The brand context carries
   through (a task created from an aggregate-view recommendation is created for THAT recommendation's brand).
5. **Empty/edge states.** All brands with zero recommendations → graceful empty state. A filtered brand with none →
   "no recommendations for {brand}". Single-brand user → aggregate == that one brand (selector still present,
   showing All brands + the one brand). No crash/NaN.

## INVARIANTS — do not violate
- Default = **All brands aggregate**; filtering to one brand is on-demand. Do NOT keep the implicit single-brand
  behaviour.
- Scope to org brands now WITH a marked TODO to switch to `brand_access`/`assertBrandAccess`-scoped when Sprint 8
  builds it — keep this TODO consistent with `getOrgProgressSummary`'s (same deferral, same marker).
- Preserve the canonical sort `cross_prompt_impact DESC NULLS LAST`.
- No N+1 — one aggregate query with `brand_id = ANY(...)`.
- Per-row brand attribution in the aggregate view (a merged queue MUST show which brand each row is for).
- Recommendation detail + Create task/Mark done/Dismiss actions unchanged; brand context flows through to the
  created task (correct `brand_id`).
- Reuse the existing brand-selector component + "All brands" convention; don't build a new selector. Reuse existing
  tokens/components.
- Do NOT change Workflow (that's correctly per-brand by design). This is the Action Center surface only.

## VERIFY
1. Seed/confirm a multi-brand state: ≥2 brands each with recommendations (Bondi + Marrickville). Count
   recommendations per brand:
   ```bash
   psql "$DATABASE_URL" -c "SELECT brand_id, COUNT(*) FROM recommendations GROUP BY brand_id;"  -- adjust table/col to actual source
   ```
2. **Aggregate default:** Action Center loads showing recommendations from BOTH brands in one queue (not just one
   brand's), sorted by `cross_prompt_impact DESC NULLS LAST`. The row count == sum across the user's brands.
3. **Per-row attribution:** each row shows which brand it belongs to (Bondi vs Marrickville visibly distinguished).
4. **Filter works:** selecting "Bondi Plumbing" in the "All brands ▾" selector narrows to Bondi's recommendations
   only; selecting "All brands" restores the merged queue.
5. **Action flow intact:** open a recommendation (from the aggregate view) → Create task → the task is created for
   the CORRECT brand (that recommendation's brand_id), lands in that brand's Workflow. (Cross-check the new task's
   brand_id.)
6. **Single-brand user:** aggregate == that brand; selector present, no regression.
7. No N+1 (one aggregate query); Workflow per-brand surfaces untouched.
8. Suite green; only the known pre-existing `audit_cost_snapshots` red.

## REPORT
- Current single-brand mechanism (how it picked one brand) + the recommendations query/sort + the selector
  component reused.
- The aggregate implementation: `brand_id = ANY(brandIds)`, sort preserved, org-brands scope + brand_access TODO
  (consistent with getOrgProgressSummary).
- Per-row brand attribution added; selector wired (All brands default + per-brand filter).
- **Behavioural proof:** aggregate shows ≥2 brands' recommendations merged + sorted; filter narrows to one;
  Create task from aggregate view creates for the correct brand. DB cross-check (per-brand rec counts vs merged
  queue count).
- Confirm invariants: All-brands default, sort preserved, no N+1, per-row attribution, action flow + brand context
  intact, brand_access TODO marked, Workflow untouched. Suite green.

## NOTE — relationship to prior decisions
This completes a consistent model set this session: dashboard "Work Completed" (aggregate), org-progress
(aggregate), and now Action Center (aggregate-with-filter) all scope across the user's brands at the workspace
level — while Workflow stays per-brand. All three share the same `brand_access`-deferred-to-Sprint-8 TODO; when
Sprint 8 builds `assertBrandAccess`, all of them switch from "org brands" to "accessible brands" together (see
SPRINT8-tracking-dashboard-brand-access-scoping.md — add Action Center to that same retrofit checklist).
