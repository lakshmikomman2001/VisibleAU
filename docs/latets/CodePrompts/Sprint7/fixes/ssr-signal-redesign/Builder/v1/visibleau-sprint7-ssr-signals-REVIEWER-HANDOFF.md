# Gate-2 Reviewer Handoff — VisibleAU Sprint 7: per-page SSR + Signals sub-page
# Purpose: INDEPENDENT gate-check of one change set before Claude Code runs it.
# You are the reviewer chat. Do not implement. Verify against canon, then return a verdict + fixes.

---

## 0. What to upload into this chat (ask Sri if missing)
Container files don't cross chats, so the reviewer needs these uploaded here:

**Canon (verify against):**
1. `sri-visibleau-sprint-7-prompt.md`  — Phase 1 Sprint 7 LLD (Module 5b), 1130 lines.
2. `visibleau-foundations-v1.12.md`     — Phase 1 schema/LLD.
3. `visibleau-prototype.jsx`            — Phase 1 prototype, 4661 lines (the `SsrCheck` component is the SSR authority).

**Change set (under review):**
4. `visibleau-sprint7-ssr-perpage-signals-LLD-addendum.md`   — the LLD changes (Parts A & B).
5. `visibleau-sprint7-ssr-perpage-signals-BUILD-prompts.md`  — Phase 1 (backend) + Phase 2 (UI) build prompts.

If any are absent, ask Sri to upload before reviewing — do not review from memory.

---

## 1. Situation (one paragraph)
This is Phase 1 Sprint 7 (Technical AI Audit) **built-UI validation**, sub-page D3 (SSR). Gate-2
review found the built "SSR" page contained no SSR check — it showed answer-capsule KPIs, negative
signals, and prompt-injection detections instead. Two decisions were then taken by Sri: **C2** —
promote SSR from homepage-only to a real per-page check so the prototype's page-by-page table is
backed by data (an LLD change); **C4** — give the negative-signals + prompt-injection *detail* a
dedicated Signals sub-page (LLD route back-fill). The change set (item 4 + 5) implements both. Your
job: confirm it's faithful to canon, schema-safe, scoring-safe, and dependency-safe — or return
precise fixes.

---

## 2. The change set, in brief (intent you're checking against)
**Addendum Part A (SSR per-page):** replaces the EF2 "homepage-only" rule with "homepage + up to 7
priority pages, cap 8, shared js/no-js contexts, batched 3"; adds a `content.ssr` sub-object to the
`findings` JSONB (`{ healthy, pagesChecked, pages[] }`); **keeps scoring identical** (ssrScore still
homepage-derived; per-page array is presentational only).
**Addendum Part B (Signals page):** adds a 7th sub-page `signals/page.tsx` reading
`content.negativeSignals` + `content.promptInjections` + the `scoreSignals` **column** (NOT a
`findings.signals` detail key); new `signals-detail.tsx`; nav entry; no schema change.
**Build Phase 1 (backend):** implements Part A (crawler + persistence + tests + a mock-brand fixture).
**Build Phase 2 (UI):** SSR page → prototype status card + table from `content.ssr` (removes
signals/injection/capsule cards + the "6/12"); new Signals page; overview wiring; capsules stay on D4;
detects the real SSR route and mirrors it for the Signals sibling.

---

## 3. Canonical facts to confirm independently (grep, don't trust this doc)
Locate each in the uploaded canon and confirm it matches what the change set assumes:

| # | Fact the change set relies on | Where (approx) | Grep token |
|---|---|---|---|
| F1 | `findings.content` holds: `score /12`, `wordCount`, `answerCapsulesFound/Suggested`, `negativeSignals[]`, `promptInjections[]`. The addendum **adds** `content.ssr`. | S7 ~482–605 (technical_audits / EB5) | `negativeSignals`, `promptInjections`, `content: {` |
| F2 | `findings.signals` is **`{ score }` only** — no detail arrays. (This is why the Signals page must read `content`, not `signals`.) | S7 ~595 (EB5) | `signals: { score` |
| F3 | EF2 SSR method is **homepage-only** today. | S7 ~224–238 | `homepage only`, `javaScriptEnabled: false` |
| F4 | `scoreContent /12 = ssrScore(0-6) + capsuleScore(0-6)`, ssrScore from homepage ratio. | S7 ~522–532 (EG1) | `scoreContent = ssrScore` |
| F5 | EC1 rollup: `technical = Robots+llmsTxt+AIDiscovery+Signals (/48)`; `content = Content+Meta (/26)`. So `scoreSignals`→technical, `scoreContent`→content; rollup reads **columns**, not pages. | S7 ~372–378 + ~1121 | `rollupTo5Categories`, `scoreSignals) / 48` |
| F6 | EG3: sub-pages read `technical_audits.findings`; no re-crawl on load; current text says "**6** sub-pages". | S7 ~402 | `All 6 sub-pages` |
| F7 | Canonical sub-page routes (note: **no `/technical/` segment**, and `ssr-check` not `ssr`). | S7 ~392–397 | `ssr-check/page.tsx`, `brand-entity-audit/page.tsx` |
| F8 | Components list has `ssr-status-table.tsx` and **no** signals/injection component. | S7 ~449–455 | `ssr-status-table`, `components/domain/technical/` |
| F9 | Inngest `score-ssr` step persists to `technical_audits`. | S7 ~857–883 | `step.run('score-ssr'` |
| F10 | Prototype `SsrCheck` = status card + **6-row** page-by-page table; prototype has **no** signals/injection audit component. | proto 2907–2961 | `SsrCheck`, `Page-by-page check` |

---

## 4. Gate checklist (what PASS requires)
Mark each PASS / FIX. Cite the canon location for every FIX.

**A. Addendum Part A — SSR per-page**
- [ ] A1 EF2 replacement is internally consistent (cap 8, homepage = `pages[0]`, shared contexts, batched 3) and the per-page derivations (`jsDisabledContentPct`, `schemaVisible`, `criticalCtas`, `status`) are well-defined.
- [ ] A2 `content.ssr` shape is additive — it does **not** remove or rename existing `content` fields (F1).
- [ ] A3 **CRITICAL — scoring unchanged is actually true:** ssrScore still derived from `pages[0]`/homepage per F4; the per-page array does **not** feed ssrScore, scoreContent, scoreComposite, or rollupTo5Categories (F5). If the addendum lets per-page data change any score → FAIL.
- [ ] A4 crawler step + `per-page.test.ts` updates are specified.

**B. Addendum Part B — Signals page**
- [ ] B1 7th route `signals/page.tsx` added to the §4 structure under the correct parent (F7).
- [ ] B2 **CRITICAL — correct data source:** fetch reads `findings.content.negativeSignals` + `findings.content.promptInjections` + `scoreSignals` **column**, NOT a `findings.signals` detail key (F2). Wrong source → FAIL (renders empty).
- [ ] B3 EG3 "6 sub-pages" → "7" update is included (F6).
- [ ] B4 confirms no schema change (data already persisted by F9) and notes new `signals-detail.tsx` + nav entry (F8).

**C. Build Phase 1 faithful to Part A**
- [ ] multi-page SSR; persists `content.ssr` (JSONB, no migration); ssrScore homepage-derived; explicit verification that composite + rollup are unchanged on an unchanged site (A3); tests; mock-brand fixture so the UI is checkable without a live crawl.

**D. Build Phase 2 faithful to Part B + prototype**
- [ ] SSR page renders status card + table from `content.ssr` per `SsrCheck` (F10); removes signals/injection/capsule cards + the "6/12"; tolerates absent `content.ssr` (EmptyState).
- [ ] Signals page reads the F2 source; `/6` renders **red at 0/6** (the recurring 0-score=danger convention); empty-array states handled.
- [ ] Route handling: Phase 2 greps for the real SSR route and mirrors it for the Signals sibling (F7) rather than assuming a path; reports what it found.
- [ ] overview Signals dimension → new page; sub-page nav gains "Signals"; capsules confirmed on D4 (not re-added to SSR).

**E. Cross-cutting**
- [ ] No migration / DDL (findings is already `jsonb`).
- [ ] No composite/rollup/Inngest-scoring change (F5, F9).
- [ ] Phase 2 tells Claude Code to grep for other usages before relocating the signals/injection components (F8 — they're build-authored; confirm not shared).
- [ ] Run order is explicit (Phase 1 before Phase 2).

---

## 5. Invariants that must hold (fail the gate if violated)
1. **Scoring is byte-identical** on an unchanged site (scoreContent, scoreComposite, 5-cat rollup). The per-page SSR data is display-only.
2. **The Signals page reads `findings.content`** (negativeSignals + promptInjections) + the `scoreSignals` column — never `findings.signals` for detail.
3. **No DB migration** — `findings` JSONB is extended additively.
4. **Route is detected, not assumed** — canonical is `ssr-check`/`signals` (no `/technical/`); the build may differ; the prompt must adapt.

---

## 6. Review rules (apply these)
- **LLD wins over the prototype** on any conflict. (The whole change set exists because the prototype's table out-ran the LLD's data model — verify the addendum closed that gap rather than papering over it.)
- **Flag, don't invent.** If you find a *new* LLD-level gap, escalate it to Sri — do not silently patch it into the build prompts.
- **Verify by grep against the uploaded canon.** Do not pass/fail from this handoff's claims alone; confirm F1–F10 yourself.
- **Reject absence-grep false-fails.** "I grepped and didn't find X" is not proof X is missing — confirm with a positive query / read the section before flagging.
- **A fix prompt for every issue.** For each FIX (incl. minor), return a ready-to-paste correction scoped to the file + exact change + verification grep — not just a description. Group related fixes.
- **Editing rule for any fix you write:** `str_replace` or exact-literal Python only — never `sed`/`perl` with pipe delimiters (has corrupted files before).
- English only.

---

## 7. Output format expected
1. **Verdict:** PASS / PASS-WITH-FIXES / FAIL.
2. **Findings table:** id · severity (HIGH/MOD/LOW) · what · canon location · the fix.
3. **Ready-to-paste fix prompts** for every finding.
4. **Escalations:** any new LLD-level gaps for Sri to decide (separate from build-ready fixes).
5. **Invariant check:** explicit PASS/FAIL on the four items in §5.
