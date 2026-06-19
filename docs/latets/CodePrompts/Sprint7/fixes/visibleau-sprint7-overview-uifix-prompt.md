# VisibleAU — Sprint 7 UI Fix: Technical-Audit Overview Page
# Scope: 4 targeted UI fixes (1 MOD, 3 LOW) on the technical-audit OVERVIEW page only.
# Source: Sprint 7 Gate-2 validation review (full-page screenshot vs prototype + LLD spec).
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are fixing UI issues on the **Technical AI Audit overview page**
> (`app/(auth)/brands/[brandId]/technical-audit/page.tsx` + its view/sub-components) for VisibleAU.
> Sprints 1–7 are built and merged. Authority: the **Sprint 7 prompt** (the EC1 8→5 roll-up formula,
> the EC5 page pattern), **Foundations v1.12** (the `technical_audits` schema, the `scoreMeta`
> 5-sub-signal definition), and the **prototype** `visibleau-prototype.jsx` — specifically the
> `SchemaAuditor` status convention (`valid`→green, `warning`→amber, `danger`→red) and the
> `AuditResultsRich` score-header pattern. Where this prompt and those differ, **they win**.
>
> **The page is structurally correct** — the 8-dimension scores, the EC1 5-category roll-up, and the
> composite (41/100 = the sum of the 8 dimension points) all reconcile and are faithful to the LLD.
> These are **presentation-only fixes**. Do **NOT** change the DB schema, any migration, the scoring
> formulas (`rollupTo5Categories`, the per-dimension scores), or any Inngest function. The numbers are
> right; only how they render changes.
>
> Build the fixes in this order:
>
> ### FIX 1 — [MOD] 0-score dimension bars must render as danger (red), not empty
> **Where:** the 8-Dimension Breakdown rows — the dimension progress-bar/row component.
> **Problem:** each bar fills by `score / max` and colours the fill by band. This works for non-zero
> scores (Brand & Entity 2/10 correctly renders **red**). But a **0-score** — Schema markup 0/16,
> Signals 0/6, AI Discovery 0/6 — renders as an **empty grey track**, because at 0% fill there is no
> coloured fill to show. The result is an inverted severity: the *worst possible* scores (literally
> zero) look calmer than a low non-zero one (2/10). That is the bug.
> **Fix:** a `0/N` dimension must read as the **most severe (danger/red)** state, more severe than
> `2/10`, not less. Keep the existing band thresholds (they already classify ≤~30% as red — do not
> retune them). The only change is to make the danger colour visible at 0% fill:
> - give the fill a **minimum visible width** (e.g. ~4–6px) in the band colour, so a 0-score shows a
>   clear red sliver; **and**
> - colour the score label (`0/16`) in the band colour for the danger band (`var(--accent-red)`).
> - **Accessibility (required):** severity must not rely on colour alone — keep the `0/N` text and add
>   an `aria-label` (e.g. `"Schema markup: 0 of 16 — critical"`) and/or a small status icon, so
>   colour-blind and screen-reader users get the same signal.
> Apply the same treatment uniformly to every dimension row (so any future 0 is handled).
>
> ### FIX 2 — [LOW] Add the "vs last audit" delta badge to the Technical Score
> **Where:** the score header (`TECHNICAL SCORE / 41 / of 100`) and the server component (`page.tsx`).
> **Problem:** the score shows `41 / of 100` with no trend, unlike `AuditResultsRich` which shows a
> `+6.2 vs last` badge next to its score.
> **Fix:** in the server component, fetch the **two most recent** `technical_audits` rows for the
> brand (`orderBy(desc(createdAt)).limit(2)`), compute `delta = latest.scoreComposite −
> previous.scoreComposite`, and render a small badge beside the score:
> `+N vs last` (success/green) or `−N vs last` (danger/red), `tabular-nums`, one decimal.
> If there is only one audit (no previous), **omit the badge** (no "+0", no placeholder). Read-only —
> no schema change, no new endpoint.
>
> ### FIX 3 — [LOW] Score number uses the mono font
> **Where:** the large `41` Technical Score element.
> **Fix:** render it with `var(--font-mono)` + `tabular-nums`, matching `AuditResultsRich`'s `63.4`
> treatment. Apply `tabular-nums` to the category percentages and the dimension scores too if they
> aren't already, so all figures align.
>
> ### FIX 4 — [LOW] Meta tags dimension description must include hreflang
> **Where:** the dimension metadata (the array/map defining each dimension's name + description).
> **Problem:** the Meta tags description reads `"Title, description, OG, canonical"` — it omits
> **hreflang**, the fifth `scoreMeta` sub-signal (2 pts) and the one AU-localisation signal, which
> matters for an AU product.
> **Fix:** change the description to `"Title, description, OG, canonical, hreflang"`. Text only — the
> `/14` max and the scoring are unchanged.
>
> ---
> **Verification — run before reporting done:**
> - **Visual (dark + light themes):** on the overview page, Schema markup 0/16, Signals 0/6, and AI
>   Discovery 0/6 now show a red/danger indicator (sliver + red label) and clearly read as *more*
>   severe than Brand & Entity 2/10; the Technical Score uses the mono font and shows a delta badge
>   (or none on a brand's first audit); the Meta tags row reads `…canonical, hreflang`.
> - **grep:** `grep -rn "accent-red\|danger" <dimension-bar component>` shows the danger colour is
>   applied for 0-scores; `grep -rn "font-mono" <score header>` → ≥1; `grep -rn "hreflang"
>   components/ app/` finds the updated description.
> - **a11y:** the 0-score rows have an `aria-label` conveying "critical"; severity is not colour-only.
> - **No console errors. TypeScript strict, no `any`. Design tokens only** (`var(--accent-red/amber/
>   green)`, `var(--font-mono)`, the existing `Card`/`Badge`) — no hardcoded hex. The page stays
>   Growth+.
>
> Report a short summary of the files changed and confirm each of the four fixes + the verification.

---

## Notes for Sri (not part of the paste)
- This prompt covers the **overview page** only — the four gaps confirmed in the full-page review.
  FIX 1 (0-score → red) is the one that matters for sign-off; FIXES 2–4 are polish.
- The **seven sub-pages** (D1 llms.txt … D7 citability) haven't been validated yet — we only set up
  D1's ground-truth and reviewed the overview. Once you share the sub-page screenshots and I check
  them against their prototype components, any further gaps can go into a second fix prompt.
- Nothing here touches schema, scoring, or Inngest — so it's safe to run independently of the
  LLD-hygiene queue.
