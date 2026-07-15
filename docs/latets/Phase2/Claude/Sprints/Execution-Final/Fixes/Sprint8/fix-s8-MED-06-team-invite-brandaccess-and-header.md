# FIX S8-MED-06 — Team screen: add the brand_access picker to the invite form (F11) + complete the header subtitle (F12)

## Severity: F11 MEDIUM (functional — cannot invite a brand-restricted member; S8b-01 gate has nothing to enforce for invitees) · F12 LOW (spec deviation — header subtitle under-built)

## Canon (verified across prototype + LLD + S8 prompt)
- **S8 prompt §6U.2:** `invite-form.tsx (email + role + brand_access picker)` — the invite form MUST
  have a brand-access selector, not just email + role.
- **LLD 8682 (invite flow step 1):** `POST /api/organizations/[id]/members/invite` with
  `{ userId, role, brandAccess }` — brandAccess is part of the invite payload.
- **LLD 8675 / 8635–8646 (S8b-01):** `brand_access` (null = all brands; or `[brandId,…]`) is the
  ONLY brand-isolation layer within an org; `assertBrandAccess` enforces it. If the invite UI can
  only ever send null, no invited member can be brand-restricted and the enforcement gate is inert
  for invitees.
- **Prototype line 2873 (header subtitle):** `"3 members · 1 pending invite · Agency plan (5 seats)"`
  — a 3-part summary: member count · pending-invite count · plan name + seat count.

## What's wrong on the rendered screen
1. **F11:** the invite form shows only **Email + Role** (+ Invite button). No brand_access picker.
   Every invite therefore implies all-brand access (null).
2. **F12:** the header subtitle shows only **"1 member"** — missing the pending-invite count and the
   plan + seat-count ("Agency plan (N seats)").

## Task

### PART 1 — F11: add the brand_access picker to the invite form

#### 1a — Inspect the current invite form + the members/invite API contract
```bash
cd c:/startup/VisibleAU/src
sed -n '1,200p' "app/(auth)/settings/team/page.tsx" | sed -n '150,200p'   # the invite-form region
cat components/domain/governance/invite-form.tsx 2>/dev/null
sed -n '1,80p' "app/api/organizations/[orgId]/members/invite/route.ts"
# Confirm the invite route accepts brandAccess and how it expects it (null | string[]):
grep -n "brandAccess\|brand_access\|z\.\|schema\|parse" "app/api/organizations/[orgId]/members/invite/route.ts"
# How does the app list the org's brands (to populate the picker)?
grep -Rn "GET /api/brands\|/api/brands\b\|brands.*list\|useBrands" app/ components/ lib/ | grep -v test | head
```
REPORT the current form fields + whether the invite API already accepts `brandAccess` (it should,
per LLD 8682 — if it does NOT, that is an additional finding: the API is missing the param).

#### 1b — Add the brand_access picker
In the invite form (`components/domain/governance/invite-form.tsx` and/or the inline form in
`settings/team/page.tsx`):
- Add a **brand-access control** with two modes matching canon's `null | string[]` model:
  - **"All brands"** (default) → sends `brandAccess: null`.
  - **"Specific brands"** → reveals a multi-select of the org's brands → sends
    `brandAccess: [brandId, …]`.
- Populate the brand list from the org's brands (the existing brands API / list the app already
  uses — do NOT invent a new endpoint if one exists).
- Wire the selected value into the invite POST body as `brandAccess` alongside `email`/`role`.
- STATES: if the org has only one brand (or the picker list is empty), still allow "All brands";
  don't crash on an empty brand list.
- Styling: token-driven, matches the existing form controls (same input/select styling as the
  email + role fields); no hex-alpha on CSS vars; single-column on `<md` (RESPONSIVE per §6U.2).
- a11y: the picker has a label ("Brand access") and is keyboard-operable.

#### 1c — If the invite API does NOT accept brandAccess, add it
If 1a showed the route ignores/omits `brandAccess`: extend the Zod schema + the insert so the
invited `org_members` row stores `brand_access` = the submitted value (null or string[]). The
column already exists (§5.2). Keep null = all brands.

### PART 2 — F12: complete the header subtitle

In `settings/team/page.tsx` header (the subtitle currently rendering "N member(s)"):
- Render the 3-part summary matching prototype line 2873:
  **`{memberCount} member{s} · {pendingCount} pending invite{s} · {planName} ({seatLimit} seats)`**
- `memberCount` = active members length; `pendingCount` = pending invites length (accepted_at NULL
  rows) — pluralize correctly (0/1/many); omit the pending clause if you prefer when 0, but the
  prototype shows it, so prefer showing "0 pending invites" or the count.
- `planName` + `seatLimit`: derive from the org's tier (subscriptions.tier — NEVER
  organizations.tier). Map tier → seat limit from canon's tier/seat model. Find the existing seat
  or plan constant:
  ```bash
  grep -Rn "seats\|seatLimit\|SEAT\|max.*members\|team.*limit\|Agency.*5\|plan.*seat" lib/ app/ | grep -v test | head
  ```
  If a canonical seat-per-tier map exists, use it. If NONE exists, REPORT that (the seat limit is
  unspecified in code) rather than hardcoding — Sri decides the seat numbers; do not invent a limit
  silently. (Prototype shows Agency = 5 seats as the reference.)

### PART 3 — (Note, do not implement here) seat-limit gating
If the seat limit is knowable, a follow-up may gate the Invite button when members+pending ≥ limit.
Do NOT build that in this prompt — just surface, in the report, whether the seat limit is available
to support it later.

## Verify
```bash
grep -n "brandAccess\|brand_access\|Brand access\|Specific brands\|All brands" \
  "app/(auth)/settings/team/page.tsx" components/domain/governance/invite-form.tsx
grep -n "pending\|seats\|member" "app/(auth)/settings/team/page.tsx" | head
```
On screen (as owner): the invite form shows a Brand access control (All brands / Specific brands →
brand multi-select); the header subtitle shows "1 member · 0 pending invites · Agency plan (5 seats)"
(or the real values).

## Constraints
- `brand_access` model is exactly `null | string[]` (null = all brands) — do not introduce a third
  representation.
- Tier/seats from `subscriptions.tier`, never `organizations.tier`.
- Do NOT hardcode a seat limit if canon has none — report instead.
- Token-driven styling; no hex-alpha; RESPONSIVE single-column `<md`; a11y labels.
- Do not touch the members list API or the owner-seed (those are correct/closed).

## Report back (paste inline)
1. F11: the invite-form before/after; whether the invite API already accepted brandAccess (or was
   extended); how the brand list is sourced; a screenshot/confirmation the picker renders.
2. F12: the subtitle before/after; whether a canonical seat-per-tier map exists (and what it is) or
   whether the seat limit had to be flagged as unspecified.
