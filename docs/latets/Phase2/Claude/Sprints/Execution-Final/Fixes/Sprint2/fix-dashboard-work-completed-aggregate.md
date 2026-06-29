# Claude Code — FIX: dashboard "Work Completed" shows only ONE arbitrary brand — aggregate across the user's brands (Option A)

The dashboard "Work Completed" / Action Progress Tracker card calls `getProgressSummary(firstBrand)` where
`firstBrand` is whichever brand sorts first (`.limit(1)`). For a multi-brand / agency user, the card shows ONE
arbitrarily-chosen brand's progress while reading as general/"your" progress — misleading. (For a single-brand
user it happens to be correct, which is why it slipped through.)

**Decision (Sri): Option A — AGGREGATE across all brands the user can access.** Show total recommendations
completed (and total measured lift) summed across the user's accessible brands, so the number is correct
regardless of how many brands they have. This gracefully covers both the single-brand case (sum of one = same as
today) and the agency case (sum of all = real org progress). Do NOT keep the single-arbitrary-brand pick.

Canon context the fix MUST respect:
- The metric source is `lib/workflow/progress-summary.ts`, per brand:
  `COUNT(*) FILTER (WHERE status='complete' AND date_trunc('month', completed_at)=date_trunc('month', now()))`
  for **Work Completed**, and
  `COALESCE(SUM(lift_achieved) FILTER (WHERE score_after IS NOT NULL AND date_trunc('month', completed_at)=
  date_trunc('month', now())), 0)` for **Measured Impact**.
- **HONESTY RULE (locked):** the lift SUM includes `score_after IS NOT NULL` — only counts tasks where a re-audit
  actually ran. Never display projected lift as measured. Aggregation must preserve this filter.
- **TWO-STATE DISPLAY (locked):** "Work Completed" (count, shown immediately) and "Measured Impact" (lift, only
  after re-audit) are DISTINCT states. Keep them distinct in the aggregate too — a user who completed tasks but
  whose re-audits haven't run must not perceive inactivity.
- **MONTH BOUNDARY (locked):** `date_trunc('month', now())` UTC — matches Phase 1 quota-check. Do NOT switch to
  AEST.
- **BRAND ACCESS (locked):** "the user's brands" is NOT "all brands in the org" — it's gated by
  `org_members.brand_access` via `assertBrandAccess` (lib/governance/access-control.ts): null brand_access = all
  brands in org; a non-null array = ONLY those brands. The aggregate MUST sum only brands the member can access,
  or it leaks counts from restricted brands. (Org RLS is the outer tenant boundary; brand_access is the inner one.)

> **Investigate-first. Confirm the current shape + the access helper before changing.** Read:
> - The "Work Completed" card component (`work-completed-card.tsx`) + wherever `getProgressSummary(firstBrand)` is
>   called and how `firstBrand` is selected (the `.limit(1)`).
> - `lib/workflow/progress-summary.ts` — the per-brand query + return shape (gapsClosed/completedThisMonth +
>   measured lift + totalTasks/denominator). Confirm exact field names.
> - The brand-access helper: how to get the list of brands THIS user may access in THIS org — `assertBrandAccess`
>   / `org_members.brand_access` / any existing `getAccessibleBrands(user, orgId)`-style helper. Reuse the
>   canonical one; do NOT hand-roll brand filtering that ignores brand_access.
> - Which dashboard(s) this card renders on (per-org dashboard, agency dashboard, or both) — so the aggregate is
>   correctly scoped to the brands shown there.
> Report: the current first-brand selection, the progress-summary return shape, and the canonical accessible-brands
> helper — then implement the aggregate.

---

## THE FIX — aggregate over accessible brands

1. **Resolve the user's accessible brands** for the current org using the canonical access path (respect
   `brand_access`: null = all org brands; array = only those). Do NOT use a bare "all brands in org" query that
   ignores `assertBrandAccess` — a restricted member must not see counts from brands they can't access.
2. **Aggregate the progress metrics** across those brands, preserving the canonical query semantics:
   - **Work Completed** = SUM over accessible brands of the per-brand `COUNT(status='complete' this month)`.
   - **Measured Impact** = SUM over accessible brands of the per-brand lift SUM **with the `score_after IS NOT
     NULL` honesty filter intact**.
   - **Denominator (if "X / N" framing)** = the aggregate total of the relevant tasks/gaps across accessible
     brands (so "X / N gaps closed this month" is org-true, not one brand's).
   - **Prefer a single aggregate SQL query** (one round-trip: same FILTERs, `WHERE brand_id = ANY($accessibleIds)`)
     over looping `getProgressSummary` per brand (avoid N+1). If you extend `progress-summary.ts` with an
     aggregate variant (e.g. `getProgressSummaryForBrands(brandIds[])`), keep the EXACT same FILTER clauses +
     month boundary + honesty rule as the per-brand version.
3. **Keep the two-state display** — Work Completed and Measured Impact remain distinct cards/states in the
   aggregate. Don't collapse them.
4. **Label honestly** — the card now represents the user's overall progress across their brands (not one brand).
   If a denominator is shown, it's the aggregate. (No need to name a single brand anymore — it's all of them.)
5. **Empty/edge states** — user with one brand → aggregate == that brand (same as today, correct). User with zero
   accessible brands → graceful empty state (no crash, no NaN). The empty-state month-filter check that already
   exists (`work-completed-card.tsx:34` used `completedThisMonth`) should be preserved/adapted to the aggregate.

## INVARIANTS — do not violate
- Aggregate over **accessible** brands only (`brand_access`/`assertBrandAccess`), NOT all org brands blindly.
- Preserve the **honesty rule** (`score_after IS NOT NULL` on the lift SUM) and the **two-state display** (Work
  Completed vs Measured Impact distinct).
- `status='complete'` (no -d) spelling; **UTC** `date_trunc('month', now())` boundary (match quota — do NOT change
  to AEST).
- No N+1 — prefer one aggregate query with `brand_id = ANY(...)`; if extending progress-summary, reuse the EXACT
  FILTER/boundary/honesty clauses.
- Do NOT change the WorkflowHub per-brand card (that's correctly per-brand by design — it shows the single brand
  you're viewing). This fix is the DASHBOARD card only.
- Reuse existing components/tokens; display change + query scope only — no invented numbers.

## VERIFY
1. Seed/confirm a multi-brand state: at least two accessible brands with completed tasks this month (you have
   Bondi + Marrickville from the bulk test). Count org-wide-accessible vs per-brand:
   ```bash
   psql "$DATABASE_URL" -c "SELECT brand_id, COUNT(*) FILTER (WHERE status='complete' AND date_trunc('month', completed_at)=date_trunc('month', now())) AS done_this_month FROM remediation_tasks GROUP BY brand_id;"
   ```
2. The dashboard "Work Completed" number == the **SUM** of done_this_month across the user's accessible brands —
   NOT just the first brand's count. (With Bondi having completed tasks + any other brand's, the card reflects the
   total, not one.)
3. **Access scoping:** if a member has `brand_access` restricted to a subset, the aggregate counts ONLY those
   brands (verify a restricted member doesn't see counts from brands outside their access). A null-brand_access
   member sees all org brands.
4. **Honesty rule:** Measured Impact aggregate counts only tasks with `score_after IS NOT NULL` (a completed-but-
   not-re-audited task adds to Work Completed but NOT to Measured Impact). The two-state distinction holds.
5. Single-brand user: aggregate == that one brand (no regression).
6. No N+1: one aggregate query (or a bounded `ANY($ids)`), not a per-brand loop. WorkflowHub per-brand card
   unchanged.
7. Suite green; only the known pre-existing `audit_cost_snapshots` red.

## REPORT
- Current first-brand selection mechanism (the `.limit(1)`) and the progress-summary return shape.
- The canonical accessible-brands helper used (respecting `brand_access`/`assertBrandAccess`).
- The aggregate implementation: single SQL with `brand_id = ANY(accessible)` vs an aggregate helper variant;
  confirm same FILTER/month-boundary/honesty clauses as per-brand.
- **DB cross-check:** per-brand done_this_month counts vs the dashboard's aggregated number (proves it sums, not
  picks-one). Access-scoping check (restricted member sees only their brands).
- Confirm invariants: accessible-brands-only, honesty rule + two-state preserved, status='complete' + UTC month,
  no N+1, WorkflowHub per-brand card untouched. Suite green.

## NOTE — current data caveat (for Sri)
With today's test data, all completed tasks may sit on one brand (Bondi) in the current month, so the aggregate
could coincidentally equal the old first-brand number. The fix is correct by construction; to PROVE it sums, the
verify step needs ≥2 accessible brands with completed tasks this month (Bondi + Marrickville qualifies if
Marrickville has any completed tasks — otherwise complete one task on a second brand to demonstrate the aggregate
exceeds any single brand's count).
