# Gate-2 DELTA Findings (Part C / E1) — VisibleAU Sprint 7: per-page SSR + Signals
# Reviewer: independent reviewer chat | Date: 19 Jun 2026
# Scope: the Part C delta ONLY (the additive `detail` field resolving E1 as option b) on a change set
#   that already PASSED Gate-2 pass 2. Not a full re-review.
# Canon verified by grep (UNMODIFIED): sri-visibleau-sprint-7-prompt.md (1130 lines),
#   visibleau-foundations-v1.12.md, visibleau-prototype.jsx (4661 lines).

---

## 1. VERDICT — PASS (the delta is build-ready)

Part C is faithful to canon, strictly additive, scoring-safe, and introduces no regression. E1 is
now resolved (option b — readable per-row `detail`), and the count-vs-0-10 ambiguity (E1b) is
correctly settled against canon rather than papered over. The change set is build-ready.

---

## 2. DELTA CHECKS (D1–D7)

- **D1 — additive, not destructive — PASS.** Part C C1 adds `detail: string` to BOTH arrays while
  keeping the existing fields: `negativeSignals[]` → `{ pattern, severity, count, detail }`,
  `promptInjections[]` → `{ pattern, severity, element, detail }`. `count` and `element` are
  untouched (canon G1: S7 L572–573). Does not repeat the S7S-01 class — the prototype v3 has zero
  `name:` field defs.
- **D2 — emit in the right place — PASS.** `detail` is produced by `detectNegativeAndInjection(crawl)`
  via `lib/negative-signals/detect.ts` + `lib/prompt-injection/detect.ts`, inside the existing
  `step.run('score-signals', …)` step (canon G2: S7 L878; G3: the detectors at L133/L307/L337 with
  EE2/EE3 already specifying all 8+8 patterns' thresholds/selectors). So emitting `detail` reuses
  numbers already computed — no new detection logic, no re-run, nothing near the scoring path.
- **D3 — descriptive-only (no scoring impact) — PASS.** Part C C4 and Phase-1 step 7 both state
  `detail` must NOT feed `scoreSignals`/`scoreComposite`/rollup; step 7's verify block asserts
  `scoreContent`, `scoreSignals`, `scoreComposite`, and the 5-cat rollup are unchanged on an unchanged
  site. Structurally guaranteed anyway (see invariant 1).
- **D4 — no migration — PASS.** `findings` is already `jsonb`; `detail` is an additive key. Part C
  states no migration in four places; correct.
- **D5 — render + fallback — PASS.** Prototype v3 renders `detail` on both row types (negative:
  pattern + severity + detail; injection: pattern + severity + detail + `element` mono); build FIX 2
  matches. Older rows without `detail` tolerated (UI falls back to pattern + severity). Prototype
  still uses canon fields — the pass-2 field reconciliation is intact.
- **D6 — fixture — PASS.** Phase-1 step 7 extends the Marrickville fixture so `negativeSignals[]` /
  `promptInjections[]` rows carry a realistic `detail` (UI checkable without a live crawl).
- **D7 — C5 (count vs 0-10) sound — PASS (verified against canon).** C5 keeps `count` as the
  occurrence count (S7 L572) and treats L40's "Each scored 0-10" as the detectors' INTERNAL
  per-pattern scoring that aggregates into the /6 — not a persisted per-row value. I confirmed this
  is correct from the detector spec: EE2 (S7 L307+) computes a per-pattern **count + severity** (e.g.
  CTA overload ">7 = warning, >12 = critical"), and the `/6` `scoreSignals` column (L534) is
  populated by `signals.score` (L891) — the aggregation, not a per-row 0-10. So L40 and L572 describe
  **different things** (internal pattern score vs persisted occurrence count); there is no true
  contradiction, and `detail` is simply the readable copy. C5's "optionally clarify the L40/L572
  prose" is a nice-to-have, not required. **No fix needed.**

---

## 3. INVARIANT RE-CONFIRM (the four — re-checked because the delta touches a backend step + findings shape)
1. **Scoring byte-identical — PASS (structurally guaranteed).** Scores flow through COLUMNS:
   `scoreComposite` sums `signals.score` (S7 L884); the rollup reads the `scoreSignals` column (L376).
   `detail` is a descriptive JSONB key → it cannot move any score, and step 7 asserts unchanged scores.
2. **Signals page reads `findings.content` + `scoreSignals` column — PASS.** Unchanged fetch (addendum
   B2); now also reads `detail` from the same `content` arrays. Still never reads `findings.signals`
   for detail.
3. **No DB migration — PASS.** Additive JSONB key only.
4. **Route detected, not assumed — PASS.** Untouched by this delta (Phase-2 "ROUTE CHECK FIRST"
   intact).

---

## 4. NO-REGRESSION SPOT-CHECK
- **Part C vs Part B vs changelog — consistent.** B4 now reads "Part C (below) adds one additive field
  (`detail`)… additive JSONB, no migration, no scoring change"; the changelog gained the (E1) bullet.
  No contradiction.
- **Phase-1 step 7 vs steps 1–6 — no conflict.** Step 7 is the signals-`detail` concern; steps 1–6
  are the SSR-per-page concern. Separate findings keys, separate detectors; run-order unaffected.
- **Part A scoring guardrail — intact.** "Scoring is UNCHANGED" still present; the verify block now
  correctly lists `scoreSignals` alongside `scoreContent`/`scoreComposite`.
- **Prototype v3 design-system consistency — intact.** PageShell/Card/Badge, design tokens, the
  0/6-red danger treatment all present; the field rename from pass 2 holds (no `name:` defs); `detail`
  is now a real rendered field, not a phantom.

---

## 5. NEW FINDINGS
None. The delta is clean. (Optional, non-blocking: if Sri wants canon tidy, add one sentence to the
S7 L40 / L572 prose noting "the per-pattern 0-10 is internal to the detectors; `count` is the
persisted occurrence count; `detail` is the display copy" — but C5 already records this, so it's
cosmetic.)

---

## 6. HAND-BACK — the change set is build-ready
With Part C verified, the full change set is ready to fold into canon and build. When folding in, Sri:
1. **Apply the SsrCheck prototype patch** (`prototype.jsx` ~L2920: "All 8…" → "All 6…").
2. **Fold in SignalsAudit v3** after `SsrCheck` (~L2961); register `'signals'` after `'brand-entity'`
   (~L4583); add the "Signals" nav entry.
3. **Apply the addendum** (Part A SSR-per-page, Part B Signals page, **Part C `detail`**) to the
   Sprint 7 prompt; paste the changelog (now incl. the E1 bullet).
4. **Run order:** Phase 1 (backend — SSR per-page + the `detail` emit + the Marrickville fixture) →
   verify `content.ssr.pages[]` populates AND `negativeSignals[]`/`promptInjections[]` rows carry a
   non-empty `detail` AND scores unchanged → Phase 2 (UI: SSR table + Signals page rendering `detail`).
5. **No open escalations remain** — E1 is resolved (option b); E1b (count vs 0-10) is settled by C5.

— End of delta findings.
