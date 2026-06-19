# Sprint 7 LLD Addendum — Per-page SSR persistence + dedicated Signals sub-page
# Pins to: sri-visibleau-sprint-7-prompt.md (Module 5b) and visibleau-foundations-v1.12.md
# Origin: Sprint 7 Gate-2 UI validation (D3). Two decisions taken:
#   C2 → extend findings.content + crawler for real per-page SSR (full prototype table).
#   C4 → dedicated Signals page; back-fill the LLD route.
# This addendum is canon. Fold it into the Sprint 7 prompt and bump its changelog (entry at the end).
# Both build prompts (backend, then UI) pin to THIS addendum.

---

## PART A — Per-page SSR (resolves C2 and the prototype-vs-LLD conflict)

**The conflict being resolved.** The prototype `SsrCheck` (lines 2907–2961) renders a status card +
a multi-row **page-by-page table** (`/`, `/services`, `/about`, `/areas`, `/emergency`, `/reviews`)
with columns *JS-disabled content % · Critical CTAs · Schema visible · Status*. The LLD's SSR method
(EF2 fix, ~lines 224–238) runs **homepage-only**, and the canonical `findings.content` shape (EB5 fix)
persists **no SSR detail at all** — not per-page data, not the homepage ratio, not the ssr-vs-capsule
score split. So the prototype table had no backing data. C2 resolves this by promoting SSR to a
real per-page check.

### A1 — Replace the EF2 "homepage-only" rule
In §4 `lib/technical-audit/ssr-check/per-page.ts`, the EF2 fix comment currently says:

> `# Run ONCE per domain on the homepage only (not all 20 pages):`

Replace with:

> `# Run on the homepage + up to 7 priority pages (cap 8 total), to back the page-by-page UI table.`
> `# "Priority pages" = homepage first, then the highest-priority crawled internal pages`
> `#   (primary-nav targets / highest internal-inlink count), deduped, capped at 8.`
> `# Reuse a SINGLE js context and a SINGLE no-js context across all pages (do not spawn`
> `#   a context per page). Bounded concurrency: process pages in batches of 3 (Promise.all`
> `#   per batch) to cap peak Playwright memory.`
> `# Per page: render with JS and without JS, then compute:`
> `#   jsDisabledContentPct = Math.round((noJsText.length / jsText.length) * 100)`
> `#   schemaVisible        = no-js DOM contains <script type="application/ld+json"> (non-empty)`
> `#   criticalCtas         = CTA candidates present in the no-js DOM vs the js DOM:`
> `#                          candidates = tel: links + mailto: links + <form> + buttons/anchors`
> `#                          whose text matches /book|quote|contact|call|enquire|get started/i`
> `#                          'yes'     if noJsCtaCount >= jsCtaCount (all CTAs server-rendered)`
> `#                          'partial' if 0 < noJsCtaCount < jsCtaCount`
> `#                          'no'      if noJsCtaCount === 0`
> `#   status = 'ok' if jsDisabledContentPct >= 70 && criticalCtas === 'yes' && schemaVisible`
> `#            else 'review'`

**Cost note (flag for Sri):** this adds ≤7 extra lightweight no-JS renders per audit beyond the
homepage. With the cap at 8 priority pages and a shared no-js context, the crawler cost rises modestly
(homepage-only ≈ baseline; 8 pages ≈ +a few cents of Playwright/bandwidth). The per-audit budget stays
inside the existing **<US$3.50** ceiling. If you want it tighter, lower the cap to 6.

### A2 — Extend the `findings.content` shape (EB5 fix)
The canonical `content` block in the `findings` JSONB type definition is currently:

```
//   content: {
//     score: number,  // /12
//     wordCount: number, answerCapsulesFound: number, answerCapsulesSuggested: number,
//     negativeSignals: Array<{ pattern: string, severity: 'critical'|'warning'|'info', count: number }>,
//     promptInjections: Array<{ pattern: string, severity: 'critical'|'warning'|'info', element: string }>
//   },
```

Add an `ssr` sub-object (everything else unchanged):

```
//   content: {
//     score: number,  // /12  (UNCHANGED formula — see A3)
//     wordCount: number, answerCapsulesFound: number, answerCapsulesSuggested: number,
//     ssr: {
//       healthy: boolean,        // pages.every(p => p.status === 'ok')
//       pagesChecked: number,    // 1..8
//       pages: Array<{
//         path: string,                                  // '/', '/services', …
//         jsDisabledContentPct: number,                  // 0..100
//         criticalCtas: 'yes' | 'partial' | 'no',
//         schemaVisible: boolean,
//         status: 'ok' | 'review'
//       }>
//     },
//     negativeSignals: Array<{ pattern: string, severity: 'critical'|'warning'|'info', count: number }>,
//     promptInjections: Array<{ pattern: string, severity: 'critical'|'warning'|'info', element: string }>
//   },
```

This is a JSONB shape change only — **no migration, no column change** (`findings` is already
`jsonb`). Older rows without `content.ssr` must be tolerated by the UI (render an EmptyState / "Re-run
audit" when `content.ssr` is absent).

### A3 — Scoring is UNCHANGED (deliberate, for composite/rollup safety)
`scoreContent` (/12) **keeps** the EG1 formula: `ssrScore(0-6) + capsuleScore(0-6)`, and `ssrScore`
is still derived from the **homepage** ratio only (`pages[0]`, which is always the homepage). The new
per-page array is **presentational** and drives the `healthy` flag; it does **not** feed the /6
ssrScore, the /12 `scoreContent`, the `scoreComposite`, or `rollupTo5Categories`. This keeps the
100-pt composite and the 5-category rollup byte-for-byte identical — the change is purely additive.

### A4 — Crawler + tests
- `inngest/functions/technical-audit-run.ts`, the `step.run('score-ssr', …)` step (~lines 870–883):
  iterate the priority-page set per A1, persist `findings.content.ssr` per A2. `ssrScore` for the
  /6 is computed from `pages[0]` (homepage) exactly as today.
- `tests/unit/ssr-check/per-page.test.ts`: extend to assert the multi-page array shape, the
  `status`/`criticalCtas`/`schemaVisible` derivations, and `healthy = every status ok`.

---

## PART B — Dedicated Signals sub-page (resolves C4)

**Important data fact (this caused a fetch bug in the first draft).** The negative-signals and
prompt-injection **detail arrays live under `findings.content`** (`content.negativeSignals`,
`content.promptInjections`). The `findings.signals` key is **`{ score }` only**. The Signals page
therefore reads the arrays from `content` and the /6 from the `scoreSignals` column — it does **not**
read a `signals` findings key for detail.

### B1 — Add the route to the project structure (§4)
Under `app/(auth)/brands/[brandId]/`, the sub-page list currently has six entries
(`technical-audit`, `llms-txt-generator`, `schema-audit`, `ssr-check`, `answer-capsules`,
`robots-txt-config`, `brand-entity-audit`). Add a seventh sub-page:

```
├── signals/page.tsx                          # NEW — negative signals + prompt injection (Signals /6)
```

### B2 — Update the EG3 sub-page fetch note
The EG3 fix comment says *"All 6 sub-pages read from technical_audits.findings"*. Update the count to
**7** and add the signals mapping. The findings-key-per-page list gains an explicit note:

> `# signals/page.tsx reads findings.content (negativeSignals + promptInjections arrays)`
> `#   and the scoreSignals column for the /6 — NOT a findings.signals key (that is score-only).`

Fetch pattern (mirrors the other sub-pages):

```
export default async function SignalsPage({ params }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');
  await setRlsContext(db, currentUser.organizationId);
  const [techAudit] = await db.select({
      id: technicalAudits.id, findings: technicalAudits.findings,
      scoreSignals: technicalAudits.scoreSignals, crawledAt: technicalAudits.crawledAt })
    .from(technicalAudits).where(eq(technicalAudits.brandId, params.brandId))
    .orderBy(desc(technicalAudits.createdAt)).limit(1);
  if (!techAudit) return <EmptyState message="Run a technical audit first." />;
  const content = techAudit.findings.content ?? {};
  return <SignalsView
            negativeSignals={content.negativeSignals ?? []}
            promptInjections={content.promptInjections ?? []}
            score={techAudit.scoreSignals}
            crawledAt={techAudit.crawledAt} brandId={params.brandId} />;
}
```

### B3 — Component + nav
- New component `components/domain/technical/signals-detail.tsx` (renders the two sections). The LLD
  component list (~lines 449–455) had no signals component — this is the first one.
- Add a **"Signals"** entry to whatever sub-page nav/tab strip the technical sub-pages use, in the
  same place `ssr-check`, `schema-audit`, etc. appear.

### B4 — No schema change
`scoreSignals` (column) and `content.negativeSignals` / `content.promptInjections` (JSONB) already
exist and are already persisted by the Inngest run. Part B is **presentation only**.

---

## Changelog entry to paste into the Sprint 7 prompt
```
- v2.x (19 Jun 2026): Sprint 7 Gate-2 UI addendum (SSR per-page + Signals sub-page).
  (C2) SSR promoted from homepage-only to homepage + up to 7 priority pages (cap 8); EF2 rule
       replaced; findings.content gains an `ssr` sub-object (healthy/pagesChecked/pages[]); scoring
       UNCHANGED (ssrScore still homepage-derived; composite + rollup byte-identical). Backs the
       prototype SsrCheck page-by-page table.
  (C4) New 7th sub-page `signals/page.tsx` (Signals /6) reading content.negativeSignals +
       content.promptInjections + scoreSignals column; new signals-detail.tsx component; sub-page nav
       gains "Signals". Presentation only — no schema change. EG3 "6 sub-pages" → "7"; clarified that
       signals detail is under findings.content, not findings.signals.
```
