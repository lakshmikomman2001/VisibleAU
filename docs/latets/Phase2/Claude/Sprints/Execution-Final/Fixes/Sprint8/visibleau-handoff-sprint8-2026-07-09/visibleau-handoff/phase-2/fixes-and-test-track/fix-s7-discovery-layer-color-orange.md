# Claude Code — FIX: Discovery hub renders the WRONG layer color (ORANGE instead of CYAN)

The Discovery hub (/brands/{id}/discovery) renders its "Discovery" badge + "View →" links + accents in ORANGE — but
canon (prototype 249-250) is explicit: **the Discovery layer is CYAN** (`--layer-discovery: #06b6d4` dark / `#0e7490`
light — the "exploration" hue). Every layer has its own color (Retrieval purple, Trust amber #f59e0b, Discovery cyan);
the orange on screen is almost certainly the default `--accent-primary` leaking through instead of `--layer-discovery`.
The build report CLAIMED it added "--layer-discovery tokens (dark/light) + discovery in LayerBadge" — so this is a
green-claim-wrong-on-screen: either the token isn't actually defined, or the component isn't using it. Diagnose which,
then fix.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465.

## Canon (prototype FIX17)
- `--layer-discovery: #06b6d4` (dark, proto 250) / `#0e7490` (light, proto 327) + `--layer-discovery-soft`.
- LayerBadge map (proto 545): `discovery: { color: 'var(--layer-discovery)', soft: 'var(--layer-discovery-soft)', icon:
  Compass }`.
- DiscoveryHub uses `var(--layer-discovery)` for: the Compass icon (proto 3005/3031), the LayerBadge (3007), the tile
  icon bg `--layer-discovery-soft` (3030), and the Run/View button `background: var(--layer-discovery)` (3046).
- So the badge, the "View →" links, the Compass, and any accent on this hub should be CYAN, not orange.

## STEP 1 — DIAGNOSE: is the token missing (Cause A) or is the component using the wrong var (Cause B)?
```bash
# CAUSE A — is --layer-discovery actually DEFINED in globals.css, BOTH themes?
grep -n "layer-discovery" app/globals.css styles/*.css 2>/dev/null
# (Expect BOTH a dark-theme #06b6d4 and a light-theme #0e7490 definition. If MISSING or only one theme → Cause A.)

# CAUSE B — what color does the Discovery HUB component actually use for the badge + View links?
cat "app/(auth)/brands/[brandId]/discovery/page.tsx"
grep -n "accent-primary\|layer-discovery\|View\|badge\|LayerBadge\|color:\|background:" "app/(auth)/brands/[brandId]/discovery/page.tsx"
# Does LayerBadge have a discovery entry mapping to --layer-discovery?
grep -rn "discovery" components/**/*layer-badge* components/**/LayerBadge* 2>/dev/null
grep -rn "discovery:\|layer-discovery" components/ | grep -i badge
```
Report which cause it is:
- **Cause A** (token undefined / only one theme) → `var(--layer-discovery)` falls back to inherited orange → the fix is
  to ADD the token to globals.css (both themes).
- **Cause B** (token defined, but the hub component / View links / badge use `--accent-primary` or a hardcoded orange
  instead of `var(--layer-discovery)`) → the fix is to point them at `var(--layer-discovery)`.
- Could be BOTH (token missing AND component wrong). Report exactly what STEP 1 finds.

## STEP 2 — FIX (per the diagnosis):

### If Cause A (token missing/incomplete):
Add to globals.css, matching the prototype, in the SAME place the other layer tokens live (--layer-retrieval, etc.):
- Dark theme: `--layer-discovery: #06b6d4;` + `--layer-discovery-soft: rgba(6,182,212,0.12);`
- Light theme: `--layer-discovery: #0e7490;` + `--layer-discovery-soft: rgba(14,116,144,0.10);`
(Match how --layer-retrieval is defined for both themes — same block, same pattern.)

### If Cause B (component using wrong var):
In the Discovery hub component (and LayerBadge if its discovery entry is wrong), replace the orange/`--accent-primary`
with `var(--layer-discovery)` for: the "Discovery" LayerBadge, the "View →" link color, the Compass icon, and any tile
accent. Match how the RETRIEVAL hub component colors its badge/links (mirror the proven pattern — Retrieval renders its
purple correctly, so copy that wiring, swapping the layer).

### Verify LayerBadge is correct regardless:
Confirm LayerBadge's `discovery` entry maps `color → var(--layer-discovery)` (proto 545). If it's mapping to the wrong
token or missing, fix it — this is shared (every discovery badge app-wide depends on it).

## STEP 3 — Verify on screen (BOTH themes — the token has a dark AND light value)
Reload `/brands/418f321f.../discovery`:
- The **"Discovery" badge** is CYAN (not orange).
- The **"View →" links** on both sub-tiles are CYAN.
- The **Compass icon** (if shown) is cyan.
- Switch to LIGHT theme → the badge/links are the darker cyan (#0e7490), still readable (AA).
- Compare to the Retrieval hub — both should now show their correct distinct layer colors (Retrieval purple, Discovery
  cyan), proving the layer-color system works.
Report: Discovery hub renders CYAN in both themes; no orange leak.

## STEP 4 — Also check the Journeys + Comparisons sub-screens (same token)
The sub-screens (journeys, comparisons) use the same `--layer-discovery` accent (Run-journey button proto 3046 =
`background: var(--layer-discovery)`). Quick check when you navigate to them: their accents/buttons are cyan too, not
orange. (If Cause A, fixing the token fixes all three screens at once.) Report if the sub-screens are also cyan.

## STEP 5 — Report + guard
- STEP 1: the cause (A token-missing / B component-wrong-var / both).
- STEP 2: the fix applied + where.
- STEP 3: Discovery hub cyan on screen, both themes.
- STEP 4: sub-screens also cyan.
- Add to scripts/qa/sprint7-invariants.sh: assert the Discovery hub uses `--layer-discovery` (not `--accent-primary`) for
  its accent → `grep -c "layer-discovery" <discovery hub component>` ≥1 AND `grep -c "accent-primary" <discovery hub
  component>` for the badge/View accent → 0 (or however the check best asserts the layer token is used). AND assert
  --layer-discovery is defined in globals.css (both themes).

## Constraints
- Diagnose FIRST (STEP 1) — the build claimed to add both the token and the LayerBadge entry, so find which is actually
  wrong (token undefined vs component using --accent-primary) before fixing. Could be both.
- Discovery = CYAN (#06b6d4 dark / #0e7490 light), per prototype 250/327. Mirror how RETRIEVAL renders its layer color
  correctly.
- Verify BOTH themes on screen (the token has dark + light values). Local prod, never real prod.
- LayerBadge discovery entry is shared — fixing it fixes every discovery badge app-wide.
- LLD v8.70 / prototype 249-250, 327, 545, 3005-3046 win.

## NOTE
The Discovery hub renders ORANGE (the default --accent-primary) instead of the canonical CYAN --layer-discovery
(#06b6d4 dark / #0e7490 light, proto 250/327). The build report claimed it added the tokens + the LayerBadge discovery
entry — so this is green-claimed-but-wrong-on-screen: diagnose whether the token is actually undefined in globals.css
(Cause A → add it, both themes) or the hub component/View links use --accent-primary instead of var(--layer-discovery)
(Cause B → point them at the layer token), possibly both. The layer color IS the visual system (Retrieval purple, Trust
amber, Discovery cyan) — an orange Discovery hub breaks it and looks generic. Fix, verify CYAN on screen in BOTH themes
(the token has dark + light values), check the journeys/comparisons sub-screens use it too, and add a grep asserting the
hub uses --layer-discovery not --accent-primary + the token is defined both themes.
