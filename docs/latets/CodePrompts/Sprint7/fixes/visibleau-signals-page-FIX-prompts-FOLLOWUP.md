# VisibleAU — Signals page: FOLLOW-UP fixes (V4 + V2b + V1 confirmation)
# Context: a prior fix prompt applied V2a (row-title disambiguation) correctly, but V4 and V2b were
#   NOT applied and V1 was never confirmed in code. This prompt covers ONLY those three.
# Pins to: Sprint 7 canon (sri-visibleau-sprint-7-prompt.md). TS strict, no `any`; design tokens
#   only; both light/dark themes. Editing: str_replace / exact-literal only — never sed/perl with
#   pipe delimiters. Do all three; report each separately.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — V1 CONFIRMATION · is the Signals /6 score polarity correct? (may need NO change)
═══════════════════════════════════════════════════════════════════════════════

> This is a CHECK, not a blind edit. The Signals page shows 0/6 for a heavily-flagged site, which is
> *plausibly correct* — confirm it in code and prove it with a test.
>
> **The invariant:** `scoreSignals` is a `/6` that ADDS into the 100-pt composite (canon:
> `scoreComposite = robots.score + … + signals.score + aiDiscovery.score`; the rollup's Technical % =
> `(scoreRobots + scoreLlmsTxt + scoreAiDiscovery + scoreSignals) / 48`). Higher = better there, so
> `scoreSignals` MUST be a **0–6 HEALTH score: 6 = clean, → 0 as detections rise**.
>
> 1. In `lib/negative-signals/detect.ts` + `lib/prompt-injection/detect.ts` (the
>    `detectNegativeAndInjection(crawl)` used by `step.run('score-signals', …)`), find where the
>    returned `.score` (persisted as `scoreSignals`) is computed.
> 2. **Report which case is true, pasting the actual `.score` code:**
>    - **Case A (correct → NO change):** `.score` is already 0–6 health (6 = no detections, decreasing
>      with severity/count; e.g. `Math.max(0, 6 - penalty)`). The 0/6 display is correct → stop.
>    - **Case B (bug → fix):** `.score` is a raw "lower-is-better" badness count (or 0–N where higher =
>      worse) persisted directly. The composite is being fed inverted polarity → convert to a 0–6
>      health score at the return: `const score = Math.max(0, 6 - penalty)` (severity-weighted
>      penalty, capped at 6). Leave per-row `count`/`severity`/`element`/`detail` untouched.
> 3. **Add/extend a unit test** proving it regardless of case: CLEAN input (no negative signals, no
>    injections) → `scoreSignals === 6`; all-critical input → score near 0; score always in `[0, 6]`.
> 4. Add a one-line comment at the `scoreSignals` column + the detector return documenting:
>    `// 0–6 HEALTH score: 6 = clean, 0 = many/severe signals (settles the L40-vs-column semantics).`
>
> **Report:** state **Case A (no change)** or **Case B (repaired, with before/after)**; confirm the
> clean→6 / flagged→near-0 / in-range test passes; `npm run typecheck` green.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — V2b · collapse identical SITE-WIDE injections into one row (currently over-counts)
═══════════════════════════════════════════════════════════════════════════════

> The page shows the IDENTICAL `element` (`<!-- Injecting site-wide to the head -->
> <script type="text/javascript" id="d_track_c…`) as TWO separate "HTML comment injection" rows
> (/contact-us and /privacy-policy), and the injection count is 22 — the same site-wide head
> injection counted once per crawled page, inflating the total.
>
> In `lib/prompt-injection/detect.ts` (inside `detectNegativeAndInjection`):
> 1. When the SAME `{ pattern, element }` is detected on multiple pages, emit **ONE** row, not N. Add
>    `pagesAffected: string[]` (additive JSONB — no migration) listing the paths, and set that row's
>    `detail` to note scope, e.g. "LLM-directed instruction in an HTML comment, site-wide ({n} pages)
>    — invisible to users, readable by AI crawlers."
> 2. Apply the same collapse to negative signals (`lib/negative-signals/detect.ts`) ONLY where it's
>    genuinely the same finding repeated across pages (the SAME keyword term on N pages collapses;
>    DIFFERENT terms stay separate — "Keyword stuffing · 'plumbing'" and "· 'your'" must remain two
>    rows).
> 3. **If you are unsure whether a given pattern is site-wide-vs-per-page by design, do NOT guess —
>    leave it per-page and flag it in your report for Sri to decide.**
> 4. This must keep STEP 1's invariant: after de-dup, re-confirm clean→6 / flagged→near-0 still holds
>    (the count the score derives from may legitimately drop; the polarity must not).
> 5. UI: render `pagesAffected` where present ("found on N pages" / "site-wide") in
>    `signals-detail.tsx` / SignalsAudit. Keep the V2a disambiguated titles, severity badges, and the
>    `element` mono block as-is.
>
> **Report:** identical site-wide injections now render as ONE row with a "site-wide / N pages" note;
> the injection count reflects de-duped findings; list any pattern you left per-page pending Sri's
> decision; `npm run typecheck` + detector tests green.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — V4 · align the CTA-overload copy number with the detector threshold
═══════════════════════════════════════════════════════════════════════════════

> The CTA-overload row reads "…above the recommended maximum of **6**" but the detector fires at
> **>7** (canon: CTA overload `>7 = warning; >12 = critical`). The displayed number must match the
> rule that fired.
>
> In `lib/negative-signals/detect.ts`, in the CTA-overload `detail` template:
> - from: "{n} calls-to-action on {path} — above the recommended maximum of 6."
> - to:   "{n} calls-to-action on {path} — above the recommended maximum of 7."
> Do NOT change the detection threshold (canon's `>7` stays) — only the human copy. While here, check
> the other `detail` templates' numbers match their canon thresholds (thin content <300, keyword
> stuffing >3%) and align any that don't.
>
> **Report:** the CTA row copy says 7; other template numbers match their thresholds; update any test
> asserting the old "6" string; `npm run typecheck` green.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Order is intentional:** V1 first (it's a correctness check; likely Case A = no change, but the
  proof is the deliverable), then V2b (whose de-dup must not disturb V1's polarity), then V4 (trivial
  copy). All three are independent enough to verify separately.
- **V2b is the one judgement call** — the prompt de-dups only genuinely-identical findings and flags
  anything ambiguous, so the borderline site-wide-vs-per-page cases come back to you.
- V2a (row titles) is already done — not repeated here.
