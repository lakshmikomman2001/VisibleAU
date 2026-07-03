# Claude Code — FIX (minor, built-not-rendering): Dashboard SoV strip missing from the dashboard

**Finding:** the Sprint 3 §6U.5 **Share-of-Voice strip** is specified to be added to the dashboard
(EnhancedDashboard, the S2 dashboard shell), but on screen the dashboard (`/dashboard` — stat cards → Recent
audits) shows **NO SoV strip.** The component `dashboard-sov-strip.tsx` exists (its keys + aggregation were fixed
earlier), but it is **not rendering on the dashboard page** — either not mounted in the dashboard's render tree, or
hidden by a condition.

Note: an earlier reachability audit reported this strip as "wired into dashboard page — no fix needed," but on
screen it is NOT there. The audit saw the component referenced/imported and assumed it renders; it doesn't actually
appear. So confirm ACTUAL rendering, not just an import.

> Investigate-first: find whether the strip is (a) never placed in the dashboard page's JSX, or (b) placed but
> conditionally hidden, or (c) placed but erroring/returning null.
```bash
# Where is the dashboard page + the EnhancedDashboard component?
grep -rln "EnhancedDashboard\|dashboard-sov-strip\|DashboardSovStrip\|SovStrip" app/ components/ --include=*.tsx | head
# Is dashboard-sov-strip actually rendered (imported AND used in JSX) in the dashboard?
grep -rn "dashboard-sov-strip\|DashboardSovStrip\|SovStrip" app/\(auth\)/dashboard/ app/dashboard/ components/domain/dashboard/ --include=*.tsx
cat components/domain/visibility/dashboard-sov-strip.tsx 2>/dev/null | head -40   # its props + any early-return/guard
```
Report which case: (a) not mounted, (b) hidden by a condition, (c) returns null / errors — before fixing.

---

## THE FIX — mount the SoV strip on the dashboard per §6U.5
Add/enable the `dashboard-sov-strip` in the EnhancedDashboard (the S2 dashboard shell) so it renders. Per §6U.5:
- **Placement:** on the dashboard built in S2. Keep the S2 base shell + Work Completed card. (Out of scope: S9
  Autopilot tracker, Health Check banner — do NOT add those.) Place the SoV strip in a sensible spot (e.g. between
  the stat cards and Recent audits, or below Recent audits — a full-width strip).
- **Content:** the brand's current SoV % vs top competitors (the compact bar / sov visual), **sourced from
  `share_of_voice_snapshots`**. Reuse the SoV visual from the hub / the `dashboard-sov-strip` component (its
  aggregation + keys are already fixed).
- **`unit="%"`, `tabular-nums`** on the numerics.
- **STATES (all required):**
  - loading: strip skeleton,
  - **empty (no SoV yet): "Run an audit to see share of voice"** (graceful — like the hub's empty states),
  - error: boundary.
- **RESPONSIVE:** strip full-width; competitor bars wrap on `<sm`.
- **Brand scoping:** the dashboard has an active brand (the brand switcher). The strip shows THAT brand's SoV
  (Bondi Plumbing here). Ensure it reads the active brand's `share_of_voice_snapshots` (scoped to the latest
  audit, consistent with how the hub/fan-out now scope — avoid stacking multiple audits' rows).

## If the cause is (b) hidden-by-condition or (c) returns-null
- (b): fix/relax the condition so the strip shows when SoV data exists (and shows the empty state otherwise, not
  nothing).
- (c): fix whatever makes it return null / throw (e.g. a prop it never receives, or an early-return on a shape it
  isn't getting). It should render data OR the empty state, never silently nothing.

## INVARIANTS
- Reuse the existing `dashboard-sov-strip.tsx` (already key/aggregation-fixed) — don't rebuild the SoV visual.
- Source from `share_of_voice_snapshots`, active brand, latest audit (consistent scoping with the hub — no
  multi-audit stacking / duplicate segments).
- Keep the S2 dashboard shell + Work Completed card; do NOT add out-of-scope S9 items.
- `unit="%"`, tabular-nums, the 3 states (loading/empty/error), responsive per §6U.5.
- Unique React keys (the strip fix already applied — keep it).
- Don't regress the 68/68 tests or the other dashboard cards.

## VERIFY — it RENDERS on screen (not just imported)
1. Load `/dashboard` (Bondi Plumbing active). The **SoV strip now VISIBLY renders** — a full-width strip showing
   Bondi's SoV (brand + competitor e.g. hipages, matching the hub donut — brand once, no 4× duplicates).
2. **States:** with SoV data → shows the strip; if a brand has no audits/SoV → shows "Run an audit to see share of
   voice" (test by checking a brand with no audit, if available); no console errors.
3. **No duplicate-key errors** on the dashboard (the key fix holds).
4. **Consistency:** the strip's SoV matches the hub's donut for the same brand (same aggregation, same latest-audit
   scope) — not a different/stale number.
5. Responsive: bars wrap on a narrow viewport.
6. 68/68 tests green; Work Completed card + stat cards + Recent audits unchanged.

## REPORT
- The cause found ((a) not mounted / (b) hidden / (c) null-return) + the fix applied.
- The strip now renders on `/dashboard` with real SoV data (brand + competitor, matching the hub), correct states,
  responsive.
- Confirm: reused the fixed component, sourced from share_of_voice_snapshots (active brand, latest audit),
  S2 shell intact, no out-of-scope additions, 68/68 green.

## NOTE
This is the softer form of the recurring "built but not rendering" pattern — the reachability audit checked for the
import/reference but not actual on-screen render, so it read as "wired" while being absent. Same lesson as the whole
manual pass: code present ≠ renders on screen. After this, every Sprint 3 surface renders correctly and the manual
pass is fully clean → ready for the automated test track (which should assert the FIXED behavior: brands.domain not
metadata.domain, engine aggregation, {location} substitution, latest-audit scoping, unique keys, CPR-01
degradation, and the dashboard strip rendering).
