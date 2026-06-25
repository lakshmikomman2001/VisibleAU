# VisibleAU — Fix: add "Copy link" action to client-portal invites (core function missing)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
On `/agency/client-portals`, an agency can create a portal invite (token shows truncated, e.g.
`EV8vIRoux4e9...`) but there is NO way to COPY the portal link to send to the client. The Actions column
only has "Revoke". The whole point of an invite is to share the link — so this is a core-function gap,
not cosmetic. Add a "Copy link" (and ideally a visible/copyable full URL).

## STEP 0 — Locate the invites table + row Actions
```bash
grep -rniE "client-portal|Client Portals|Revoke|invite.*token|portal.*invite|/portal/" app/agency components 2>/dev/null | head -20
# Find the row rendering (Token, Brand, Invitee, Status, Expires, Actions) and the Revoke action:
grep -rniE "Revoke|Actions|invite|token|/portal/" app/agency 2>/dev/null | head
# How is the portal URL formed? Is there a base-URL/env for it? (NEXT_PUBLIC_APP_URL or similar):
grep -rniE "NEXT_PUBLIC_APP_URL|APP_URL|origin|/portal/|portalUrl|baseUrl" app lib 2>/dev/null | head
```
Report: the row component, how the Revoke action is wired, and how to build the full portal URL
(`<base>/portal/<token>`) — find the existing app-URL env/util rather than hardcoding localhost.

## STEP 1 — Add a "Copy link" action
In the Actions column for each invite row, add a **"Copy link"** button/icon alongside Revoke that
copies the FULL portal URL to the clipboard:
- Build the URL as `<appBaseUrl>/portal/<token>` using the existing app-URL source (env/util found in
  STEP 0). Do NOT hardcode `http://localhost:3000` — use the same base the app uses elsewhere so it's
  correct in dev AND production.
- Use the Clipboard API (`navigator.clipboard.writeText(url)`), with a brief success affordance (e.g.
  toast or the button label flips to "Copied!" for ~2s). Handle the clipboard-unavailable case
  gracefully (e.g. select-on-click fallback).
- The token in the table is truncated for display — that's fine to keep, BUT the Copy action must copy
  the FULL token URL, not the truncated display string. Make sure the full token is available to the
  row (from the invite record), not just the truncated text.

## STEP 2 (recommended) — make the URL visible/inspectable too
Optionally improve discoverability: allow the agency to SEE the full link (e.g. a "Copy link" is enough,
but consider a small "view" affordance or making the token cell show a copyable URL on hover/click).
Minimum viable = a working "Copy link" button. Don't over-build.

## STEP 3 — Verify
- Operator: Agency Dashboard → Client Portals → on an invite row, click "Copy link" → paste somewhere →
  it's the full `<base>/portal/<token>` URL with the COMPLETE token (not truncated) → opening it in
  incognito loads that brand's portal.
- Confirm the base URL is correct (uses the app-URL env/util, not hardcoded localhost).
- Typecheck clean.

## STEP 4 — Report
- The Copy link action added (component + how the URL is built — which app-URL source).
- Confirmation it copies the FULL token URL (not the truncated display value).
- Clipboard fallback handling.
- Operator test steps.

## Constraints
- Copy the FULL portal URL with the complete token — never the truncated display string.
- Use the existing app base-URL env/util (works in dev + prod), not a hardcoded localhost.
- Match existing button/icon styling + accessibility; success feedback on copy.
- Keep Revoke working; this ADDS a Copy link action alongside it.
