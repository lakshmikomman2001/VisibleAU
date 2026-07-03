# Claude Code — Sprint 3 automated tests · SECTION 3 of 5: FRONTEND UNIT (components + mock data)

Section 3 of the Sprint 3 test track. Sections 1 (Backend Unit, 80) + 2 (Backend E2E, 263, acceptance MET) are
done. Section 3 = **component unit tests** for the visibility UI, with mock/props data — **report-first**,
`LLM_MODE=mock`, tests under `tests/phase2/sprint3/` (or the existing component-test location).

> ⚠️ **CRITICAL — the SoV component renders BARS, not a donut.** The file is still named `sov-donut.tsx`, but after
> the enhancement it renders **ranked horizontal bars**. Any existing donut-specific DOM assertion (a `<circle>`, an
> SVG arc, a donut path) is STALE — replace it with a bars assertion. Do NOT assert donut internals.

## ✅ THREE-SOURCE ANCHOR (checked against LLD v8.70 + Sprint 3 prompt §6U + prototype FIX17)
- **§6U (prompt) — the frontend contract:** each screen's **STATES matrix** + **RESPONSIVE** line + **ARIA**. These
  ARE the assertions (below, per component). 6U.2 VisibilityHub, 6U.3 CitationFailureDiagnosis, 6U.4
  CompetitiveBenchmark, 6U.5 dashboard SoV strip.
- **LLD FIX 13 (ARIA, authority):** dynamic surfaces `aria-live="polite"`/`role="status"` + `aria-busy` on loading;
  visual score bars `role="img"` + `aria-label "{label}: {value} of {max}"`; tabs APG pattern (role=tab/tablist/
  aria-selected). **LLD reduced-motion:** the global `prefers-reduced-motion` reset exists (S2) — don't add motion
  that ignores it.
- **Prototype FIX17:** the component structure (LayerBadge, IntelCard, ConfidenceBadge, EmptyState) — consume the
  existing shared foundation; assert against it.
- **Enhancement reality (BE-3-era):** SoV = bars; brand highlighted by **IS-BRAND** (not rank/share); brand bar
  **visible even at 0% share**; competitors muted; `--layer-visibility` (blue); unique keys; `color-mix` faint fills
  (RT-01, no hex-alpha on var()); `tabular-nums`.
- **Conflict note:** §6U.2 says "SoV donut" but the shipped/enhanced component renders BARS (a deliberate
  prototype-alignment change). Test the BARS (current reality). This is a known, accepted drift-correction — not a
  reason to revert.

> Investigate-first: read each component + any existing component tests so assertions match real props/structure.
```bash
for f in sov-donut mention-source-matrix fan-out-tree topical-gap-list citation-failure-card competitive-benchmark-panel volatility-indicator dashboard-sov-strip; do echo "== $f =="; sed -n '1,50p' components/domain/visibility/$f.tsx 2>/dev/null; done
ls tests/**/sov-donut* tests/**/visibility* 2>/dev/null   # existing component tests (may have STALE donut assertions)
```
Use the project's component test setup (React Testing Library / vitest + jsdom, as the repo uses). Render with
mock props; assert DOM + ARIA + states. No real network/DB (this is unit-level).

---

## THE COMPONENT TESTS (per §6U + FIX 13 + enhancement)

### 1. `sov-donut.test.tsx` — RANKED BARS (⚠️ update any stale donut assertions)
- **Renders ranked horizontal bars** (NOT a donut/SVG-arc) — one bar per distinct domain, **sorted by share DESC**.
- **Brand row highlighted by IS-BRAND:** the brand's bar uses `--layer-visibility` + a "you" chip; competitors are
  muted. **Assert the highlight follows is-brand, NOT rank** — e.g. render data where a COMPETITOR has the highest
  share and the BRAND has a lower/0% share, and assert the BRAND bar is the highlighted one and the top competitor
  is muted. (This is the exact bug fixed — lock it in.)
- **Brand bar visible at 0% share:** render the brand at 0% share; assert its bar still renders with a **minimum
  visible width** (not zero-width/invisible) and the "you" chip is present. (The 4px-min-width fix.)
- Percentages render with `tabular-nums`; `unit="%"`.
- **Unique keys / no duplicate-key warning:** render data with a repeated label/domain and assert React logs no
  duplicate-key warning (composite keys hold).
- Empty/insufficient states per §6U.2 (below, shared).

### 2. `mention-source-matrix.test.tsx` — 2×2 archetype (§6U.2, MS-01)
- Renders the **four archetypes** (recognised_authority / known_but_untrusted / niche_authority / invisible); the
  brand plotted by **mention_rate × citation_rate**.
- **Active quadrant** lit by its semantic colour + a dot + the label text (meaning NOT by colour alone); inactive
  quadrants muted.
- **`mention_source_ratio` NULL → shows 'N/A'** (not '0', not a crash) → 'invisible' archetype. Assert the 'N/A'
  render for the null-ratio case (the div-by-zero UI contract).
- Metric chips (Mention/Citation/Ratio) `tabular-nums`.

### 3. `fan-out-tree.test.tsx` — sub-query rows (§6U.2)
- Renders sub-query rows; **`above_threshold` highlighted** (the accent when a row is above 0.88) vs muted when not.
- Similarity score `tabular-nums`, with a quality dot; the prompt shows the **substituted location** (no literal
  `{location}`) when provided.
- Unique keys across rows (no duplicate-key warning even when ranks repeat).

### 4. `topical-gap-list.test.tsx` — gap list (§6U.2)
- Rows **sorted by cross_prompt_impact DESC**; the **"HIGH LEVERAGE — fix this → improves N prompts" badge appears
  when cross_prompt_impact ≥ 2** and NOT when < 2 (assert both).
- Leverage badge coloured by impact; impact number `tabular-nums`.
- Empty: "No topical gaps detected" (graceful).

### 5. `citation-failure-card.test.tsx` — per-pattern card (§6U.3)
- Renders `CitationDiagnosis` fields: patternKey headline, **severity pill** (danger/warning/info by severity),
  evidence text, competitor-cited comparison, the remediation CTA (links to creating a remediation_task).
- Severity → pill colour mapping correct (high→danger, medium→warning, low→info).

### 6. `competitive-benchmark-panel.test.tsx` — CPR-01 + tiering (§6U.4)
- **comparisonData present:** renders the LLD 8896 layout ("You X% vs Them Y% ↓ gap", "Topics they own: N", "Why
  they're winning", "Your fastest path").
- **🔒 CPR-01 — comparisonData null:** renders the **"Coming soon" placeholder card, NOT an error** (assert the
  coming-soon copy + `dataAvailableFrom`; assert NO error boundary / no crash).
- **🔒 Tiering:** Starter → **locked TierGate teaser** ("[Competitor] appears 2× more… → Growth"); Growth → 1
  competitor; Agency → 3 (assert the gated render per tier, reading the tier prop/`subscriptions.tier`).

### 7. `volatility-indicator.test.tsx` (§6U.2)
- **> 15.0 → alert** state; ≤ 15.0 → normal. Assert the boundary (15.0 is NOT alert; 15.1 is).

### 8. `dashboard-sov-strip.test.tsx` — the strip (§6U.5)
- Same **bars** visual as the hub (brand highlighted by is-brand, competitors muted, `tabular-nums`, `unit="%"`).
- Renders **independent of workflow tasks** (the fix — the strip must show whenever there's a brand + SoV data, NOT
  gated behind `progress.totalTasks > 0`). Assert it renders with 0 tasks.
- Empty: "Run an audit to see share of voice".

## SHARED — STATES + ARIA + RESPONSIVE (assert per §6U + FIX 13)
For the relevant components, assert the STATES matrices:
- **loading:** section/card/strip **skeleton** with **`aria-busy`** (FIX 13).
- **empty (VisibilityHub):** EmptyState "Run an audit to see visibility intelligence"; **citation-failure** positive
  empty "No citation gaps found for this prompt set"; **strip** "Run an audit to see share of voice".
- **insufficient-data (hub):** show the metric WITH a ConfidenceBadge "Insufficient data" — **do NOT hide it**
  (assert the metric is still present + the badge).
- **error:** an error boundary state (not a raw crash).
- **ARIA (FIX 13):** dynamic/loading surfaces `aria-busy` / `role="status"` / `aria-live="polite"`; the bar visuals
  `role="img"` + `aria-label` where required; any tabs use the APG roles (role=tab/tablist/aria-selected).
- **RT-01:** no hex-alpha on `var()` (already grep-clean in §12 — a component test can assert computed styles use
  the tokens, optional).
- **RESPONSIVE:** where feasible in jsdom, assert the responsive class names are present (`grid-cols-1
  lg:grid-cols-2` on the hub; strip full-width; head-to-head wraps `<sm`). (Full responsive behaviour is Section 4
  E2E; here assert the classes exist.)
- **Themes:** components use tokens (dark + `[data-theme=light]`) — assert token usage, not hardcoded colour.

## INVARIANTS
- Assert the CURRENT reality: SoV = **bars** (not donut); highlight follows **is-brand** (not rank); brand bar
  **visible at 0%**. Replace any stale donut-DOM assertion.
- Tokens only; `tabular-nums` on numerics; no hex-alpha on var(); ARIA per FIX 13; reduced-motion respected.
- `subscriptions.tier` for tier-gated renders (competitive-benchmark), never organizations.tier.
- Unit-level: mock props, no real network/DB. `LLM_MODE=mock`. Report-first — REPORT failures, don't force green by
  weakening an assertion (only a genuine component bug gets a source fix, flagged).
- Don't regress the 263 backend tests (component tests are additive).

## VERIFY / REPORT
- Component test pass/fail counts; any STALE donut assertion found + updated to bars.
- Confirm the key guards green: SoV highlight follows **is-brand not rank**; brand bar **visible at 0%**; unique
  keys (no duplicate-key warning); mention-source **'N/A'** on null ratio; topical **HIGH LEVERAGE** badge at ≥2 not
  <2; competitive-benchmark **CPR-01 "Coming soon" (not error)** + tier gating (Starter locked / Growth 1 / Agency
  3); volatility >15.0 boundary; dashboard strip renders **independent of tasks**.
- STATES + ARIA: loading `aria-busy`, the three empty states, insufficient-data shows-not-hides, error boundary,
  FIX-13 roles/labels present.
- Any genuine component bug surfaced (flagged, minimally fixed).
- Confirm: bars-not-donut asserted; tokens/tabular-nums/ARIA; subscriptions.tier; 263 backend tests still green.

## NEXT — Section 4 (Frontend E2E)
Playwright against the DEV DB (⚠️ NOT prod — the earlier server-on-prod footgun; restart the dev server on
`visibleau` with `LLM_MODE=mock` before running). Full user flows: nav to the visibility hub (the card, now
present), the bars render with real seeded data, citation-failure CPR-01 degradation on screen, competitive-benchmark
tier states, the dashboard strip. Then Section 5 (QA / batch-script run) closes the track.
