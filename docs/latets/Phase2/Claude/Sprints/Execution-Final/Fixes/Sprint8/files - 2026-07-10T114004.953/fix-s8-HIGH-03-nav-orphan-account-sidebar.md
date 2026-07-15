# FIX S8-HIGH-03 — Nav-orphan: add Team / Audit Trail / Data Residency to the sidebar ACCOUNT section (canonical order), reconcile Webhooks

## Severity: HIGH (all 3 Sprint 8 governance screens unreachable except by typing the URL — 4th consecutive nav-orphan: S5 Trust, S6 Retrieval, S7 Discovery, now S8)

## What the diagnosis proved
`app/.../app-sidebar.tsx` → `ACCOUNT_ITEMS` (lines 32–35) has exactly 2 entries:
```
{ href: "/settings/webhooks", label: "Webhooks" }
{ href: "/settings/billing",  label: "View plans" }
```
All three S8 governance page files exist (`settings/team`, `settings/audit-trail`,
`settings/data-residency`) but NOTHING in `app/` or `components/` links to any of them — they are
reachable only by URL. No settings-tab layout exists. No settings-nav test guard exists (the S7
invariant script checks brand-detail layer routes, not org-level settings routes).

## Canon (verified across prototype + LLD + S8 prompt)
- **Prototype FIX17 `Phase2Sidebar` ACCOUNT section (lines 895–901)** is the sole nav authority
  (the LLD says nothing about settings-nav placement; the S8 prompt §4 lists the page files but
  gives no nav-wiring instruction). It specifies ACCOUNT = **exactly**, in this order:
  1. `Team`            (icon `Users`)   → `/settings/team`
  2. `Data residency`  (icon `Globe`)   → `/settings/data-residency`
  3. `View plans`      (icon `Award`)   → `/settings/billing`
  Prototype line 856 restates the contract in prose: "ACCOUNT section: Team, Data Residency, View plans."
- **`audit-trail` is a canon gap:** the S8 prompt §6U.3 builds `settings/audit-trail`, but the
  prototype has NO audit-trail screen and NO nav entry for it (grep = 0). So there is no prototype
  line dictating where it links. RESOLUTION (this fix): place it in ACCOUNT with the other two
  governance screens — it is the third governance settings screen and belongs beside Team + Data
  residency. (Flagged to Sri as an LLD/prototype gap: FIX17 should add an audit-trail entry to the
  ACCOUNT section so future nav work inherits it.)
- **`Webhooks` is not in canon's nav** (grep = 0 in both prototype and LLD) — a Phase-1 surface the
  build added on its own. It is not wrong to keep a working link; do NOT delete it (removing a live
  link is a regression). Keep it, but position per the order below. (Flagged: canon should formally
  place Webhooks in ACCOUNT if it is to stay.)

## Task

### Step 1 — Confirm the exact file + array + icon-import style before editing
```bash
cd c:/startup/VisibleAU/src
grep -Rn "ACCOUNT_ITEMS" app/ components/ | grep -v test
# open the sidebar and see how items are shaped + how icons are imported/rendered:
sed -n '1,80p' <the app-sidebar.tsx path from the grep>
```
Match the EXISTING item shape exactly (the diagnosis shows `{ href, label }`; if the array also
carries an `icon` field, include the canonical icons: Team=Users, Audit Trail=FileClock or the
project's existing "log/history" icon, Data residency=Globe — reuse whatever lucide-react icons
the sidebar already imports; do NOT introduce an unused import that breaks the build).

### Step 2 — Rewrite ACCOUNT_ITEMS to the canonical set + order
Final ACCOUNT section (governance screens first in prototype order, then the existing links):
```
1. Team           → /settings/team
2. Audit Trail    → /settings/audit-trail
3. Data residency → /settings/data-residency
4. Webhooks       → /settings/webhooks        (kept — not canonical but live; do not delete)
5. View plans     → /settings/billing
```
Rationale for order: the prototype puts Team → Data residency → View plans; audit-trail slots with
its sibling governance screens (after Team, before Data residency keeps the two DB-transparency
screens — audit-trail + data-residency — adjacent, OR place audit-trail directly after Team and
data-residency next; the exact intra-governance order is not canon-pinned, but all three MUST
precede Webhooks/View plans to match the prototype's governance-first grouping). Use:
Team → Audit Trail → Data residency → Webhooks → View plans.

Match label casing to the prototype: **"Team"**, **"Data residency"** (lowercase r, per prototype
line 898), **"Audit Trail"**. Keep "Webhooks" and "View plans" as-is.

### Step 3 — Active-state + a11y parity with the other nav items
The prototype sets active state = `background var(--bg-elevated)`, `border var(--border-default)`,
`aria-current="page"` (prototype line 857). Ensure the 3 new items get the SAME active-state and
`aria-current` handling the existing 2 items already have — do not hand-roll a different style.
No hex-alpha on CSS vars; token-driven only.

### Step 4 — Add a settings-nav regression guard (so this cannot silently recur — the S7 pattern)
The S7 grep guard asserts the BRAND-page nav references each layer route; it does NOT cover
org-level settings routes, which is why this orphan shipped. Add a check (extend the existing
invariant script, e.g. `scripts/qa/sprint8-invariants.sh`, or the repo-wide nav guard) asserting
the sidebar references all three:
```bash
grep -Rc "/settings/team" <app-sidebar path>            # ≥1
grep -Rc "/settings/audit-trail" <app-sidebar path>     # ≥1
grep -Rc "/settings/data-residency" <app-sidebar path>  # ≥1
```
Non-zero exit if any is 0. (This is the settings-level analogue of the brand-route nav guard.)

## Constraints
- Do NOT delete the Webhooks link (live screen; removing it regresses Phase-1 nav).
- Match the existing item object shape + icon-import convention exactly — an unused/renamed icon
  import is the "breaking-build" class. Verify the app compiles after the edit.
- Labels must match prototype casing ("Data residency", not "Data Residency" in the array label if
  the prototype uses lowercase r — confirm against prototype line 898 and follow it).
- Token-driven styling only; reuse the existing nav-item component/active-state; `aria-current="page"`.

## Report back (paste inline)
1. The before/after of the `ACCOUNT_ITEMS` array.
2. Confirmation the app compiles (no missing-icon ReferenceError).
3. The Step 4 guard output (all three routes → ≥1) + confirmation it's wired into the QA/nav guard.
4. A screenshot (or route load) showing the 3 new entries in the sidebar, and that clicking each
   reaches its screen (not a 404). — Sri will verify the render on the walk.
