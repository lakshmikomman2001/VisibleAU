# Claude Code — token swap: Brand & Entity audit → use `--health-*` (match the dimension bars)

The Brand & Entity audit (`app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx`) currently colours its
signals with `--success` / `--warning` / `--danger`. The dimension bars use `--health-good`/`--health-great` /
`--health-moderate` / `--health-poor`. For the two surfaces to share the EXACT same palette, swap this screen's
status colours to the `--health-*` tokens. **Only swap the colour token references — change nothing else.**

> One-change task: token references only. No layout, structure, logic, icon, or threshold changes. The pass/
> warning/fail STATES stay exactly as they are — only the CSS variable each maps to changes.

## THE SWAP (map status → health token, matching the dimension-bar convention)
- `--success`  → `--health-good` (or `--health-great` — use whichever the dimension bars use for "good/strong";
  match that exact token so green is identical on both screens)
- `--warning`  → `--health-moderate`
- `--danger`   → `--health-poor`

Apply across the file's signal rows + score + directory sub-list (the lines changed in the last edit):
- Signal icon colour (pass/skip/fail)
- Signal score number colour (N/N)
- The /10 total colour band (>7 / 4–7 / <4)
- Directory icon + status colour (found / not found)

```bash
# Find the current token usage in this file:
grep -n "\-\-success\|\-\-warning\|\-\-danger" "app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx"
# Confirm which health token the dimension bars use for "good" so green matches exactly:
grep -rn "\-\-health-good\|\-\-health-great\|\-\-health-moderate\|\-\-health-poor" app/ components/ --include=*.tsx | grep -i "dimension\|breakdown\|score" | head
```
Swap each `--success`/`--warning`/`--danger` in THIS file to its `--health-*` equivalent. Match the dimension
bars' exact green token (good vs great) so the two screens are pixel-identical in colour.

## VERIFY
- Reload the Brand & Entity audit for Lighting Up Melbourne Electrical: ABN 3/3 green, Wikipedia 0/3 red, AU TLD
  2/2 green, Directory 0/2 red, total 5/10 amber — visually UNCHANGED in layout, now using `--health-*`.
- Open a dimension-bar audit (e.g. Employment Hero) side by side: the green/amber/red now MATCH exactly between
  the two screens.
- Confirm: only token references changed in the one file; states/icons/numbers/layout identical to before.

## REPORT
- The `--success/--warning/--danger` → `--health-*` swaps made (which health green token was used to match the bars).
- Confirmation the two screens now share the identical palette.
