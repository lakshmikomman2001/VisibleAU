# VisibleAU — Fix: wire agency white-label branding into the client portal (mirror the PDF export)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
The white-label branding system EXISTS and works (schema `agencyBrandAssets`, settings page
`/agency/branding`, save API, AND the PDF export already consumes it correctly). The client portal is the
only client-facing surface NOT wired to it — it hardcodes "VisibleAU". Fix by making the portal fetch +
render agency branding using the SAME pattern the PDF export already uses.

## Canonical model to mirror (already correct — copy this pattern)
`app/api/audits/[auditId]/export/route.ts:64-84` — does the 2-tier branding fetch (brand-specific first,
org-level fallback) from `agencyBrandAssets`, then converts via `assetToTheme()`. The portal should do
the SAME fetch + the SAME theme conversion so both client-facing surfaces are consistent.

Branding fields (from `db/schema/agency-brand-assets.ts`): agencyName, logoUrl, primaryColor,
secondaryColor, accentColor, footerText, contactLine, contactEmail.

## STEP 0 — Confirm the three touch points (report)
```bash
sed -n '1,40p' "app/client-portal/layout.tsx"            # the hardcoded "VisibleAU" header (~line 11)
sed -n '1,80p' "app/client-portal/[inviteToken]/page.tsx" # resolves token->invite; add branding fetch
sed -n '1,60p' "app/api/client-portal/verify/[token]/route.ts" # returns brandId/brandName/organizationId
sed -n '60,90p' "app/api/audits/[auditId]/export/route.ts"     # THE PATTERN to mirror (2-tier + assetToTheme)
grep -rniE "assetToTheme|agencyBrandAssets" lib app 2>/dev/null | head
```
Report: the exact 2-tier query + `assetToTheme()` usage in the PDF export, and where in the portal
page/layout the branding needs to flow.

## STEP 1 — Fetch branding in the portal (reuse the PDF's 2-tier lookup)
In the portal data path (either the page `app/client-portal/[inviteToken]/page.tsx` after it resolves
token → invite → organizationId, OR extend `verify/[token]/route.ts` to include branding — choose the
one that matches how the page already gets its data):
- After resolving `organizationId` (and `brandId`), fetch `agencyBrandAssets` with the SAME 2-tier
  lookup the PDF export uses: **brand-specific first, org-level fallback**. Reuse the existing query/util
  if the PDF export factored one out; if not, mirror its logic exactly (don't invent a different lookup).
- Convert via the SAME `assetToTheme()` (or equivalent) the PDF export uses, so colors/logo/name are
  applied consistently.
- If NO branding row exists for the org → return null/defaults so the portal can fall back to "VisibleAU"
  (preserve current behaviour when unconfigured).

Make the resolved branding (agencyName, logoUrl, colors, footerText, contactLine, contactEmail)
available to the portal layout/page for rendering.

## STEP 2 — Render branding in the portal layout (replace the hardcoded header)
In `app/client-portal/layout.tsx` (and wherever the portal renders header/footer):
- Replace the hardcoded `<span ...>VisibleAU</span>` (~line 11) with the agency branding:
  - If `logoUrl` set → render the agency logo; else render `agencyName` text.
  - Apply `primaryColor`/`secondaryColor`/`accentColor` to the themed elements (header, score accents,
    etc.) via the same theme object the PDF uses, so the portal visually matches the agency's brand.
  - Use `footerText` / `contactLine` / `contactEmail` in the footer if present (the portal already has a
    read-only footer — incorporate agency contact/footer there).
- **Fallback:** if no branding configured (null), keep the current "VisibleAU" default so nothing breaks
  for orgs that haven't set branding. (This is the (B) path — unconfigured orgs still get a sane default.)
- Note: the portal layout may be a server/client boundary — pass branding from the page (which fetches
  it) into the layout/components via props/context as the existing structure requires. Don't fetch in a
  way that breaks the public (no-auth) nature of the portal — branding fetch must work WITHOUT a logged-in
  session (it's keyed off the invite's org, not the viewer).

## STEP 3 — Verify
Operator runtime test:
1. Ensure the agency has branding set: go to `/agency/branding`, set agencyName (e.g. "Acme Digital"),
   a primaryColor, optionally a logoUrl, save.
2. Open the client portal link in incognito (the Employment Hero invite).
3. EXPECTED: the portal header now shows the AGENCY's name/logo (e.g. "Acme Digital"), NOT "VisibleAU";
   colors reflect the agency's branding; footer shows agency contact if set. The brand data (Employment
   Hero, scores) is unchanged.
4. Negative/fallback: an org with NO branding configured → portal still shows "VisibleAU" default (no
   crash/empty).
5. Consistency check: the portal branding should match what the white-label PDF export produces for the
   same org (same name/logo/colors).
Also: typecheck clean.

## STEP 4 — Report
- Where branding is fetched in the portal (page vs verify route) + confirmation it mirrors the PDF's
  2-tier lookup + assetToTheme().
- The layout change (hardcoded "VisibleAU" → branding with fallback).
- Confirmation the fetch works for the PUBLIC (no-login) portal (keyed off invite org, not viewer).
- Runtime test result: agency branding renders; unconfigured org falls back to VisibleAU.

## Constraints
- MIRROR the existing PDF export branding pattern (2-tier brand→org fallback + assetToTheme()); reuse its
  util if one exists. Do NOT invent a different branding lookup — consistency across client-facing
  surfaces is required.
- Preserve the public/no-login nature of the portal — branding must load without an authenticated session
  (it's resolved from the invite's organization).
- Fall back to "VisibleAU" default ONLY when the org has no branding configured (don't remove the
  fallback).
- Don't change the brand audit data / read-only nature of the portal — this is branding only.
- Match accessibility/contrast (the agency's colors must still yield readable text; if a chosen color
  would be unreadable, ensure sensible contrast handling).
