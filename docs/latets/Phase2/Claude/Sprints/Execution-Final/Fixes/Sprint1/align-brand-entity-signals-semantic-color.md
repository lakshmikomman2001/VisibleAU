# Claude Code — UX: align Brand & Entity audit signals with the semantic colour standard

The Brand & Entity audit (`/brands/[id]/brand-entity-audit`) renders its signals with plain green-check /
grey-X icons and uncoloured "N/M" scores. Align it with the design standard now used on the dimension bars:
the **semantic `--health-*` colour language** (red/amber/green) so pass/partial/fail reads consistently across
the app. **Scope: ONLY the Brand & Entity audit signal rows + the /10 score.** Don't touch other screens.

> **Apply the standard with judgment — do NOT copy the dimension-bar design literally.** Those bars show
> continuous 0–100 scores WITH confidence intervals (hence band + dot). These are DISCRETE pass/partial/fail
> signals — a CI band is meaningless here. The transferable part is the SEMANTIC COLOUR (and honesty), not the
> bar/band visual. No bands, no dots — just consistent colour + clear state.

---

## THE PRINCIPLE BEING APPLIED (from `visibleau-ux-design-standard.md`)
- **Semantic colour:** state/score quality maps to `--health-poor` (red) / `--health-moderate` (amber) /
  `--health-good`–`--health-great` (green) — the same ramp the dimension bars use, so the whole app speaks one
  visual language.
- **Not colour-alone:** keep the icon (✓/partial/✗) AND the "N/M" text — colour is reinforcement, not the only
  signal (accessibility).
- **WCAG AA** contrast on the new colours against the dark background.
- **Restraint:** don't over-decorate — colour the icon + the score number; keep rows calm.

## CURRENT STATE (what to change)
Signal rows (5): ABN Lookup Verification, Wikipedia AU Presence, Australian TLD, AU Directory Aggregate, +
ABR match. Each shows an icon + name + detail + an "N/M" score (e.g. 3/3, 0/3, 2/2, 0/2). Plus a /10 total and
the per-directory list (Hipages / Yellow Pages AU / ServiceSeeking / Word of Mouth — "Not found"/found).
Currently icons are green-check / grey-X and the N/M numbers are uncoloured/secondary.

## STEP 1 — Find the component + confirm tokens
```bash
grep -rniE "Brand.*Entity|brand-entity|ABN Lookup|Wikipedia AU|Entity Signals|abnVerified" app/ components/ --include=*.tsx | head
# Confirm the health tokens exist + their usage convention (match how the dimension bars use them):
grep -rn "\-\-health-poor\|\-\-health-moderate\|\-\-health-good\|\-\-health-great" app/ components/ styles/ --include=*.tsx --include=*.css | head
```

## STEP 2 — Apply semantic colour to each signal
For each signal, derive its state from its score ratio (points earned / points possible) and colour accordingly:
- **Full** (e.g. 3/3, 2/2) → `--health-good` / `--health-great` (green): icon ✓ + the "N/M" number both green.
- **Partial** (e.g. 1/2, partial directory) → `--health-moderate` (amber): a partial/half icon + amber "N/M".
- **Zero / fail** (e.g. 0/3, 0/2) → `--health-poor` (red): icon ✗ + red "N/M".

Notes:
- Keep BOTH the icon and the "N/M" text (colour is reinforcement, not sole signal). The grey-X should become a
  **red** ✗ for a genuine fail (0/M) so failures read clearly — but the icon shape still distinguishes it.
- Use the SAME thresholds/convention as the dimension bars (full=green, partial=amber, none=red). Match how
  `--health-*` is applied there so it's consistent, not a parallel scheme.
- The per-directory sub-list (Hipages etc.): "found" → green check, "Not found" → red (or muted red) ✗ —
  consistent with the signal rows.

## STEP 3 — Colour the /10 total score by band
The big "5/10" (and the prototype's "Good" badge) should use the semantic ramp too, by the /10 value:
- Match the app's existing score-band convention if one exists (check how the visibility /100 or HealthCheck
  colours its number). A reasonable mapping if none exists: <4/10 red, 4–7/10 amber, >7/10 green.
- Colour the score number (and badge) with the matching `--health-*` token. Keep it legible (WCAG AA).

## STEP 4 — Restraint check
- Five rows + a sub-list + a total: don't make it a wall of saturated colour. Colour the **icon + the number**;
  leave row backgrounds and detail text as-is (`--text-secondary`). The colour should guide the eye to
  pass/fail at a glance, not shout.
- No bands, no dots, no animation — this is a discrete-signal screen, keep it clean.

## STEP 5 — Verify
- Reload the Brand & Entity audit for **Lighting Up Melbourne Electrical** (the 5/10 brand):
  - ABN 3/3 → green ✓, AU TLD 2/2 → green ✓, Wikipedia 0/3 → red ✗, AU Directory 0/2 → red ✗.
  - The "5/10" total in amber (per the band), or your app's convention.
  - Per-directory list: all "Not found" → red/muted-red.
- Confirm colour + icon + number all agree (not colour-alone), contrast is AA on dark, and the screen reads
  calm (not over-coloured).
- Confirm scope: ONLY this screen changed.

## REPORT
- The component changed + the `--health-*` tokens/thresholds used (matching the dimension-bar convention).
- Confirmation from the Lighting Up Melbourne Electrical screen (green ABN/TLD, red Wikipedia/Directory, amber
  total).
- Confirm icons + numbers retained alongside colour (accessibility), and scope limited to this screen.
