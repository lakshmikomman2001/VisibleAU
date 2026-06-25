# VisibleAU — Fix client-portal UX gaps: brand-picker (not raw Brand ID) + agency-dashboard nav
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Two real UX defects on the Agency-tier Client Portals feature (Phase 1 Sprint 9). The backend works;
the UI is unfinished/placeholder.

## DEFECT 1 (primary) — "Create Invite" asks for a raw Brand ID via a browser prompt()
On `/agency/client-portals`, "Create Invite" opens a `window.prompt("Enter Brand ID to create invite
for:")` expecting the user to type a brand UUID. Agency users do NOT know brand UUIDs and have no way to
get one in the UI (the only way is querying the DB — unacceptable). The feature is effectively unusable
as built. FIX: replace the raw-ID prompt with a proper **brand selector** (pick a brand by NAME from the
agency's own brands; resolve the id internally).

## DEFECT 2 (related) — Agency Dashboard has no left-nav entry
The Agency Dashboard (`/agency`) is only reachable by accident via the top "All brands" dropdown. It
should have a clear entry in the left sidebar (visible for Agency-tier orgs). FIX: add an "Agency
Dashboard" (or "Agency") nav item, tier-gated to Agency.

## STEP 0 — Investigate (report before changing)
```bash
# The client-portals page + the Create Invite handler (find the prompt()):
find app -ipath "*client-portal*" -o -ipath "*agency*portal*" 2>/dev/null | grep -iE "\.tsx$"
grep -rniE "Enter Brand ID|window.prompt|prompt\(|Create Invite|createInvite|client-portal" app components lib 2>/dev/null | head -20
# How is the invite created server-side? (route + what it needs — brandId, expiry, token gen):
grep -rniE "client-portal|portal.*invite|createPortalInvite|portal_token|invite.*token|/api/.*portal" app/api lib 2>/dev/null | head
# How does the agency get its list of brands? (to populate the picker — reuse the existing query):
grep -rniE "brands.*organization|getBrands|listBrands|brand.*list|All brands" app/agency app lib 2>/dev/null | head
# The sidebar/nav component (for DEFECT 2):
find . -ipath "*nav*" -o -ipath "*sidebar*" 2>/dev/null | grep -iE "\.tsx$" | grep -v node_modules | head
grep -rniE "Overview|Brands|Vertical packs|Drift Alerts|Agency|tier.*agency|isAgency" app/components components 2>/dev/null | grep -iE "nav|sidebar|agency|tier" | head
# Prototype intent for both (so fixes match design):
grep -rniE "Create Invite|brand.*select|Client Portal|Agency Dashboard|Manage portals" 03-prototype/*.jsx 2>/dev/null | head
```
Report: the file with the prompt(), the invite-creation API + what params it needs, the existing
brand-list query to reuse, the nav component, and prototype intent for both fixes.

## STEP 1 — DEFECT 1 fix: replace prompt() with a brand selector
Replace the `window.prompt("Enter Brand ID...")` with a proper in-app selector:
- A dropdown/select (or a small modal with a searchable list) populated with **the agency's own brands
  by NAME** (reuse the existing brand-list query — the agency dashboard already loads these: Canva, XYZ
  Plumbing Bondi, etc.). Show brand name (+ domain for disambiguation, since there can be duplicates
  like two "Canva" entries).
- On selection, the component holds the brand's `id` internally and calls the existing create-invite
  API with that id. The USER never sees or types a UUID.
- Keep any other invite params the API needs (e.g. expiry) — surface them as sensible UI (e.g. an expiry
  dropdown) rather than more raw prompts. If expiry was also a prompt(), replace similarly.
- Match the app's existing component styling (Tailwind tokens, modal/select patterns used elsewhere) —
  no raw browser dialogs. Accessible (label, keyboard, focus) and mobile-responsive.
- Handle the empty/edge cases: if the agency has no brands, show a helpful message; if the selected
  brand already has an active invite, handle gracefully (reuse/replace or inform).

## STEP 2 — DEFECT 2 fix: add Agency Dashboard to the left nav
- Add a sidebar entry "Agency Dashboard" (match prototype label/placement) linking to `/agency`.
- **Tier-gate it to Agency** (and Agency Pro / Enterprise if they inherit agency features) — use the
  SAME tier-check pattern the codebase already uses elsewhere; confirm an Agency-tier org passes it.
  Do NOT show it for Free/Starter/Growth.
- Place it sensibly in the WORKSPACE section (near Overview/Brands) per the prototype.

## STEP 3 — Verify
- DEFECT 1: `grep -rn "window.prompt\|Enter Brand ID" app components` → should be GONE for this flow.
  Confirm the create-invite now uses a brand selector populated by the brand-list query.
- DEFECT 2: the nav renders an "Agency Dashboard" link for Agency-tier orgs (and NOT for non-agency).
- Typecheck clean.
- Operator runtime test (note for them): as the Agency org → left nav now shows "Agency Dashboard" →
  open it → Client Portals → "Create Invite" now shows a brand PICKER (names, e.g. Canva / XYZ Plumbing
  Bondi) → pick one → invite + token created → no UUID typing anywhere.

## STEP 4 — Report
- The prompt()-removal diff + the new brand-selector component/approach.
- The nav entry added + the tier-gate used.
- Confirmation no raw Brand ID entry remains; typecheck clean.
- Operator retry steps.

## Constraints
- NO raw browser prompt()/UUID entry for end users — brand selection is by NAME via a real UI control.
- Reuse the existing brand-list query + existing create-invite API (don't rebuild the backend; this is a
  UI/UX fix).
- Match existing component styling; accessible + mobile-responsive (project standard).
- Tier-gate the nav entry correctly (Agency+); confirm against the real tier-check pattern.
- Match prototype intent where it specifies placement/labels.
