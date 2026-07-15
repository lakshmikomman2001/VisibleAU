# VisibleAU Fix — Wizard suburb state selector (stop hardcoding NSW:)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: the brand wizard Step 3 (Locations & competitors) at `app/(auth)/brands/wizard/page.tsx`
(+ any suburb-input subcomponent). Frontend only — no schema, no API, no regex change.

---

## The bug (real data-integrity issue — confirmed)
Step 3 lets the user type a bare suburb (e.g. "Fitzroy") and the wizard prefixes a **hardcoded
`NSW:`** to satisfy the `primaryRegions` `STATE:Suburb` format. The `POST /api/brands` regex
(`/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`) only checks the SHAPE, not whether the state is correct —
so `NSW:Fitzroy` passes validation and is stored, even though Fitzroy is in **Victoria**.

Why this matters: `primaryRegions` drives suburb-level tracking, which is a CORE product pillar
("suburb-level tracking, not just metro"). Storing the wrong state for every non-NSW brand is silent,
invisible-until-a-customer-notices, factually-wrong location data — exactly the kind of data-integrity
bug a trust product must not ship. Canon's own examples span states (`NSW:Bondi`, `VIC:Fitzroy`,
`QLD:Brisbane CBD`), confirming the state is genuinely per-suburb and cannot be defaulted.

**Important:** `organizations.region` / `brands.region` is the COUNTRY enum (`'au'`), NOT a state —
so there is no org-level state to fall back on. The user MUST be able to choose the state per suburb.

## The fix (operator decision)
Add a **state dropdown next to the suburb input.** The user picks a state, types a suburb, clicks
Add → the wizard stores `${STATE}:${suburb}` (e.g. `VIC:Fitzroy`). Default the dropdown to a sensible
value but never silently apply it without the user being able to change it.

---

## STEP 0 — Investigate (report, then proceed)
```bash
grep -nE "NSW:|primaryRegions|primary_regions|suburb|Add\b|setSuburbs|regions" app/\(auth\)/brands/wizard/page.tsx
grep -rnE "NSW:|primaryRegions" components/domain | head
```
Report: the exact line(s) where `NSW:` is prepended, how suburbs are held in state (array of strings?
objects?), and how they're submitted to `POST /api/brands`. Quote the current Add handler.

---

## STEP 1 — Add an AU state/territory constant
Create (or add to an existing AU constants file, e.g. `lib/constants/au.ts`):
```typescript
// Australian states & territories — the valid STATE prefix for primaryRegions ('STATE:Suburb').
// All match the API regex prefix [A-Z]{2,4}.
export const AU_STATES = [
  { code: 'NSW', label: 'New South Wales' },
  { code: 'VIC', label: 'Victoria' },
  { code: 'QLD', label: 'Queensland' },
  { code: 'WA',  label: 'Western Australia' },
  { code: 'SA',  label: 'South Australia' },
  { code: 'TAS', label: 'Tasmania' },
  { code: 'ACT', label: 'Australian Capital Territory' },
  { code: 'NT',  label: 'Northern Territory' },
] as const;
export type AuStateCode = (typeof AU_STATES)[number]['code'];
```

---

## STEP 2 — Step 3 UI: state dropdown + suburb input → `STATE:Suburb`
Rework the "Primary suburbs (up to 3)" control:
- A **state `<select>`** (the repo's Select primitive if it has one, else a tokened native select)
  populated from `AU_STATES`, showing the label, valued by `code`. Default to **NSW** (most common),
  but it is a real, changeable control — not a hidden constant.
- The existing **suburb text input** beside it, placeholder e.g. "e.g. Bondi".
- **Add** button → push `` `${selectedState}:${suburbInput.trim()}` `` into the suburbs array
  (e.g. `VIC:Fitzroy`). Then clear the suburb input (keep the state selection for the next add — a
  user adding several suburbs in one state shouldn't re-pick each time).
- **Validate before adding** (client-side, mirror the API regex so bad input can't be queued):
  - suburb non-empty after trim;
  - the combined value matches `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/` (i.e. suburb starts with a
    letter, ≤49 chars, letters/spaces only — reject digits/punctuation with a small inline message
    "Letters and spaces only");
  - block duplicates (same `STATE:Suburb` already in the list).
- **Chips:** render each as the existing removable Badge, but display it readably — e.g.
  **"Bondi, NSW"** (suburb + state) rather than the raw "NSW:Bondi", while STORING `NSW:Bondi`. The X
  removes it (keep the `aria-label="Remove {suburb}, {state}"` already added).
- **Cap of 3** stays enforced (keep the "Maximum 3 suburbs reached" hint + disabled Add at 3).
- The array submitted to `POST /api/brands` is the `STATE:Suburb` strings — unchanged contract, just
  now with the CORRECT state.

Remove the hardcoded `NSW:` prepend entirely — the state now comes from the dropdown.

---

## Constraints
- Frontend only. Do NOT change the `primaryRegions` column, the Zod regex, or the API.
- The stored value is `STATE:Suburb` with the USER-SELECTED state. No hardcoded state anywhere in the
  submit path.
- Reuse existing UI primitives + tokens; mobile-responsive (state select + input + Add should stack
  sanely on narrow screens). Accessible: the select has a label/aria-label; chips' X is a real button.
- TypeScript strict, no `any`. No new deps.
- Do NOT add suburb autocomplete (a future enhancement) — dropdown + free-text suburb is the scope.

---

## Verification (run + report)
1. `pnpm typecheck` + `pnpm lint` clean.
2. No hardcoded prefix remains:
   ```bash
   grep -rnE "['\"]NSW:['\"]|\`NSW:|: ?'NSW'" app/\(auth\)/brands/wizard components   # → no hardcoded-prefix matches
   ```
3. Manual (dev, mock, a Free org), the key test — a **non-NSW** brand:
   - Step 3: set state to **VIC**, type **Fitzroy**, Add → chip shows "Fitzroy, VIC".
   - Add **QLD / Brisbane** and **NSW / Bondi** → three chips, mixed states; 4th Add is blocked.
   - Try adding "Bondi 2026" or "St. Kilda" (digits/punctuation) → rejected inline.
   - Finish creating the brand, then check storage:
     ```sql
     SELECT name, primary_regions FROM brands ORDER BY created_at DESC LIMIT 1;
     -- expect e.g. {"VIC:Fitzroy","QLD:Brisbane","NSW:Bondi"} — CORRECT states, not all NSW:
     ```
   - Confirm `primary_regions` contains the **user-selected** states (a VIC suburb stored as
     `VIC:...`, NOT `NSW:...`). THIS is the proof the bug is fixed.
4. Regression: a pure-NSW brand still works (state left at NSW default → `NSW:Bondi`).

Report: STEP 0 findings (the old hardcoded line), files changed, and the manual result — specifically
the `primary_regions` SQL output showing mixed/correct states for a non-NSW brand.
