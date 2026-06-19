# VisibleAU — Sprint 7 UI Fix (round 2): Technical-Audit Overview Page
# Scope: 2 follow-up polish fixes after round 1. Both on the technical-audit OVERVIEW page.
# Source: Sprint 7 Gate-2 re-validation (full-page screenshots after the round-1 fix).
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are applying two follow-up fixes to the **Technical AI Audit overview page**
> (`app/(auth)/brands/[brandId]/technical-audit/page.tsx` + its dimension-bar and score-header
> components). Round 1 already landed: 0-scores now render in the danger colour, the delta badge
> exists, the score uses the mono font, and the Meta tags description includes hreflang — **keep all
> of that.** These two fixes refine the round-1 result. Presentation only — do **NOT** touch schema,
> migrations, the scoring formulas, or any Inngest function.
>
> ### FIX 1 — [LOW] 0-score bars must be empty/minimal width, not full
> **Where:** the dimension progress-bar/row component in the 8-Dimension Breakdown.
> **Problem:** round 1 made 0-scores red (good), but it renders them at **full bar width** — the
> whole track is red for Schema markup 0/16, Signals 0/6, and AI Discovery 0/6. Meanwhile Brand &
> Entity 2/10 correctly shows a **proportional** ~20% red fill. So the bar *length* no longer tracks
> the score: a 0/16 now has a full-length bar (like Robots' 18/18) and looks larger than the
> better-scoring 2/10. In this component, **fill width = score / max** — that must hold for 0 too.
> **Fix:** make the fill width proportional for **all** scores, including 0 — so a 0-score fill is
> **empty or a minimal sliver** (a small fixed min like ~4–6px is fine so the bar isn't literally
> invisible), **not** full width. Keep the severity signals that already work:
> - the fill colour stays the band colour (red for the danger band — 0 is in it),
> - the score label (`0/16`) stays `var(--accent-red)`,
> - the red status dot stays on the row,
> - keep the `aria-label` conveying "critical".
> Net: length encodes the score (0 ≈ empty), colour + label + dot encode severity. A 0/N row must
> read as low *and* critical — a near-empty red bar — not a full red bar.
> **Optional consistency note:** the red status dot currently appears only on 0-score rows, not on
> Brand & Entity 2/10 (also danger-band). Either apply the dot to every danger-band row or leave it
> as a zero-specific marker — your call, but make it intentional and consistent.
>
> ### FIX 2 — [LOW] Delta badge: handle the zero and no-previous cases
> **Where:** the score-header delta badge (currently "+0.0 vs last", green) and the server component.
> **Problem:** the badge shows a green **"+0.0 vs last"**. A zero delta is *no change*, not an
> improvement, so green + a "+" sign is misleading; and if the brand has no previous audit the badge
> should not appear at all.
> **Fix:**
> - **No previous audit** (only one `technical_audits` row for the brand): **omit the badge entirely**
>   — no "+0.0", no placeholder.
> - **Delta exactly 0** (a real previous audit, same composite): render a **neutral** badge (grey /
>   `var(--text-tertiary)` or the neutral `Badge` tone), reading **"No change"** (or "±0.0 vs last"),
>   **not** green and **not** with a "+".
> - **Delta > 0:** green, `+N.N vs last`. **Delta < 0:** red/danger, `−N.N vs last`. (`tabular-nums`,
>   one decimal.)
> Confirm the server component fetches the two most recent rows (`orderBy(desc(createdAt)).limit(2)`)
> and only renders the badge when a previous row exists. Read-only — no schema change.
>
> ---
> **Verification (run before reporting done):**
> - **Visual (dark + light):** Schema 0/16, Signals 0/6, AI Discovery 0/6 now show a **near-empty**
>   red bar (not full), still with the red label + dot, and read as more severe than the
>   proportionally-filled Brand & Entity 2/10. The delta badge is omitted on a first audit, neutral
>   "No change" on a zero delta, green/red with a sign otherwise.
> - **grep:** the bar component computes width from `score/max` with a small min for 0 (no special
>   "full width when 0" branch); the badge has explicit no-previous / zero / positive / negative
>   branches.
> - No console errors. TS strict, no `any`. Design tokens only. The page stays Growth+.
>
> Report the files changed and confirm both fixes + the verification.

---

## Notes for Sri (not part of the paste)
- Both are **LOW** polish items — the page is already correct and the round-1 severity fix works.
  These just make the bar length honest (0 ≈ empty, not full) and the delta badge truthful (no fake
  green "+0.0").
- FIX 3 (mono font) from round 1 looked applied but I couldn't confirm it from a screenshot — if you
  want certainty, grep the score element for `var(--font-mono)`; I didn't re-prompt it since it
  appears done.
- Still pending: the **seven sub-pages** (D1 llms.txt … D7 citability) haven't been validated against
  their prototype components yet — send those screenshots when ready and any gaps get their own fix
  prompt.
