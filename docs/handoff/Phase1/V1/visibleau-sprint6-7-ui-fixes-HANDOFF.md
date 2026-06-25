# VisibleAU Phase 1 — Sprint 6 & Sprint 7 UI Fixes (READ ME FIRST)

**For:** a fresh Claude chat picking up the Phase 1 UI-fix work for Sprints 6 and 7.
**Prepared:** 21 Jun 2026.
**Scope of this zip:** the UI fix prompts for **Sprint 6 (audit results page)** and **Sprint 7
(Technical AI Audit sub-pages)** only. This is *not* the full Phase 1 bundle — foundations, the
prototype, the 12 sprint prompts, and earlier-sprint UI fixes live in
`visibleau-phase1-bundle-2026-06-21.zip`. Phase 2 is a separate workstream and is not here.

---

## How we work (the operating discipline)

- **Two-chat relay.** This chat writes scoped fix prompts → a separate REVIEWER chat gate-checks
  them → Claude Code applies them to the Next.js repo. No repo access from here — we produce
  prompts and review built UI from screenshots.
- **A ready-to-paste Claude Code prompt per issue**, scoped to exact files, the change, and a
  verification step. Each file in this zip is one such prompt — paste it into a fresh Claude Code
  session and run it.
- **Verify each fix with a screenshot before moving to the next.** Don't trust "code reported done"
  — Phase 1 repeatedly surfaced query/label bugs that only showed on real data.
- **Presentation-only fixes never move scores.** The scoring rollup reads score *columns*, so UI
  changes can't change numbers; only a re-score/re-run can. (The one Sprint 7 item that *does* move
  scores is the detector-tightening — which is **not** a UI fix and is **not** in this zip; see Open
  items.)

---

## Sprint 6 — Audit results page (`sprint6-audit-ui-fixes/`)

All three target the same screen, `app/(auth)/audits/[auditId]/page.tsx` (the Audit Results / Detail
page that Sprint 6 built), so they group as one surface:

- **`visibleau-ui-fix-audit-results-sprint6.md`** — the main one: 6 issues on the results page + 1
  sidebar active-state fix (`components/domain/app-sidebar.tsx`). Frontend only, no schema/API.
- **`visibleau-ui-fix-audit-detail-minor.md`** — 2 targeted patches (engine display-name
  capitalisation, etc.).
- **`visibleau-ui-fix-audit-breadcrumb.md`** — 1 breadcrumb fix.

**Status:** these prompts were authored during Sprint 6 testing (pre-dating this session). I did not
re-validate them here — **confirm their applied state against your own records / a current
screenshot** before assuming they're live.

---

## Sprint 7 — Technical AI Audit sub-pages (`sprint7-technical-audit-ui-fixes/`)

Sprint 7 builds the "Technical AI Audit" surface (8 scoring dimensions rolled up to a 5-category UI)
across several sub-pages under `/brands/[brandId]/…`. UI fix status:

| Sub-page | File(s) | Status |
|---|---|---|
| Technical-Audit **overview** | `technical-audit-overview-uifix-prompt.md` (round 1: danger-signal + category-card colour) · `overview-uifix-v2-prompt.md` (round 2 polish) | ✅ **Signed off** this session — rollup math verified (e.g. 41/100), refinements applied. Both files target the same overview page; apply in order. |
| **SSR check** | `ssr-homepage-label-uifix-prompt.md` + the per-page work in `ssr-signals-ui-spec-changes/` | ✅ **Signed off** (per-page table, homepage row labelled `/ (homepage)`). **Open note:** the green **"SSR healthy"** state is untested (all-Review data) — view once on passing data. |
| **Signals** (new 7th sub-page) | `signals-page-uifix-prompts.md` + `signals-injection-page-FIX3-revised.md` | ✅ **Signed off** — pattern casing fixed, console "6 Issues" cleared, injection rows now name the page. Scores unchanged (additive `detail` only). |
| **robots.txt** | `robots-uifix-v2-prompt.md` (`/brands/[brandId]/technical/robots`) | Round-2 follow-up produced (generated-snippet completeness vs prototype RobotsTxtCrawlerConfig). Confirm applied. |
| **Schema auditor** | `schema-uifix-v2-prompt.md` (`/technical/schema`, "Reality Check — Impact by Engine") | Fix produced (engine-name casing, D2). Confirm applied. |
| **llms.txt** | `llmstxt-uifix-prompt.md` (`/technical/llms-txt`) | Fix produced (D1, vs prototype LlmsTxtGenerator). Confirm applied. |

### `ssr-signals-ui-spec-changes/` — the SSR per-page table + the new Signals page
These produced real UI but are also spec changes (reviewed across 3 reviewer passes, all PASS):
- **`…ssr-perpage-signals-LLD-addendum.md`** — SSR moves from homepage-only to homepage + ≤7 priority
  pages (cap 8), persisting `content.ssr.pages[]`; adds the dedicated Signals page; adds a `detail`
  string to negative-signal/injection rows. **Scoring unchanged.**
- **`…ssr-perpage-signals-BUILD-prompts.md`** — the matching backend + UI build prompts.
- **`visibleau-prototype-SignalsAudit-component.jsx`** — the new Signals page prototype component.

---

## Canon fold-in TODO (prototype + Sprint 7 LLD currently lag the built app)
- Prototype `SsrCheck` (~line 2907) still hard-codes "All 8 critical pages render content
  server-side" → apply the per-page table (SSR addendum Part A); the "8" becomes dynamic.
- `SignalsAudit` is absent from the prototype → fold in the component above, register `'signals'` in
  the route map (~line 4580), add a nav entry.
- Apply the SSR/Signals LLD addendum into `sri-visibleau-sprint-7-prompt.md` §4.
- Build order for the spec changes: backend first (per-page SSR crawler + `content.ssr` + `detail`
  emit + fixtures) → verify populated + scores unchanged → then UI. Much is already built per the
  screenshots — **verify, don't rebuild.**

---

## Open items
- **Detector tightening (hidden-text false positives)** — flags benign `display:none` form-status
  messages as Hidden text / CRITICAL. This is a **detector/scoring change, not a UI fix** (it moves
  `scoreSignals`), so it is **deliberately not in this zip**. It lives in the full Phase 1 bundle
  (`06-sprint7-open/`). Apply before paying customers; not blocking for internal testing.
- **SSR green/OK state** — verify the success badge + "SSR healthy" card on passing data.

---

## Other Phase 1 UI fixes (NOT in this zip — earlier sprints/modules)
The canonical bundle also carries UI fix prompts for other surfaces, which belong to earlier sprints
rather than 6/7: dashboard `overview-minor` (region format), `brands-list`, `brand-detail`,
`brands-server-error`, `action-center`, `action-detail`, `vertical-packs`, `vertical-pack-detail`,
`billing-breadcrumb`, plus two bug-fix prompts (`fix-audit-zero-engines`,
`fix-run-audit-new-uuid-error`). Say the word and I'll bundle any of these too.

---

*If anything here conflicts with what you see in the repo or a fresh screenshot, those win — this
is a snapshot, not the source of truth.*
