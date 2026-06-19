# Gate-2 Findings — VisibleAU Sprint 7: per-page SSR + Signals sub-page (change set review)
# Reviewer: independent reviewer chat | Date: 19 Jun 2026
# Reviewed: the LLD addendum (Parts A & B) + the two BUILD prompts (Phase 1 backend, Phase 2 UI) +
#   the new SignalsAudit prototype component.
# Canon verified by grep (NOT trusted from the handoff): sri-visibleau-sprint-7-prompt.md (1130
#   lines), visibleau-foundations-v1.12.md, visibleau-prototype.jsx (4661 lines). F1–F10 all
#   independently confirmed (see §3).

---

## 1. VERDICT — PASS-WITH-FIXES

The change set is fundamentally sound and faithful to canon. The central architecture is correct
and provably safe: scoring flows through **columns** (`scoreContent`, `scoreSignals`,
`scoreComposite`), while the change set only extends the `findings` **JSONB** additively — so the
"scoring byte-identical" invariant holds *by construction*, not just by assertion (confirmed F4/F5
below). The two CRITICAL data-source decisions are correct: per-page SSR is presentational only,
and the Signals page reads `findings.content` (not `findings.signals`) for detail.

Three fixes are required before build — all in the change-set documents, none requiring an LLD-level
rethink: **one MODERATE** (a prototype↔canon field-name mismatch that will render blank/placeholder
data if followed literally), and **two LOW** (a stale "8 pages" in the prototype card, and a
count-of-sub-pages wording slip). One thing to escalate to Sri (the prototype `detail` copy — a
content-model question, not a build bug).

---

## 2. FINDINGS

| id | sev | what | canon location | fix |
|----|-----|------|----------------|-----|
| **S7S-01** | **MOD** | The `SignalsAudit` prototype uses field names that don't match canon: `name`/`detail` for negative signals and `name`/`detail`/`element` for injections. Canon `findings.content.negativeSignals[]` = `{ pattern, severity, count }`; `promptInjections[]` = `{ pattern, severity, element }`. There is **no `name` and no `detail`** field. The build prompt FIX 2 correctly says to render `pattern`, but it also says "match the SignalsAudit prototype" — so a builder faces a contradiction, and if they follow the prototype's `detail` they bind to a non-existent field (blank text) and `name` (undefined). | S7 prompt L572–573 (the `content` shape); prototype component item 6 (the `.map` rows) | Reconcile the prototype + the build prompt to canon's field names (see fix prompt S7S-01). |
| **S7S-02** | **LOW** | The prototype `SsrCheck` status card hardcodes **"All 8 critical pages render content server-side"** (L2920) but the table renders **6 rows**, and the fixture seeds **6 pages**. Internal 6-vs-8 mismatch carried from the prototype. | prototype `SsrCheck` L2920 (card) vs L2940–2945 (6 table rows); addendum A1 (cap 8); build Phase-1 step 6 (6-page fixture) | The build prompt FIX 1 already makes the card dynamic ("All {pagesChecked} critical pages") — correct, and it supersedes the prototype's "8". Just make the supersession explicit so no one re-hardcodes 8, and fix the stale prototype card (see S7S-02). |
| **S7S-03** | **LOW** | Addendum B1 says the sub-page list "currently has six entries" then lists **seven** route names (technical-audit, llms-txt-generator, schema-audit, ssr-check, answer-capsules, robots-txt-config, brand-entity-audit). Canon §4 confirms **7** existing sub-pages (so the new Signals page makes **8**, not 7). The EG3 "All 6 sub-pages" note (which the addendum B2 updates to "7") is *also* undercounting — canon already has 7 sub-page routes, so post-change it's 8. | S7 prompt L394–401 (7 routes listed); L403 ("All 6 sub-pages"); addendum B1/B2 | Correct the counts: existing sub-pages = 7; after adding Signals = 8. Update EG3 "6"→"8" (not "7"). See S7S-03. |

### Escalation to Sri (not a build-ready fix — a content-model decision)
- **E1 — the prototype's `detail` sentences have no data source.** The `SignalsAudit` prototype shows
  rich per-row prose ("\"plumbing\" appears at 3.9% keyword density… above the 3% threshold";
  "/reviews has 267 words — below the 300-word minimum"). Canon's `negativeSignals[]` only persists
  `{ pattern, severity, count }` — there is no field carrying that explanatory sentence. Two options
  for Sri to choose (do **not** silently pick one in the build):
  (a) **Display-only** — drop the `detail` prose; render `pattern` + `severity` + `count` (what canon
      has). Simplest, no schema/persistence change. The build prompt FIX 2 already implies this.
  (b) **Extend the data model** — add a `detail: string` (and for injections the `element` already
      exists) to `negativeSignals[]` in `findings.content`, and have `detectNegativeAndInjection()`
      (the `score-signals` step) populate it. This is a *new* LLD + crawler change beyond the current
      addendum's stated "presentation only / no schema change" scope for Part B — so it needs Sri's
      explicit sign-off and a backend prompt, not a UI-only build.
  Recommendation: (a) for this sprint (keeps Part B "presentation only" as the addendum promises);
  (b) later if the richer copy is wanted. Either way, S7S-01 must be applied so the field names match.

---

## 3. CANONICAL FACTS — INDEPENDENTLY CONFIRMED (grep, not trusted from the handoff)
All ten facts the change set relies on are TRUE in canon:
- **F1 ✓** `findings.content` = `{ score/12, wordCount, answerCapsulesFound/Suggested,
  negativeSignals[], promptInjections[] }` (S7 L569–574). The addendum adds `ssr` between capsules
  and negativeSignals — additive, nothing renamed/removed (A2 faithful).
- **F2 ✓ (CRITICAL)** `signals: { score: number }` is score-only — "aggregated from negativeSignals +
  promptInjections" (S7 L580). Confirms the Signals page MUST read `content` for detail. The
  addendum B2 + build FIX 2 both do this correctly.
- **F3 ✓** EF2 SSR is homepage-only today — "Run ONCE per domain on the homepage only (not all 20
  pages)" (S7 L223).
- **F4 ✓** `scoreContent (/12) = ssrScore(0-6) + capsuleScore(0-6)`, ssrScore from the **homepage**
  ratio (S7 L524–532).
- **F5 ✓ (the scoring-safety backbone)** `scoreContent` and `scoreSignals` are **numeric columns**
  (S7 L522, L533); `rollupTo5Categories` reads **columns** — `technicalPct = (scoreRobots +
  scoreLlmsTxt + scoreAiDiscovery + scoreSignals)/48` (S7 L376). `scoreComposite` sums the
  `*.score` returns from the Inngest steps (S7 L884), NOT `findings`. ⇒ extending `findings.content`
  **cannot** perturb any score. A3's "byte-identical" claim is structurally guaranteed.
- **F6 ✓** EG3 says "All 6 sub-pages read from technical_audits.findings" (S7 L403) — but see S7S-03
  (the real route count is already 7).
- **F7 ✓ (CRITICAL)** routes are bare: `ssr-check/page.tsx`, `brand-entity-audit/page.tsx`, **no
  `/technical/` segment**, and `ssr-check` (not `ssr`) (S7 L394–401). The build prompt's "detect the
  real route, don't assume" approach is the right call.
- **F8 ✓** components dir has `ssr-status-table.tsx` and **no** signals/injection component (S7
  L449–455) — confirms a new component is needed.
- **F9 ✓** `step.run('score-ssr', () => checkSSR(domain, crawl))` (S7 L875); `scoreComposite`
  includes `ssr.score` (S7 L884). ⇒ `checkSSR` MUST keep returning its homepage-derived `.score`
  (see the note under "Invariants" — the build must not let per-page aggregation change `ssr.score`).
- **F10 ✓** prototype `SsrCheck` (L2907) = status card + page-by-page table; registered as
  `'ssr-check'` (L4580); prototype has **no** signals component (L-none). Table is **6 rows** despite
  the card saying 8 (see S7S-02).

---

## 4. READY-TO-PASTE FIX PROMPTS

### Fix S7S-01 (MOD) — reconcile SignalsAudit + build FIX 2 to canon field names
> In the `SignalsAudit` prototype component AND the Phase-2 build prompt FIX 2, align the rendered
> fields to the canonical `findings.content` shape (S7 prompt L572–573):
> `negativeSignals[]` = `{ pattern: string, severity: 'critical'|'warning'|'info', count: number }`;
> `promptInjections[]` = `{ pattern: string, severity: 'critical'|'warning'|'info', element: string }`.
> Changes:
> 1. In `SignalsAudit`, rename each negative-signal row's `name` → `pattern`, and REMOVE the `detail`
>    field from the rendered markup (canon has no `detail`). Render: `pattern` (heading) +
>    a severity `Badge` (`critical`→danger, `warning`→warning, `info`→neutral) + `count` on the
>    right (e.g. "{count}×" or "{count} found").
> 2. In `SignalsAudit`, rename each prompt-injection row's `name` → `pattern`, REMOVE `detail`, and
>    keep `element` (canon has it) shown in the mono code block. Render: `pattern` + severity badge
>    + the `element` mono block.
> 3. Keep the score block (0/6 red in the danger band) and the "Why this matters" box as-is — those
>    don't bind to per-row fields.
> 4. In build prompt FIX 2, ensure the row spec says `pattern` + `severity` + `count` (negative
>    signals) and `pattern` + `severity` + `element` (injections) — and DELETE any instruction to
>    show a `detail`/`name` field, so the prompt and the prototype agree.
> If richer per-row prose is wanted, that is escalation E1 (a data-model change) — do NOT invent a
> `detail` field in the UI that has no backing data.
> Verify: grep the final SignalsAudit + FIX 2 for `\bname\b` and `\bdetail\b` in the signal/injection
> rows → 0; grep for `pattern` → present in both row maps.

### Fix S7S-02 (LOW) — make the SSR status-card count dynamic; fix the stale prototype "8"
> Two parts:
> 1. **Prototype** `SsrCheck` (visibleau-prototype.jsx L2920): the status card hardcodes "All 8
>    critical pages render content server-side" but the table has 6 rows. Change the literal `8` so
>    the card text reads from the data — i.e. annotate it as `All {pagesChecked} critical pages
>    render content server-side` (the prototype's sample has 6 rows ⇒ "All 6 critical pages"). This
>    removes the 6-vs-8 contradiction.
> 2. **Build prompt FIX 1** already specifies the dynamic card ("All {pagesChecked} critical
>    pages"). Add one explicit line: "This SUPERSEDES the prototype's hardcoded '8' — read
>    `content.ssr.pagesChecked`; do not hardcode any page count." So no one re-introduces 8.
> Verify: grep the final prototype `SsrCheck` for the literal `All 8 critical` → 0; the build prompt
> mentions `pagesChecked` for the card text.

### Fix S7S-03 (LOW) — correct the sub-page counts (existing = 7; after Signals = 8)
> Canon §4 (S7 prompt L394–401) already lists **7** technical sub-page routes (technical-audit,
> llms-txt-generator, schema-audit, ssr-check, answer-capsules, robots-txt-config,
> brand-entity-audit). The addendum undercounts in two places:
> 1. Addendum B1: change "the sub-page list currently has six entries" → "**seven** entries"
>    (it then correctly lists seven), and "Add a seventh sub-page" → "Add an **eighth** sub-page".
> 2. Addendum B2 + the EG3 update: the canonical EG3 note says "All 6 sub-pages" (S7 L403) but the
>    real count is already 7, so after adding Signals it is **8**. Update EG3 "6 sub-pages" → "**8**
>    sub-pages" (not "7"), and the changelog line "EG3 '6 sub-pages' → '7'" → "→ '8'".
> (No code impact — these are doc/comment counts that should be right so a future reader trusts them.)
> Verify: the addendum no longer says "six entries"/"seventh sub-page"/"→ '7'"; EG3 update reads "8".

---

## 5. INVARIANT CHECK (the four in the handoff §5)
1. **Scoring byte-identical on an unchanged site — PASS (structurally guaranteed).** `scoreContent`,
   `scoreSignals`, `scoreComposite` are columns; `rollupTo5Categories` reads columns; the change set
   only extends `findings` JSONB. ⇒ per-page SSR cannot move any score. **One guardrail (already in
   the addendum, keep it explicit):** `checkSSR()` (the `score-ssr` step, S7 L875) must keep
   returning its homepage-derived `.score`, since `scoreComposite` sums `ssr.score` (S7 L884). The
   build prompt's A4/FIX-1 wording does this; do not let per-page aggregation change `ssr.score`.
2. **Signals page reads `findings.content` (negativeSignals + promptInjections) + `scoreSignals`
   column — PASS.** Confirmed in addendum B2's fetch pattern and build FIX 2. F2 confirms this is the
   only correct source (`findings.signals` is score-only).
3. **No DB migration — PASS.** `findings` is already `jsonb` (F1); `scoreSignals` already a column
   (F5); `content.negativeSignals`/`promptInjections` already persisted by the `score-signals` step
   (F9). Both parts are additive/presentational.
4. **Route detected, not assumed — PASS.** Canonical is `ssr-check`/`signals`, no `/technical/`
   segment (F7); the Phase-2 prompt greps for the real SSR route and mirrors it for the Signals
   sibling. Correct.

---

## 6. WHAT'S RIGHT (verified, no change needed)
- The whole change set correctly resolves the original prototype-vs-LLD gap (the prototype's
  page-by-page table had no backing data) by **promoting SSR to a real per-page check** rather than
  papering over it — exactly the "LLD wins; close the gap" outcome the review rules require.
- Run order (Phase 1 backend before Phase 2 UI) is explicit and correct — Phase 1 makes
  `content.ssr` real + seeds the mock fixture so the UI is checkable without a live crawl; Phase 2
  renders it. (If Phase 2 ran first the table hits the EmptyState — the prompt notes this.)
- The `criticalCtas`/`schemaVisible`/`status`/`jsDisabledContentPct` derivations (addendum A1) are
  well-defined and internally consistent; `healthy = pages.every(status==='ok')` is consistent
  between A2, the build prompt, and the test spec.
- The cost flag (≤7 extra no-JS renders, shared no-js context, batches of 3, stays under the
  <US$3.50 ceiling) is a reasonable escalation surfaced to Sri, not buried.
- The fixture seeds 5 `ok` + 1 `review` (`/reviews` at 76%/Partial/No), matching the prototype's
  example row — good for visual validation.
- Route-map registration target is correct: `'signals'` after `'brand-entity'` (prototype L4583).

---

## 7. SUMMARY FOR THE FIXING CHAT
Apply **S7S-01** (field-name reconciliation — the only one that would actually break rendering),
then **S7S-02** and **S7S-03** (doc/prototype count corrections). Put **E1** (the `detail` prose
data-model question) to Sri before deciding whether the Signals rows show explanatory sentences;
default to display-only (`pattern`/`severity`/`count`) to keep Part B "presentation only" as the
addendum promises. After those, the change set is build-ready: scoring is provably untouched, the
data sources are correct, no migration, and the route handling adapts to the real paths.

— End of findings.
