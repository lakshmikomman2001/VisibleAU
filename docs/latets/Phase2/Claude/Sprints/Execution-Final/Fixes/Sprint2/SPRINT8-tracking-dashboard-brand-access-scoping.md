# SPRINT 8 TRACKING NOTE — wire `brand_access` scoping into the dashboard org-progress aggregate

**Status: NOT a bug. NOT a fix-now item. A Sprint 8 retrofit line item.** Recording this so it surfaces when
Sprint 8 builds brand-level access enforcement, rather than getting lost as an inline TODO comment.

## Context
The dashboard "Work Completed" / Action Progress Tracker card was changed (Option A) from showing one arbitrary
brand (`.limit(1)`) to **aggregating across brands** via `getOrgProgressSummary(orgId)` in
`lib/workflow/progress-summary.ts`. The aggregate currently scopes to:

```
WHERE organization_id = $orgId AND deleted_at IS NULL   -- ALL non-deleted brands in the org
```

i.e. it sums **all org brands**, NOT "all brands the member can access." There is a comment in
`progress-summary.ts` marking where `brand_access` filtering plugs in.

## Why this is correct for now (no live leak)
Per the LLD brand-isolation mechanism (S8b-01, canonical):
> "RLS is ORG-scoped... without an explicit gate, `brand_access` is **stored-but-inert** and any org member can
> reach any brand in the org. The canonical gate is `assertBrandAccess(user, brandId)`... **Sprint 8 builds it and
> retrofits the S1–S7 brand routes; Sprint 9 relies on it.**"

So **today, NO brand-scoped surface in the app enforces brand-level isolation** — `brand_access` is stored-but-inert
app-wide until Sprint 8. The dashboard aggregate showing all org brands is therefore **consistent with current
whole-app behaviour**, not a hole this change introduced. The org-level RLS (outer tenant boundary) still holds —
cross-ORG isolation is intact; only the inner brand boundary is universally deferred.

## What must happen IN Sprint 8 (the actual line item)
When Sprint 8 builds `assertBrandAccess(user, brandId)` (lib/governance/access-control.ts) and retrofits the
S1–S7 brand-scoped routes, **also scope this dashboard aggregate**:
- Change `getOrgProgressSummary` so the brand list it aggregates over is the member's **accessible** brands, not
  all org brands:
  - Resolve accessible brands via the canonical path (`org_members.brand_access`: null = all org brands; non-null
    array = ONLY those), the same helper the route retrofit uses.
  - The aggregate's `inArray(brandId, ids)` then receives the ACCESSIBLE id list, not the full-org list.
- This is the marked TODO spot in `progress-summary.ts` — likely a one-line change of which id list feeds
  `inArray`, IF Sprint 8 produces a reusable `getAccessibleBrands(user, orgId)`-style helper (it should, since the
  route retrofit needs the same thing).

## Why NOT to fix it now (sequencing)
Building brand_access enforcement for ONE dashboard card while every other brand-scoped route still lacks it is
backwards — it'd be an inconsistent, isolated half-measure. The correct sequence is Sprint 8's coherent pass:
build `assertBrandAccess`, retrofit all S1–S7 routes, AND scope this aggregate, together. Doing it piecemeal now
risks divergent access logic.

## Risk if forgotten
If Sprint 8 retrofits the routes but MISSES this aggregate, a member with restricted `brand_access` would see the
full org's "Work Completed"/"Measured Impact" totals on the dashboard — including brands they cannot access. A
brand-isolation leak on an analytics surface. Hence this note: **add the dashboard org-progress aggregate to the
Sprint 8 brand-access retrofit checklist**, alongside the `/api/brands/[id]/...` routes.

## One-line correction to the prior report
The Option-A fix report ticked "Accessible brands only ✓". More precisely: it's **"all non-deleted ORG brands
now; accessible-brands scoping deferred to Sprint 8"** (the brand_access half is a tracked TODO, not shipped).
Functionally fine today (brand_access inert app-wide); just not the full invariant yet.

## Where to record
- Add to the Sprint 8 backlog / brand-access retrofit checklist as: "Scope `getOrgProgressSummary` to accessible
  brands (currently all org brands — TODO marked in progress-summary.ts)."
- Keep in the handover open-items list until Sprint 8 closes it.
