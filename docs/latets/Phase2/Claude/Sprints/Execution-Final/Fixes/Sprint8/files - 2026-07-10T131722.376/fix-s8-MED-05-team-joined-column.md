# FIX S8-MED-05 — Add the missing "Joined" column to the team members table (F8)

## Severity: MEDIUM (members table renders 4 columns; canon requires 5 — "Joined" dropped)

## What the diagnosis proved
The Team members table is a **4-column** grid missing the "Joined" column:
- `app/(auth)/settings/team/page.tsx:112–122` — header grid
  `gridTemplateColumns: "2fr 1fr 1fr 80px"` with headers **Member · Role · Brand access · Actions**.
- `components/domain/governance/member-row.tsx:40` — the row grid uses the same 4-column template.
Canon (prototype `TeamManagement` line 2905) requires a **5-column** grid:
`Member · Role · Brand access · Joined · Actions`, template `2fr 1fr 1fr 100px 80px`.
The data is already available — the members API returns `acceptedAt`
(`app/api/organizations/[orgId]/members/route.ts:48`) — it simply isn't rendered.

## Task

### Step 1 — Add the Joined header column
In `app/(auth)/settings/team/page.tsx` header (lines ~112–122):
- Change `gridTemplateColumns` from `"2fr 1fr 1fr 80px"` to **`"2fr 1fr 1fr 100px 80px"`**
  (match the prototype's 5-col template).
- Insert a **`Joined`** header cell between `Brand access` and `Actions`.

### Step 2 — Render the Joined value in MemberRow
In `components/domain/governance/member-row.tsx`:
- Update its grid template to the same 5-col `"2fr 1fr 1fr 100px 80px"`.
- Insert a Joined cell between Brand access and Actions rendering the member's `acceptedAt`
  (the join date), formatted like the prototype (e.g. `1 Mar 2026`). Use the project's existing
  date-format util if one exists; otherwise a simple `toLocaleDateString` in the app's locale.
- Style to match the prototype's Joined cell: `text-[12px]`, `color: var(--text-tertiary)`,
  `tabular-nums` for the date. No hex-alpha on CSS vars.
- If `acceptedAt` is null (a pending/never-accepted row that still appears here), render a graceful
  placeholder (e.g. "—") rather than "Invalid Date".

### Step 3 — Confirm the two grids stay in lockstep
The header grid (page) and the row grid (MemberRow) MUST use the identical template string, or
columns misalign. Verify both are `"2fr 1fr 1fr 100px 80px"`.

## Verify
```bash
cd c:/startup/VisibleAU/src
grep -n "gridTemplateColumns\|Joined\|acceptedAt\|Brand access\|Actions" \
  "app/(auth)/settings/team/page.tsx" components/domain/governance/member-row.tsx
```
EXPECT: both files show the 5-col template; "Joined" header present; MemberRow renders `acceptedAt`.
Then on screen (after HIGH-04 seeds the owner row so the table is non-empty): the owner row shows a
Joined date in a 5th column, columns aligned.

## Constraints
- Token-driven styling only; `tabular-nums` on the date; no hex-alpha on CSS vars.
- Do NOT change the other 4 columns or the members API. This is purely the missing 5th column.
- Header and row grid templates must match exactly.
- Depends on HIGH-04 only for a non-empty table to eyeball; the code change itself is independent
  and can be applied in parallel.

## Report back (paste inline)
1. The before/after grid template + the added Joined header/cell.
2. The Step-Verify grep output showing both files at the 5-col template.
3. (After HIGH-04) a note that the owner row shows a Joined date, columns aligned — Sri confirms on
   the walk.
