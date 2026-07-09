# VisibleAU — Fan-Out Visualization: UI / Interaction Spec

**Date:** 5 July 2026 · **Owner:** Sri · **Feature:** "AI Answer Coverage" — the fan-out demo centerpiece
**Grounded in:** Phase 2 LLD v8.70 (`query_fan_out_results` schema) + prototype FIX17 (design tokens, `ConfidenceBadge`). Fan-out is **not currently rendered in FIX17** — this is a **net-new surface** in the Visibility layer, so it must follow the FIX17 token system exactly.
**Standard:** Figma-level — every token, size, state, and motion specified so Claude Code can't miss the styling.

---

## 1. Placement & purpose
- **Lives in:** `VisibilityHub` (nav id `visibility`), as a primary panel titled **"AI Answer Coverage"** with the Visibility layer accent. `<LayerBadge layer="visibility" />` in the header.
- **Purpose:** show the brand's coverage of the sub-question space AI fans a query into — the demo "aha" (the hidden questions + the client's absence in them), and the education wedge (rank ≠ citation).
- **Two complementary heroes on the hub:** the existing Visibility score ("are you recommended for the main query?") and this ("do you cover the sub-questions that drive citation?").

## 2. Data binding (real schema — no invented fields)
Binds to `query_fan_out_results` (filtered by `audit_id`, `original_prompt`, `engine`):
- `original_prompt` → the **root** query.
- one **row per sub-query**: `sub_query` (label), `sub_query_rank` (order; 1 = first), `brand_appeared` (BOOL), `brand_position` (INT, nullable), `content_similarity_score` (0.000–1.000), `above_threshold` (BOOL, `> 0.88`).
- `engine` → the fan-out is **per engine**; each engine fans out separately.
- Headline metric = the stored **`coverage_ratio`** (NUMERIC(5,2), 0–100). **Denominator honesty:** `max_fan_out_sub_queries` defaults to **12** (v3.0), so coverage renders as "**N of M** sub-questions" against the *actual* generated count — never a hidden/fixed denominator.
- **Drizzle note:** `coverage_ratio` and `content_similarity_score` are NUMERIC → returned as **strings**; `Number()`-coerce before rendering/animating (per the project's NUMERIC-as-string bug class).

**Coverage state per node (3 states, richer than binary — and color-blind safe):**
| State | Rule | Token | Icon |
|---|---|---|---|
| **Covered** | `brand_appeared && above_threshold` (and `brand_position ≤ 3` = strong) | `--score-high` #22c55e | `Check` |
| **Weak** | `brand_appeared && (!above_threshold || brand_position > 3)` | `--score-mid` #f59e0b | `Minus` |
| **Absent (gap)** | `!brand_appeared` | `--score-low` #ef4444 | `X` |

## 3. Layout (three zones, top→bottom)
```
┌───────────────────────────────────────────────────────────────┐
│  ZONE A — Coverage header:  [◐ ring 27]  "AI Answer Coverage"  │
│  3 of 11 sub-questions · leading brands 25–40% · [Confidence]  │
│  [ Query ▾ ]        [ All engines · GPT · Claude · Gem · Plx ]  │  ← selectors
├───────────────────────────────────────────────────────────────┤
│  ZONE B — Fan-out tree (HERO):                                 │
│    ┌────────┐        ╭─▶ ✓ sub-question 1        [strong]      │
│    │ ROOT   │────────┼─▶ ✕ sub-question 2   [Fix]  ← gap       │
│    │ query  │        ├─▶ ✓ sub-question 3                      │
│    │ (fans  │        ├─▶ ▬ sub-question 4        [weak]        │
│    │ into   │        ┼─▶ ✕ sub-question 5   [Fix]              │
│    │ 11)    │        ╰─▶ … (up to 12)                          │
│    └────────┘   [ vs competitor ◯ toggle ]                    │
├───────────────────────────────────────────────────────────────┤
│  ZONE C — Detail table (accessible list; also the mobile view) │
└───────────────────────────────────────────────────────────────┘
```

## 4. Design tokens (from FIX17 — theme-aware, flips on `[data-theme]`)
- **Primary accent:** `--layer-visibility` (#3b82f6 dark / #1d4ed8 light) + `--layer-visibility-soft`; subtle panel glow `--glow-visibility`.
- **Coverage:** `--score-high` #22c55e / `--score-mid` #f59e0b / `--score-low` #ef4444, each with a `color-mix(in srgb, <token> 14%, transparent)` soft fill for node backgrounds.
- **Surfaces/elevation:** panel `--surface-1`, nodes `--surface-0`, `--elevation-rest` (nodes) → `--elevation-hover` (on hover); `--focus-ring` for keyboard focus.
- **Fix action:** ties to the workflow loop step color `--step-gap` #f59e0b → `--step-draft` (the "create content" step).
- **Type:** Geist/Inter (standard — no swap); all numerics **tabular-nums + slashed-zero**; node labels 13px, root 15px semibold, score 40px bold.
- **Benchmark banding** (score ring): `--health-poor` <25 / `--health-moderate` 25–40 / `--health-good` 40–60 / `--health-great` >60.

## 5. Zone A — Coverage score header
- **Ring** (donut, 72px): sweep = `coverage_ratio`, colored by the benchmark band; center shows the number (tabular, 40px) — **no `/100`** (it's a %, matches the IntelCard `unit` convention).
- **Sub-label:** "**N of M** sub-questions covered" + a benchmark chip "leading brands 25–40%" + `<ConfidenceBadge label="confirmed|likely|hypothesis" />` (or **"Insufficient data"** state, §10). Confidence reflects sub-query count × runs — never present a single volatile pull as certainty (fan-out is ~73% dynamic).
- **Selectors (right):**
  - **Query ▾** — picks which of the audit's prompts to view; default = the highest-value/most-commercial prompt. Label truncates with tooltip.
  - **Engine segmented control** — `[ All · ChatGPT · Claude · Gemini · Perplexity ]`; "All" = aggregate coverage across engines; per-engine drills in (ties to the 4-engine story + engine-rebalance finding). Uses the same segmented pattern as the lens control.

## 6. Zone B — The fan-out tree (hero)
- **Root node** (left, vertically centered): rounded card (radius 14px, `--surface-0`, 3px left accent `--layer-visibility`), `original_prompt` (15px semibold, max 2 lines), sub-label "fans into **M** sub-questions", engine glyph(s). Fixed width ~220px.
- **Connectors:** curved SVG cubic-Bézier paths from the root's right edge to each sub-query node, fanning vertically. Stroke 1.5px `--glass-border` (rest) → the node's coverage token when its node is hovered/active. Paths draw-in on reveal (§11).
- **Sub-query nodes** (right column, stacked, ordered by `sub_query_rank`): each a pill-card (radius 10px, `--surface-0`, `--elevation-rest`, min-height 40px, padding 10×14): a state icon (14px, in the coverage color) + `sub_query` (13px, 1 line + tooltip) + rank badge (11px muted). **Absent/Weak nodes** show a `[Fix]` chip (right-aligned, `--step-gap` text on soft fill).
  - **Hover/focus:** node lifts (`--elevation-hover`), its connector + a right-side **detail popover** appear: `brand_position` ("Position 4"), `content_similarity_score` as % ("Match 72%"), `above_threshold` badge, and (if competitor overlay on) which competitors appeared here.
- **Empty branches** beyond the generated count aren't drawn (honest to `M`).

## 7. Competitor overlay (toggle — with a data flag)
- **Toggle:** "vs competitor ◯" → pick a competitor; nodes gain a **second indicator** (small dot/avatar) showing whether that competitor appeared in each sub-question. The painful cell — **you Absent + competitor Present** — is emphasized (red node, green competitor dot, subtle outline).
- **⚠ Data dependency (flag):** `query_fan_out_results` tracks only the **audited brand's** `brand_appeared` per sub-query — it does **not** currently store per-sub-query *competitor* presence. So the competitor overlay needs either (a) a pipeline/schema extension to capture competitor appearance per sub-query, or (b) an approximation from existing SoV/comparison data (lower fidelity). **MVP:** ship the brand's own coverage tree solid; competitor overlay is a **fast-follow** once competitor-per-sub-query data exists. Don't fake it — flag "competitor data coming" rather than show an unbacked overlay.

## 8. Gap → Fix interaction (the differentiator)
- Clicking **[Fix]** on an Absent/Weak node opens a right drawer: the sub-question, *why* it's a gap (position/similarity), and a **generated recommendation** ("Create a section answering '<sub_query>' with …") → **"Create task"** button that files into the existing remediation workflow (recommendation → task → draft → approval → re-audit). On re-audit, the node's state should update (gap closed = flips green). This is what turns the viz from diagnostic into remediation — the buyer's "what do I do next."

## 9. Zone C — Detail table (accessibility + mobile primary)
A semantic `<table>` mirroring the tree: columns **# (rank) · Sub-question · Coverage (icon+label) · Position · Match % · Action**. This is the keyboard/screen-reader path *and* the mobile layout (§12). Sortable by rank/coverage.

## 10. States
- **Loading:** skeleton root + 6 shimmer node rows; ring in indeterminate.
- **Insufficient data** (below sampling minimum for this query/engine): ring greyed, center "—", sub-label "**Insufficient data** — run a deeper audit", `ConfidenceBadge` = insufficient; tree shows a muted placeholder + CTA. Never a fake score.
- **Single-engine caveat:** if only one engine has fan-out data, show an inline note ("Coverage shown for ChatGPT only") — honest, and nudges the multi-engine value.
- **Error / rate-limited:** the fan-out run failed for an engine → that engine tab shows a retry affordance; other engines still render (graceful, per the 429-handling lessons).
- **All-covered (rare):** celebratory but still show weak nodes + "defend these" framing (there's always a next action).

## 11. Motion — the demo reveal sequence (respects `prefers-reduced-motion`)
This sequence *is* the demo. Trigger on panel enter (and a "Replay" affordance for live demos):
1. **Root appears** (fade+scale 150ms).
2. **Fan-out** (the "aha"): connectors draw-in + nodes stagger-in top→bottom by `sub_query_rank`, ~60ms apart, ~500ms total — "watch AI break your question apart."
3. **Coverage resolves:** nodes flip from neutral to their coverage color+icon (120ms each, slight stagger) — "here's where you show up."
4. **Score counts up:** ring sweeps + number counts 0→`coverage_ratio` (600ms).
5. **(Optional) competitor overlay** toggles on → competitor dots pop → gap cells (you-absent/comp-present) pulse once.
6. **Gaps invite action:** `[Fix]` chips fade in on Absent/Weak nodes.
- Reduced-motion: skip 2–4's animation, render final state immediately; keep it fully usable.

## 12. Responsive
- **≥900px:** full tree (Zones A/B/C).
- **600–900px:** tree compresses (shorter connectors, narrower root); detail table below.
- **<600px (mobile):** **the tree collapses to the Zone C list** — root query as a header card with the ring, then sub-questions as a vertical list of coverage rows (icon + label + Fix). The fanning tree is desktop-only; mobile leads with the list (Local-first-style clarity). Selectors become full-width.

## 13. Accessibility
- Tree nodes are `<button>`s (keyboard-focusable, `--focus-ring`), `aria-label` = "Sub-question N: '<text>', <coverage state>, <fix available>". Arrow-key navigation between nodes; Enter opens detail/fix.
- Engine control = ARIA `radiogroup` + `aria-current`; Query selector = proper listbox.
- **Color never sole signal** — every state carries an icon (Check/Minus/X) + text label. Ring value stated in text.
- Connectors/decorative SVG `aria-hidden`; Zone C table is the semantic source of truth for AT.
- Contrast: all coverage colors on their soft fills meet AA (the FIX17 light overrides are AA-tuned; verify the three coverage tokens on `--surface-0` both themes).

## 14. White-label / report parity
The report "AI Answer Coverage" section (Sprint 4) reuses this model **static**: the ring + "N of M" + benchmark, a simplified tree or the Zone C list with coverage icons, competitor comparison (when available), and the top 3–5 gap-driven fixes. Agency-branded, no VisibleAU chrome.

## 15. Build scope & data readiness
- **Ready now (backend exists):** the brand's fan-out tree, coverage ring/metric, per-node detail (`brand_position`, `content_similarity_score`, `above_threshold`), per-engine + aggregate, the denominator-honest "N of M". → the **hero build**.
- **Needs a small pipeline/UI link:** gap → recommendation → task (wire the `[Fix]` into the existing remediation loop).
- **Fast-follow / data gap:** competitor overlay (needs competitor-per-sub-query presence — §7).
- **Honesty fixes (do with this):** `Number()`-coerce the NUMERIC reads; wire the `ConfidenceBadge`; resolve the "N of M" denominator display.
- **Effort:** moderate; the visualization + motion is the main new work, everything else is surfacing existing data. High demo ROI.

---

### Bottom line
The hero is the **fan-out tree with the reveal sequence** — root query → branches fan out → coverage resolves green/amber/red → score counts up → gaps invite fixes. It's grounded entirely in the real `query_fan_out_results` data, uses the FIX17 tokens as-is, stays honest (real denominator, confidence, no faked competitor data), and turns the diagnostic into action via the gap→fix link. Build the brand's tree first (backend's ready); competitor overlay follows once its data exists.
