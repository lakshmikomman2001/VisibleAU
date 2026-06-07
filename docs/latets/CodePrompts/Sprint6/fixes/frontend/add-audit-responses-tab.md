# Claude Code — add a "Responses" (evidence) tab to the Audit Results page

## Context

The Audit Results page (`app/(auth)/audits/[auditId]/page.tsx`) now renders the rich analysis
(multidimensional breakdown, per-engine, sentiment, competitor, Action Center). The raw citations —
the actual LLM responses — were dropped when we matched the prototype's Rich layout. They are still
in the DB and still power every number on the page, but they need to come back **as evidence**,
because the actual response text is the proof behind the score (an Agency client asking "says who?"
needs to see the real ChatGPT/Perplexity text where the brand was or wasn't mentioned).

Add them as a **tab**, not a flat list and not a collapsible section. Rationale: an Agency audit is
**200 citations** (4 engines × 10 prompts × 5 runs), so the evidence needs filters and must not bloat
or slow the analysis page. A URL-driven tab keeps the analysis page fast (responses fetched only when
the tab is open), scales to 200+, and is shareable/bookmarkable.

This is **frontend only** — no schema or API changes. Keep all existing auth / `setRlsContext` /
UUID-guard / fetch wiring.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 1 — QUICK INVESTIGATE AND REPORT (no code changes)
═══════════════════════════════════════════════════════════════════════════════

1. Confirm the file that renders this screen is `app/(auth)/audits/[auditId]/page.tsx` (the one with
   the "Audit #N" header + the multidimensional breakdown). If a second audit-detail route exists,
   say which this screen uses; edit that one.
2. Is a citations list still present in that file (e.g. below the Action Center), or was it removed?
   Report.
3. Report the EXACT citations columns from the Drizzle schema. Confirm names for:
   `engine, brandMentioned, position, responseSnippet (or response/responseText), scoreSentiment,
   citedSources, promptText (or prompt), runNumber`. Use the real names in Phase 2.
4. Report the page's current structure (does it already read `searchParams`? Is it `async`?).

→ Report 1–4, then proceed.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 2 — IMPLEMENT THE TABS (URL-driven, server-first)
═══════════════════════════════════════════════════════════════════════════════

### Tab mechanism — use a URL search param (do NOT fetch responses unless the tab is open)
- The page already receives `params`; also read `searchParams`. Use `searchParams.tab` with default
  `"analysis"`. Valid values: `analysis`, `responses`.
- Render a tab bar directly under the header (above the content), with two tabs: **Analysis** and
  **Responses**. Each tab is a Next.js `<Link>` that sets the `tab` search param and preserves the
  audit route, e.g. `href={`?tab=analysis`}` / `href={`?tab=responses`}`, with `scroll={false}`.
- Style the active tab per the design tokens: active = `var(--text-primary)` text with a
  `2px solid var(--accent-blue)` bottom border; inactive = `var(--text-secondary)`, transparent
  border, hover to `var(--text-primary)`. This is a server component — no JS handlers; the `<Link>`
  navigation drives the tab. Show a citation count on the Responses tab label,
  e.g. `Responses ({totalCitations})`.

### Analysis tab (default)
- Move ALL the existing rich content (multidimensional breakdown, 3-col grid, Action Center) so it
  renders only when `tab === 'analysis'`. No other change to it.
- The summary header (brand name, composite score + CI, meta line) stays ABOVE the tab bar so it's
  visible on both tabs.

### Responses tab (the evidence)
Render only when `tab === 'responses'`. Fetch citations here (lazy — this query must NOT run on the
analysis tab). Use the real column names from Phase 1.

1. **Summary line** at the top of the tab:
   `Brand mentioned in {mentionedCount} of {totalCount} responses ({mentionRate}% mention rate)`.

2. **Filters** — also URL search params so they're server-rendered and shareable:
   - Engine: `searchParams.engine` ∈ `all | chatgpt | claude | gemini | perplexity` (default `all`).
     Render as a row of `<Link>` pills (All / ChatGPT / Claude / Gemini / Perplexity via
     ENGINE_DISPLAY), active pill highlighted. Each link sets `engine=` and keeps `tab=responses`.
   - Status: `searchParams.status` ∈ `all | mentioned | not_mentioned` (default `all`). Same pill pattern.
   - Apply the filters in the WHERE clause of the citations query (don't filter in JS after fetching
     all rows).

3. **Pagination** (200 citations — do not render all at once): `searchParams.page` (default 1),
   page size 25. Use `.limit(25).offset((page-1)*25)` and a total count for the filtered set. Render
   simple Prev / Next `<Link>`s that preserve `tab`, `engine`, `status` and change `page`. Disable
   Prev on page 1 and Next on the last page.

4. **Citation card** — one per row, following the prototype's evidence style (the Sprint-2 "Raw
   citations" card is the reference): 
   - Top row: a mention badge — `Badge tone="success"` "Mentioned · Position #{position}" when
     `brandMentioned`, else `Badge tone="danger"` "Not mentioned"; next to it the engine via
     `ENGINE_DISPLAY[engine] ?? engine` (so "ChatGPT", not "chatgpt").
   - The prompt text, quoted, in `text-[13px] font-medium var(--text-primary)`.
   - The response text (`responseSnippet`/response column) in `text-[12px] leading-relaxed`
     `var(--text-secondary)`, with a left accent border (`pl-3 border-l-2`,
     `borderColor: var(--accent-blue)`).
   - If `citedSources` is present (JSONB), render the source domains/links beneath the response as
     small chips (`text-[11px]`, `var(--text-tertiary)`).
   - Use exact design tokens throughout; cards in one wrapping `Card` or as stacked bordered rows,
     matching the existing citation styling already in the app.

5. **Empty state**: if the filtered set is empty, render a centered muted message
   (e.g. "No responses match these filters.") — never a blank tab.

ENGINE_DISPLAY map (reuse if already defined on the page):
```typescript
const ENGINE_DISPLAY: Record<string, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini', perplexity: 'Perplexity',
};
```

### Constraints
- Server component; no client JS for tabs/filters/pagination (all via `<Link>` + searchParams).
- The citations query (and its count) runs ONLY when `tab === 'responses'` — keep the analysis tab fast.
- Filtering + pagination happen in SQL (WHERE / LIMIT / OFFSET), not in JS — no N+1, no fetch-all.
- RLS/auth wiring unchanged; cross-org still 404s.
- Exact design tokens; no bare hex.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 3 — VERIFY
═══════════════════════════════════════════════════════════════════════════════
- Default load shows the Analysis tab (rich breakdown) exactly as before; no responses query ran.
- Clicking "Responses" shows the summary line, filters, and paginated citation cards with real
  engine names and mention/position badges.
- Engine and status filters change the list and the URL; pagination Prev/Next work and preserve filters.
- The Analysis tab still renders fast (confirm the citations query does not run on it).
- `pnpm typecheck` and `pnpm lint` clean.

## Report back
Summarise: the file edited; the real citations column names used; confirmation the responses query is
gated to the Responses tab; and a note that filters/pagination are SQL-side. Paste a screenshot-free
description of both tabs rendering.
