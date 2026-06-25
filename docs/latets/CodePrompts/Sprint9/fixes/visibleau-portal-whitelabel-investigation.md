# VisibleAU — Investigation ONLY: why does the client portal show "VisibleAU" instead of agency white-label branding?
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**Read-only. Change nothing. Report findings.**

## Symptom
The client portal at `/client-portal/[token]` renders correctly (right brand, real data, read-only, no
login) BUT the header shows **"VisibleAU — Client Portal"** with VisibleAU branding. The feature's stated
promise (on the agency dashboard) is: "Each client gets a read-only portal showing their brand's data —
YOUR branding, no VisibleAU." So the portal should show the AGENCY's white-label branding (logo / name /
colors), not VisibleAU's. Determine WHY it's showing VisibleAU and which of these is true:
- (A) White-label branding is NOT implemented on the portal (it always hardcodes VisibleAU).
- (B) It IS implemented but the agency hasn't CONFIGURED branding → portal falls back to VisibleAU default
  (expected behaviour; just needs the agency to set branding somewhere).
- (C) It IS implemented + configured but NOT being APPLIED to the portal view (a wiring bug).

## STEP 0 — The portal view: what does it render for branding?
```bash
# Find the portal page + its header/branding:
find app -ipath "*client-portal*" -name "page.tsx" 2>/dev/null
grep -rniE "VisibleAU|Client Portal|logo|brandingName|whiteLabel|white_label|agencyBranding|agency.*logo" app/*client-portal* "app/(public)" app 2>/dev/null | grep -iE "portal|brand|logo|white" | head -30
# Open the portal page and see where "VisibleAU" / the header comes from — hardcoded string, or pulled
# from agency/org branding settings?
```
Report: is the "VisibleAU" header a HARDCODED string in the portal page, or does it read from some
branding config (org/agency settings)? Quote the relevant lines.

## STEP 1 — Does white-label branding config EXIST anywhere?
```bash
# Schema: any white-label / branding columns on organizations or a dedicated branding table?
grep -rniE "white_label|whiteLabel|branding|logo_url|logoUrl|brand_color|brandColor|company_name|agency_name|custom.*logo|primary_color" db/schema/*.ts 2>/dev/null | head -20
# A branding settings PAGE/UI (Sprint 9 referenced a "branding preview")?
grep -rniE "branding|white.?label|logo.*upload|brandingPreview|custom branding|agency branding" app components 2>/dev/null | grep -iE "page|settings|branding|preview" | head
find app -ipath "*brand*setting*" -o -ipath "*white*label*" -o -ipath "*branding*" 2>/dev/null | grep -iE "\.tsx$" | head
# An API/action to save branding?
grep -rniE "updateBranding|saveBranding|/api/.*branding|branding.*update|white_label" app/api lib 2>/dev/null | head
```
Report: Is there a branding settings surface (schema columns + UI + save action)? If yes, where, and
what fields (logo, name, colors)?

## STEP 2 — Is branding APPLIED to the portal? (the wiring)
```bash
# Does the portal page/loader fetch the agency's branding to render it?
grep -rniE "getBranding|branding|whiteLabel|logo|agency.*name|org.*branding" app/*client-portal* 2>/dev/null | head
# How does the portal resolve token -> brand -> agency/org? Does it then load that org's branding?
grep -rniE "token|invite|portal.*brand|brand.*org|organization" app/*client-portal* 2>/dev/null | head -20
```
Report: does the portal loader resolve the owning agency/org and fetch its branding? Or does it only
load the brand's audit data and render a fixed VisibleAU header?

## STEP 3 — White-label PDF reference (related feature, may share branding source)
Sprint 9 has a white-label PDF builder. It likely already has a branding source/config the portal SHOULD
reuse. Check:
```bash
grep -rniE "white.?label|branding|logo|pdf.*brand|brand.*pdf" lib app 2>/dev/null | grep -iE "pdf|white|brand|logo" | head
```
Report: does a white-label branding mechanism already exist for PDFs that the portal could/should reuse?
(Consistency: both client-facing surfaces should use the same agency branding.)

## VERDICT — state clearly which case (A/B/C):
- (A) NOT implemented on portal — header is hardcoded "VisibleAU"; no branding read. → Fix = build
  white-label into the portal (read agency branding, render logo/name/colors, fall back to VisibleAU
  only if none set). Note whether a branding CONFIG exists to read from (if not, that's needed too).
- (B) Implemented but NOT configured — portal reads branding config but the agency hasn't set one, so it
  correctly defaults to VisibleAU. → "Fix" = the operator just needs to configure agency branding at
  <location>; tell them where. (Confirm by checking if any branding row exists for this org.)
- (C) Implemented + configured but NOT applied — branding exists/set but the portal doesn't use it. →
  Fix = wire the portal loader to fetch + render the agency branding.

Also report:
- WHERE agency branding is (or should be) configured (page path), and the schema fields.
- Whether the white-label PDF already has a branding source the portal should share (for consistency).
- Whether the "VisibleAU" header is a hardcoded string (quote the line) or a config-driven default.

## Constraints
- Read-only. NO changes. Report file paths + line numbers + quoted lines for the branding source.
- Do not print real tokens.
