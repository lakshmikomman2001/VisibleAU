# VisibleAU — Sprint 7 UI refinement: Technical Audit overview (danger-signal + category-card colour)
# Page: /brands/[brandId]/technical-audit  (the 8-dim overview — built per EC5; NO prototype component)
# Source: Gate-2 overview review. The page PASSED (rollup math, maxes, descriptions, order, 0-score-red
#   bars, neutral delta all correct). These are two COSMETIC UX-consistency refinements, not bug fixes.
#   Presentation-only — no scores, thresholds, bar widths, or rollup math change.
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are making two small visual-consistency refinements to the **Technical Audit overview**
> (`app/(auth)/brands/[brandId]/technical-audit/page.tsx` and its dimension-row + category-card
> rendering). This page has no prototype — it's built from the EC1/EC5 spec. Both changes **reuse the
> existing severity-band thresholds** that already colour the dimension bars (green / amber / red by
> percentage). Do not invent new thresholds. **Presentation only:** do not change any score, bar width,
> threshold value, the EC1 rollup math, the delta badge, or the existing 0-score red-bar rendering.
>
> First, locate the band logic that already drives the dimension **bar** colour (green/amber/red by
> pct). Both parts below derive from that same band.
>
> ### PART 1 — Unify the danger signal in the 8-dimension breakdown
> Currently the score **number** turns red and the **● dot** (next to the dimension title) appear only
> when the score is exactly 0, while the bar colour uses the severity band. The result: a dimension in
> the red band but not at zero (e.g. Brand & Entity 2/10 = 20%) shows a red *bar* but a *white* number
> and no dot — visually inconsistent with the zero-score rows.
> **Change:** drive the score-number colour AND the ● dot from the **same band as the bar**. Show the
> red number + ● dot for the whole **danger (red) band** (which includes 0), not only when the score is
> exactly 0. Leave the amber and green bands showing a white number and no dot. Bar colours, bar widths,
> and all thresholds stay exactly as they are.
> **After:** Brand & Entity (2/10) shows a red number + ● dot matching its red bar; the three existing
> 0-score rows (Schema 0/16, Signals 0/6, AI Discovery 0/6) are unchanged; amber/green rows keep their
> white number and no dot.
>
> ### PART 2 — Colour-code the 5 category summary cards
> The five rollup cards (Technical / Content / Authority / Schema / Performance) render the percentage
> in white regardless of value, so a poor category doesn't signal at the summary level.
> **Change:** colour the **percentage text** of each category card by the same severity band used for
> the dimension bars (reuse the same thresholds). Keep the Performance stub ("—") neutral. Do not add
> backgrounds or borders — colour the percentage text only.
> **After:** Schema 0% and Authority 20% render in the danger colour; mid-range cards (e.g. Content 46%,
> Technical 56%) in the amber band; a high score in green; Performance "—" stays neutral.
>
> ### Out of scope (do NOT do)
> - Do **not** add or wire the Signals dimension row → a Signals page link. The Signals page doesn't
>   exist yet (it's a later phase); that linkage is handled there, not here.
> - Do **not** touch the EC1 rollup, the displayed scores/percentages, bar widths, the delta badge, or
>   the 0-score red-bar nubs.
>
> ### Verify before reporting done
> - PART 1: Brand & Entity (2/10) → red number + ● dot; Schema/Signals/AI Discovery (0) unchanged;
>   Robots (green) and llms.txt/Meta/Content (amber) keep white numbers and no dot.
> - PART 2: Schema 0% and Authority 20% in the danger colour; Content/Technical amber; Performance "—"
>   neutral.
> - Unchanged: every score and percentage value, every bar width, the "No change" delta badge, the
>   rollup totals (Technical 56 / Content 46 / Authority 20 / Schema 0 / score 41).
> - Both light and dark themes; design tokens only (`var(--accent-red|amber|green)` etc.); TS strict,
>   no `any`; no console errors.
> Report the files changed and confirm PART 1 + PART 2.

---

## Notes for Sri (not part of the paste)
- Severity: **cosmetic / UX-consistency** — the overview passed review with no bugs. These just make the
  danger signalling and the category cards scan consistently with the breakdown's colour language.
- PART 1 is the "unify danger signalling" option. If you actually intend the ● dot to flag **empty/zero
  dimensions only** (a deliberate two-tier signal), skip PART 1 — the current behaviour is
  self-consistent in that reading. PART 2 stands either way.
- Both are presentation-only and reuse the existing band thresholds, so they can't perturb scores or the
  rollup — low-risk to gate and apply.
