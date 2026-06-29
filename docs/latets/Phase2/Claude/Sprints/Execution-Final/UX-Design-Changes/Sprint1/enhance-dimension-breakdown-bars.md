# Claude Code — UX ENHANCEMENT: dimension breakdown bars (semantic color + CI band + point dot)

On the audit detail page (`/audits/[auditId]`), the **Multidimensional breakdown** bars (Frequency / Position /
Sentiment / Context / Accuracy) are nearly invisible — the fill track and the point dot blend into the dark
background, so you can't see where the score sits or what its confidence range is. Redesign these five bars to
clearly show: (1) the score via **semantic color** (red→amber→green), (2) the **95% confidence interval** as a
band, (3) the **point estimate** as a high-contrast dot. **Scope: ONLY the dimension breakdown on this page** —
do NOT touch the per-engine bars, the sentiment panel, or any other component.

> This is a visual enhancement to existing, correct data. Do NOT change any scoring/data logic — only how the
> dimension bars render. Read the component first, then restyle.

---

## THE DATA (already computed, already correct — just render it better)
Each dimension has: a **score** (0–100 point estimate) and a **confidence interval** from `confidenceIntervals`
(Wilson 95% CI — a lower and upper bound). Example from a real audit:
- Frequency: score 99.4, CI 97–100   · Position: 74.0, CI 68–80   · Sentiment: 100.0, CI 100–100
- Context: 50.0, CI 43–57   · Accuracy: 5.6, CI 3–10
The bars already display these numbers; the bar *visual* is what's broken.

## USE THE EXISTING SEMANTIC TOKENS (do not invent colors)
Your design system already defines the right scale — reuse these (they're theme- and contrast-correct):
- `--health-poor` (red) · `--health-moderate` (amber) · `--health-good` · `--health-great` (green)
- (`--danger`, `--info` available if needed; `--border-subtle` / `--bg-subtle` for the track.)

**Score → color mapping** (semantic, by point-estimate value):
- 0–40 → `--health-poor` (red): weak visibility
- 40–70 → `--health-moderate` (amber): moderate
- 70–100 → `--health-good` / `--health-great` (green): strong
(Confirm the exact token names + thresholds against how `--health-*` is used elsewhere in the app, e.g. the
HealthCheck/score surfaces — match the existing convention so this is consistent, not a new scheme.)

## STEP 1 — Find the component
```bash
grep -rniE "Multidimensional|dimension.*breakdown|Frequency.*Position|confidenceInterval|Weight:|score.*range" app/ components/ --include=*.tsx | head
```
Open the dimension-breakdown component on the audit detail page. Identify how each bar currently renders the
track, the fill, the dot, and the lower/upper bound labels.

## STEP 2 — Redesign each bar (three visual layers)
Render each dimension bar as a 0–100 scale with three layers, back to front:

1. **Track** — a faint full-width 0–100 baseline (`--bg-subtle` / `--border-subtle`), low contrast, just for
   orientation. Rounded ends.
2. **Confidence band** — a semi-transparent filled band spanning **lower → upper bound** of the CI, in the
   semantic color for that score (red/amber/green per the mapping). ~30–40% opacity so it reads as a "range,"
   not a solid fill. The band's WIDTH is meaningful: narrow (Frequency 97→100) = high confidence; wide
   (Context 43→57) = more uncertainty. This is the key information the current design loses.
3. **Point estimate** — a solid, high-contrast dot/tick at the **score** position, in the full-strength
   semantic color (or white with a colored ring) so it's clearly visible on the band. This is the focal point.

**Bound labels:** keep the small numeric lower/upper labels at the band ends (97 / 100, 68 / 80, etc.), made
legible (`--text-secondary`, not near-invisible). Optionally a tiny "95% CI" caption once for the group.

## STEP 3 — Accessibility + restraint (high-standard requirements)
- **WCAG AA contrast:** the point dot ≥3:1 against its background; bound labels ≥4.5:1. The `--health-*` tokens
  should already satisfy this — verify on the dark theme.
- **Not color-alone:** the dot POSITION + the numeric bounds carry the meaning independent of color (colorblind
  users must still read the value). Color is reinforcement.
- **Restraint:** there are FIVE bars side by side — keep the band semi-transparent and calm; let the dot +
  numbers be the focal points. Do NOT make five saturated gradient bars competing for attention. The goal is
  "instantly readable at a glance," not "maximally colorful."
- **prefers-reduced-motion:** if you animate the band/dot in, gate it behind the reduce-motion check (the app
  already honors this for other animations).
- Match the existing dark theme, font tokens (`--font-mono` for the numbers), and spacing — this should look
  native to the page, not bolted on.

## STEP 4 — Verify
- Reload an audit with a MIX of scores to see the full color range in one view — e.g. **audit #32 (Employment
  Hero)**: Frequency 99.4 (green, narrow band), Context 50.0 (amber, wider band), Accuracy 5.6 (red, narrow).
  Confirm each bar's color matches its score tier and the band spans its CI with the dot at the score.
- Also check a **0.0 audit** (e.g. #31): all bars red, dot at 0, minimal/zero-width band — and it still reads
  cleanly (no broken rendering at 0).
- Confirm the dot and bounds are clearly visible on the dark background (the original problem is gone).
- Confirm ONLY the dimension breakdown changed — per-engine bars, sentiment panel, etc. untouched.

## REPORT
- The component changed + the `--health-*` tokens/thresholds used (matching the app's existing convention).
- Confirmation from audit #32 (mixed colors) and #31 (all-zero) that bars are now clearly readable with
  semantic color + CI band + visible dot.
- Confirm scope was limited to the dimension breakdown only.
