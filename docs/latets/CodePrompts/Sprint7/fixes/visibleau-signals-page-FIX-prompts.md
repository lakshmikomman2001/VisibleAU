# VisibleAU — Signals page: BUILT-UI fix prompts (run in order)
# Pins to: visibleau-signals-page-BUILT-UI-REVIEW.md (findings V1–V4) + Sprint 7 canon
#   (sri-visibleau-sprint-7-prompt.md). Phase 1 = backend (the score-signals detectors); Phase 2 = UI.
# Both: TS strict, no `any`; design tokens only; both light/dark themes.
# IMPORTANT — order: run FIX V1 first (it's a scoring-correctness check that may change the /6 the UI
#   shows), verify, THEN the UI fixes (V2/V4). Editing: str_replace / exact-literal only — never
#   sed/perl with pipe delimiters.

═══════════════════════════════════════════════════════════════════════════════
FIX V1 — BACKEND (run first) · confirm/repair the Signals /6 score POLARITY
═══════════════════════════════════════════════════════════════════════════════

> The Signals page shows **0/6** with "7 negative signals · 22 prompt injections detected". Before
> changing anything, you must determine whether 0/6 is **correct** or an **inverted-polarity bug** —
> do NOT blindly flip it.
>
> **The invariant that decides it:** `scoreSignals` is a `/6` column that ADDS into the 100-point
> composite (Sprint 7 canon: `scoreComposite = robots.score + … + signals.score + aiDiscovery.score`,
> and the 5-cat rollup's Technical % = `(scoreRobots + scoreLlmsTxt + scoreAiDiscovery + scoreSignals)
> / 48`). In that composite **higher = better** for every dimension. So `scoreSignals` MUST be a
> **health score: 6 = clean (no negative signals / injections), trending to 0 as detections rise**.
> Canon's prose calls the underlying metric "lower is better" (the count of bad signals) — that is the
> INTERNAL badness, which must be **converted to the 0–6 health score before it is persisted to
> `scoreSignals` and fed to the composite**.
>
> **1. Locate the computation.** In `lib/negative-signals/detect.ts` + `lib/prompt-injection/detect.ts`
> (the `detectNegativeAndInjection(crawl)` used by `step.run('score-signals', …)` in
> `inngest/functions/technical-audit-run.ts`), find where the returned `.score` (the value persisted as
> `scoreSignals`) is computed.
>
> **2. Diagnose — report which case is true, with the actual code:**
> - **Case A (correct, no fix):** `.score` is already a 0–6 HEALTH score where 6 = no detections and it
>   decreases as severity/count rises (e.g. `score = Math.max(0, 6 - penalty)`). If so, 0/6 for a
>   heavily-flagged site is correct — STOP after confirming, and report "V1: Case A, no change".
> - **Case B (bug):** `.score` is the raw "lower is better" badness number (a count, or a 0–N where
>   higher = worse) persisted directly as `scoreSignals`. If so, the composite is being fed a
>   badness value where it expects a health value — every audited site's composite is wrong.
>
> **3. If Case B, repair the polarity (and ONLY then):** convert the internal badness to a 0–6 health
> score at the point of return, so 6 = clean and 0 = many/severe, e.g.:
> ```
> // weight detections by severity, cap at 6 points of penalty
> const penalty = Math.min(6, criticalCount * 2 + warningCount * 1 + infoCount * 0.5);
> const score = Math.max(0, 6 - penalty);   // 0–6 HEALTH score for the /100 composite
> ```
> Use whatever severity weighting the detector already implies, but the result must be a 0–6 health
> score. Keep `count`, `severity`, `element`, and the new `detail` per-row fields unchanged (this fix
> is ONLY about the aggregate `.score`).
>
> **4. Guard the composite.** Whichever case: after this fix a re-run on a CLEAN test site (no
> negative signals, no injections) must yield `scoreSignals === 6`, and a heavily-flagged site must
> yield a LOW `scoreSignals` (near 0) — and `scoreComposite` must move in the correct direction
> (clean site scores HIGHER overall). Add/extend a unit test asserting: clean input → score 6;
> all-critical input → score near 0; score is always within `[0, 6]`.
>
> **5. Document the semantics** in a one-line comment at the column (Sprint 7 prompt, the
> `scoreSignals` numeric line) and at the detector return: `// 0–6 HEALTH score: 6 = clean, 0 = many/
> severe negative signals + injections (lower internal badness → higher health score).` This settles
> the L40-vs-column ("E1b") ambiguity in code.
>
> **Verify before reporting done:**
> - State explicitly: **Case A (no change)** or **Case B (repaired)**, with the before/after of the
>   `.score` computation.
> - Clean test site → `scoreSignals === 6`; flagged site → near 0; value always in `[0,6]`.
> - `scoreComposite` and the 5-cat rollup move in the correct direction (clean = higher).
> - `npm run typecheck` + the signals detector unit tests pass.
> Report the files changed and the Case A/B determination.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
FIX V2 — UI + a data decision · disambiguate repeated pattern rows; collapse site-wide injections
═══════════════════════════════════════════════════════════════════════════════

> The Signals page renders the same pattern multiple times ("Keyword stuffing" ×2, "Invisible Unicode"
> ×2, "HTML comment injection" ×3) which reads like a rendering loop. Multiple rows of one pattern are
> legitimate (different term / different page), but the page must make them read as DISTINCT findings,
> and identical site-wide injections should not be over-counted.
>
> **Authority:** prototype `SignalsAudit` (the folded-in `'signals'` component) +
> `components/domain/technical/signals-detail.tsx`. Presentation + a small detector-aggregation
> decision. No schema change.
>
> ### V2a — Disambiguate the row TITLE (UI, `signals-detail.tsx` / SignalsAudit)
> Each row currently shows the pattern name as the heading and the specifics only in the `detail`
> sentence. Append the distinguishing locator to the heading so repeats read as separate findings:
> - **Negative signals:** if the row's `detail` (or a `path`/`term` field, if present) identifies a
>   page or term, render the title as `{pattern} · {path-or-term}` — e.g. "Keyword stuffing · 'your'",
>   "CTA overload · /emergency-plumber-bondi". If no locator is available, leave the bare `pattern`.
> - **Prompt injections:** render the title as `{pattern} · {path}` where the page path is available —
>   e.g. "HTML comment injection · /contact-us".
> Keep the existing severity badge, `detail` sentence, and (for injections) the `element` mono block
> exactly as-is. Title-only change.
>
> ### V2b — Collapse identical SITE-WIDE injections (detector aggregation — DECISION REQUIRED)
> Two "HTML comment injection" rows show the IDENTICAL `element` (`<!-- Injecting site-wide to the
> head -->…`) on different pages — the same site-wide injection counted once per crawled page, which
> inflates the "22 prompt injections" total. Apply this in the detector
> (`lib/prompt-injection/detect.ts`, inside `detectNegativeAndInjection`):
> - When the SAME `{ pattern, element }` is detected on multiple pages, emit **ONE** row, not N. Add a
>   `pagesAffected: string[]` (or `foundOnCount: number`) to that injection's object (additive JSONB —
>   no migration) and set its `detail` to note the scope, e.g. "LLM-directed instruction in an HTML
>   comment, site-wide ({n} pages) — invisible to users, readable by AI crawlers."
> - Do the same de-dup for negative signals where an identical `{ pattern, detail-defining value }`
>   repeats across pages **only if** it is genuinely the same finding (keyword stuffing on DIFFERENT
>   terms stays separate; the SAME term on N pages collapses).
> - This must NOT change `scoreSignals` polarity from FIX V1 — but note the count the score is derived
>   from may legitimately drop after de-dup; re-confirm the V1 clean→6 / flagged→low test still holds.
> - **If you are unsure whether a given pattern is "site-wide vs per-page by design", do NOT guess —
>   leave it per-page and flag it in your report for Sri to decide.**
> Then render `pagesAffected`/`foundOnCount` in the UI ("found on N pages") where present.
>
> **Verify before reporting done:**
> - Repeated patterns now show a disambiguated title (page/term in the heading).
> - Identical site-wide injections render as ONE row with a "site-wide / N pages" note; the injection
>   count reflects de-duped findings.
> - Empty-array states unchanged; both themes; `npm run typecheck` passes.
> - Re-confirm FIX V1's clean→6 / flagged→low invariant still holds after de-dup.
> Report the files changed and any pattern you left per-page pending Sri's decision.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
FIX V4 — copy · align the CTA-overload description number with the detector threshold
═══════════════════════════════════════════════════════════════════════════════

> The CTA-overload row reads "…above the recommended maximum of **6**" but the detector threshold
> (Sprint 7 canon: CTA overload `>7 = warning; >12 = critical`) fires at **7**, not 6. The number the
> user sees must match the rule that fired.
>
> In `lib/negative-signals/detect.ts` (the CTA-overload `detail` template emitted by
> `detectNegativeAndInjection`), change the CTA-overload `detail` copy so the stated limit equals the
> warning threshold (7), e.g.:
> - from: "{n} calls-to-action on {path} — above the recommended maximum of 6."
> - to:   "{n} calls-to-action on {path} — above the recommended maximum of 7."
> (Do not change the detection threshold itself — canon's `>7 = warning` stays; only the human copy is
> corrected to match it.) If any other `detail` template states a number that differs from its canon
> threshold (thin content <300, keyword stuffing >3%), align those too while you're here.
>
> **Verify before reporting done:**
> - The CTA-overload row copy says 7 (matching the `>7` warning threshold); other templates' numbers
>   match their canon thresholds.
> - `npm run typecheck` + the detector unit tests pass (update any test asserting the old "6" string).
> Report the files changed.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **V1 is the one that matters** — it's a correctness check, not a cosmetic fix. If it comes back
  "Case A", the 0/6 is right and only V2/V4 remain. If "Case B", every audited site's composite was
  being computed with an inverted Signals dimension, so it's worth confirming on a couple of real
  audits after the fix.
- **V2b is a judgement call** (site-wide vs per-page counting) — the prompt tells Claude Code to
  de-dup only genuinely-identical findings and to flag anything ambiguous rather than guess, so you
  get to decide the borderline cases.
- **V3** (the 22-injections volume) isn't a separate prompt — it resolves once V2b de-dups site-wide
  injections; if the count still looks inflated after that, it's the per-page crawl feeding the
  detector more pages, which is expected.
- These are all additive/presentational except V1-Case-B (which corrects a scoring computation) — no
  migration in any of them.
