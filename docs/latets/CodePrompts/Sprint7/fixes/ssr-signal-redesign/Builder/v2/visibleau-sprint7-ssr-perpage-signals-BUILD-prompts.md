# VisibleAU — Sprint 7: per-page SSR + Signals page — BUILD prompts (run in order)
# Pins to: visibleau-sprint7-ssr-perpage-signals-LLD-addendum.md (Parts A & B).
# TWO prompts below. Run PHASE 1 first (backend: makes findings.content.ssr real), verify it
# populates, THEN run PHASE 2 (UI). Each block between the ─── rulers is a standalone paste.
# Both: TS strict, no `any`; design tokens only; existing page tiers unchanged; both light/dark themes.

═══════════════════════════════════════════════════════════════════════════════
PHASE 1 — BACKEND (run first)   ·   per-page SSR persistence
═══════════════════════════════════════════════════════════════════════════════

> You are extending the Technical Audit's SSR check from homepage-only to a per-page check, and
> persisting the result so the UI can render a page-by-page table. Authority: the LLD addendum
> Part A (A1–A4). This is additive — **scoring must not change**.
>
> **1. Extend the SSR check (`lib/technical-audit/ssr-check/per-page.ts`)** to run on the **homepage +
> up to 7 priority pages (cap 8 total)**. Priority = homepage first, then the highest internal-inlink
> / primary-nav crawled pages, deduped, capped. Reuse **one** js context and **one** no-js context
> across all pages (not one per page); process in batches of 3 (`Promise.all` per batch). Per page
> compute:
> - `jsDisabledContentPct = Math.round((noJsText.length / jsText.length) * 100)`
> - `schemaVisible` = no-js DOM contains a non-empty `<script type="application/ld+json">`
> - `criticalCtas` from CTA candidates (tel: + mailto: links + `<form>` + buttons/anchors matching
>   `/book|quote|contact|call|enquire|get started/i`): `'yes'` if `noJsCtaCount >= jsCtaCount`,
>   `'partial'` if `0 < noJsCtaCount < jsCtaCount`, `'no'` if `noJsCtaCount === 0`
> - `status = 'ok'` if `jsDisabledContentPct >= 70 && criticalCtas === 'yes' && schemaVisible`, else `'review'`
>
> **2. Persist into `findings.content.ssr`** (JSONB shape change only — `findings` is already `jsonb`,
> no migration):
> ```
> ssr: {
>   healthy: boolean,        // pages.every(p => p.status === 'ok')
>   pagesChecked: number,
>   pages: Array<{ path: string, jsDisabledContentPct: number,
>                  criticalCtas: 'yes'|'partial'|'no', schemaVisible: boolean, status: 'ok'|'review' }>
> }
> ```
> `pages[0]` is always the homepage. Do not remove or alter `content.score`, `content.wordCount`,
> `content.answerCapsulesFound/Suggested`, `content.negativeSignals`, `content.promptInjections`.
>
> **3. Wire it in `inngest/functions/technical-audit-run.ts`** at the `step.run('score-ssr', …)` step:
> produce and persist `findings.content.ssr` per above.
>
> **4. Scoring UNCHANGED.** `scoreContent` (/12) stays `ssrScore(0-6) + capsuleScore(0-6)` with
> `ssrScore` derived from the **homepage** (`pages[0]`) ratio exactly as today. The per-page array is
> presentational + drives `healthy`; it must **not** feed `ssrScore`, `scoreContent`,
> `scoreComposite`, or `rollupTo5Categories`. After your change, a re-run on an unchanged site must
> yield the **same** `scoreContent`, `scoreComposite`, and 5-category rollup as before.
>
> **5. Tests** (`tests/unit/ssr-check/per-page.test.ts`): assert the multi-page array shape, the
> `status` / `criticalCtas` / `schemaVisible` derivations, and `healthy === pages.every(status==='ok')`.
>
> **6. Validation fixture (so the UI can be checked without a live crawl).** Extend the existing mock
> brand used for the Schema-audit validation (Marrickville Dental Studio) so its latest
> `technical_audits.findings.content.ssr` holds a realistic 6-page array — e.g. five `ok` pages
> (homepage/services/about/areas/emergency at 88–98%, Yes, Yes) and one `review` page (`/reviews` at
> 76%, Partial CTAs, schema No) — matching the prototype's example. Provide it the same way the Schema
> mock fixture is seeded.
>
> **Verify before reporting done:**
> - Re-running a technical audit (or the seed) populates `findings.content.ssr.pages[]` (1–8 rows) with
>   `pages[0].path === '/'`.
> - `scoreContent`, `scoreComposite`, and the 5-category rollup are unchanged on an unchanged site.
> - `npm run typecheck` and the SSR unit tests pass.
> Report the files changed.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
PHASE 2 — UI (run after Phase 1 verifies)   ·   SSR table + new Signals page
═══════════════════════════════════════════════════════════════════════════════

> You are restructuring the SSR sub-page and adding a new Signals sub-page. Authority: prototype
> `SsrCheck` (lines 2907–2961) for the SSR page; LLD addendum Part B for the Signals page. Presentation
> only — no schema/scoring change.
>
> **ROUTE CHECK FIRST (do this before editing).** The LLD's canonical routes are
> `app/(auth)/brands/[brandId]/ssr-check/page.tsx` and a new sibling `…/signals/page.tsx`. Grep the
> repo for the **actual** SSR sub-page path the build uses (it may be `/technical/ssr` or `/ssr-check`).
> Apply FIX 1 to whatever the real SSR route is, and create the new Signals page as a **sibling using
> the same convention** (if SSR lives at `…/technical/ssr`, the Signals page is `…/technical/signals`;
> if at `…/ssr-check`, it's `…/signals`). State which routes you found and used.
>
> ### FIX 1 — Rework the SSR sub-page into the real SSR check
> **Remove** (they move / don't belong here): the Negative Signals section, the Prompt Injection
> Detections section, the answer-capsule KPI cards, and the **"6/12" header** (that's the combined
> Content dimension score — it stays on the overview; SSR health is shown by the status card).
> **Add** (matching the prototype, now backed by `findings.content.ssr`):
> 1. **Status card** — `CheckCircle2` (green) + "SSR healthy" + "All {pagesChecked} critical pages
>    render content server-side" when `content.ssr.healthy`; else `AlertCircle` (amber) +
>    "{n} pages need review" where n = pages with `status==='review'`.
> 2. **"Page-by-page check" table** — columns **Page · JS-disabled content · Critical CTAs ·
>    Schema visible · Status**, one row per `content.ssr.pages[]`: `path` in mono;
>    `jsDisabledContentPct` as `{n}%`; `criticalCtas` → Yes/Partial/No; `schemaVisible` → Yes/No;
>    `status` → `Badge` with dot, `OK` (success) for `'ok'`, `Review` (warning) for `'review'`.
> If `content.ssr` is absent (older audits), render the EmptyState ("Re-run the technical audit to see
> SSR results."). Header: title **"Server-side rendering check"**; subtitle **"Many LLM crawlers don't
> execute JavaScript. We check if your most-important content is visible without JS."**; breadcrumb
> leaf **"SSR check"**.
>
> ### FIX 2 — New Signals sub-page  (`…/signals`)
> Carries the **Signals /6** dimension. **Match the `SignalsAudit` prototype component** (now folded
> into the canonical `prototype.jsx`, registered as the `'signals'` route) — same PageShell/Card/Badge
> system, score block, two sections, and the 0/6-red treatment as the other sub-pages. Reuse the
> Negative Signals + Prompt Injection sections being removed from the SSR page where they fit the
> prototype (relocate, don't rebuild). **Data source (critical):** read `findings.content.negativeSignals` and
> `findings.content.promptInjections` (the arrays live under `content`), and the **`scoreSignals`
> column** for the /6 — there is **no** `findings.signals` detail key.
> **Layout:**
> - Header: title **"Negative signals & prompt injection"**; subtitle e.g. "Spam, manipulation, and
>   injected content that erode AI trust in your site."; breadcrumb leaf **"Signals"**. Show the
>   **Signals /6** score top-right (same treatment as other sub-pages). **Render it red
>   (`var(--accent-red)`) in the danger band — 0/6 must be red.**
> - **"Negative Signals ({n})"** — one row per `negativeSignals[]`: `pattern` + a `WARNING` (amber) /
>   `CRITICAL` (red) badge from `severity` + the `count` detail on the right.
> - **"Prompt Injection Detections ({n})"** — one row per `promptInjections[]`: `pattern` + severity
>   badge + the `element` (truncated) on the right.
> - Empty arrays → a clean "No negative signals detected" / "No prompt injection detected" state.
> Put the markup in `components/domain/technical/signals-detail.tsx`.
>
> ### FIX 3 — Wire the overview's Signals dimension to the new page
> On the technical-audit overview, the **Signals** dimension (`/6`) links to the new `…/signals` route,
> the same way the other dimensions link to their sub-pages. If the overview rows aren't currently
> links, at least make Signals navigable. Also add **"Signals"** to the technical sub-page nav/tab strip
> alongside the other sub-pages.
>
> ### FIX 4 — Answer capsules stay on D4
> The answer-capsule KPIs removed in FIX 1 belong on the existing `answer-capsules` page
> (`AnswerCapsuleFormatter`). Confirm that page still shows them; do not re-add them to the SSR page.
>
> **Verify before reporting done:**
> - SSR page: status card + page-by-page table from `content.ssr` only; no signals/injection/capsule
>   cards; no "6/12"; the seeded `/reviews` row shows an amber **Review** badge; breadcrumb "SSR check".
> - Signals page renders at its route with the /6 score (red when 0/6), the Negative Signals section
>   (from `content.negativeSignals`), and the Prompt Injection section (from `content.promptInjections`).
> - The overview's Signals dimension navigates to the new page; the sub-page nav lists "Signals".
> - Both themes; no console errors; `npm run typecheck` passes.
> Report the routes found/used and the files changed.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Order matters:** Phase 1 makes `findings.content.ssr` real (+ seeds the mock brand so you can
  validate the UI without a live Playwright crawl); Phase 2 renders it. If Phase 2 runs first the SSR
  table will hit the EmptyState.
- **Scoring is provably untouched** — I had Phase 1 keep `ssrScore` homepage-derived and assert an
  unchanged composite/rollup, so this can't perturb the 100-pt scale or the 5-category UI.
- **Route ambiguity is handled in-prompt** — Phase 2 detects the real SSR route and mirrors it for the
  Signals sibling, rather than assuming `/technical/…`.
- After the build, send screenshots of **both** the reworked SSR page and the new Signals page and I'll
  validate them (SSR vs the prototype + the seeded table; Signals vs the design system + the 0/6-red
  convention). Then we're on to **D4 Answer capsules, D6 Brand & Entity, D7 citability**.
