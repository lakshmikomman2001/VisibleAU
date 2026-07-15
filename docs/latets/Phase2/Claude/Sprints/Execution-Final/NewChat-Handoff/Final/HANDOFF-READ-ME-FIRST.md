# VisibleAU — HANDOFF (Phase 2 complete: S9 + Gate 3 + infra) — READ THIS FIRST

You are the **reviewer/spec chat** in a two-chat relay for VisibleAU (an AU-first GEO/AEO AI-visibility
SaaS). This document is everything a fresh chat needs to continue. Read it fully before writing anything.

---

## 1. WHO / WHAT
- **Sri** — Sydney solo founder, senior full-stack dev, weekend pace. Prefers OSS, bootstrap-first,
  direct communication without padding.
- **VisibleAU** — measures a brand's presence across ChatGPT/Claude/Gemini/Perplexity for AU SMBs and
  agencies. 7-layer platform. **Phase 1 (12 sprints) + Phase 2 (9 sprints) are built.**

## 2. THE RELAY — how this works
- **This chat** reads canon + writes **ready-to-paste Claude Code `.md` prompts** to
  `/mnt/user-data/outputs/`.
- **A separate Claude Code chat** applies them to `C:\startup\VisibleAU\src\`.
- **Sri pastes results back** inline or as screenshots.
- ⚠️ **STANDING RULE: produce a `.md` prompt for EVERY finding (incl. LOW) and every
  verification/diagnostic step.** Never ask Sri to run raw commands, psql, greps, or manual edits —
  wrap everything in a Claude Code prompt with an explicit **Report-back** block. Group related issues
  into one prompt where sensible.

## 3. TWO DATABASES — the single most dangerous pitfall
- `visibleau` — **dev** (currently EMPTY, 0 rows)
- `visibleau_prod` — **the DB the app actually runs against** — has ALL real data (19 audits, 3,405
  citations, Metropolitan + Bondi brands)
- ⚠️ **Every migration/seed must reach BOTH.** A migration applied to one and not the other caused
  **S8's CRITICAL F1 — 44 routes 500'd.** Historically this gap has caused 5+ critical failures.
- **Connection:** `postgresql://postgres:password@localhost:5432/{visibleau|visibleau_prod}`

## 4. THE CORE THESIS (proven ~50+ times this project)
**Greps and tests passing ≠ the feature works on the rendered screen.** The method that actually finds
bugs:
1. **Build the DB answer key BEFORE opening the page** — know what the screen *should* show, or a
   plausible-but-wrong value (0/100, "improved 0.0 points") reads as correct.
2. **Click the buttons.** Dead links and nav-orphans only surface by clicking.
3. **Watch the SERVER TERMINAL**, not just the browser — dead event chains are invisible in code and in
   the browser console.
4. **Ask whether a control that LOOKS present actually DOES anything** — the paywall that was a CSS
   blur, the loop that stalled, the gate that was cosmetic.
5. **Verify at 3 levels** — integration + E2E render-proof + grep. A grep asserting a *string exists*
   proves nothing about whether the code runs.
6. **Presence ≠ correctness.** Cross-check computed rows against source data (that's how synthetic seed
   rows and phantom writers were caught).

## 5. CANON — the source-of-truth files (in this bundle)
| Artifact | Path |
|---|---|
| **Phase 2 LLD v8.70** | `phase-2/lld/visibleau-phase2-LLD-v8.70.md` |
| **Phase 2 prototype FIX17** | `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx` ← **the ONLY canonical prototype** |
| Phase 2 sprint prompts (1–9) | `phase-2/sprint-prompts/` |
| **This session's prompts (S9 + Gate 3 + infra)** | `phase-2/sprint9-and-gate3/` (~90 files) |
| Phase 1 LLD | `phase-1/lld/visibleau-phase1-7layer-lld.md` |
| Phase 1 prototype | `phase-1/prototype/visibleau-phase1-prototype.jsx` |
| Phase 1 sprint prompts (1–12) | `phase-1/sprint-prompts/` |
| Phase 1 fixes (50) | `phase-1/fixes/` |

⚠️ **CANON COUNTS (corrected this session — the docs were stale):**
- **71 tables** (34 Phase-1 + 37 Phase-2) — NOT 37
- **40 Inngest functions** — was 41, now **40** after removing the phantom `technical-audit-run.ts`.
  ⚠️ **The source of truth is `scripts/qa/inngest-serve-manifest.txt`, guarded by a set-difference
  test — do NOT hard-code the number in prose.** (It was "25" in canon for 4 sprints while 18 functions
  were added — that's how the drift happened.)
- **16 GAPs** (GAP 1–16, fixed enumeration) — accurate

## 6. KEY ANSWER KEY (prod) — memorise these
- **Metropolitan Plumbing** = `418f321f-2489-4560-aaa9-895728580465` (tradies, now **19 audits**):
  Sentiment 100 · Presence 5 · Site Readiness **37** · Local Authority 20 · Overall ~36–41.
  ⚠️ **Site Readiness = 37 is the REAL value** (from `run-technical-audit-inline.ts`). The phantom
  writer used to also write **83** (empty findings) — that writer is now DELETED.
- **Bondi Plumbing** = `0f531803-b529-4d09-9fd6-b6272b5baba8` (tradies, 1 audit): Overall ~24 "Critical";
  Local Authority NULL → "Not yet measured". #1 action "Update local directory listings".

---

## 7. WHAT WAS DONE THIS SESSION (the state you're inheriting)

### Sprint 9 (Autopilot UX) — 29 findings, 5 HIGH — COMPLETE
Shipped 18/18 green greps + 70/70 green tests; the walk + test track then found 29 findings. Dominant
class: **envelope-unwrap** — routes return `{key:[...]}`, pages read the bare array, the tolerant
`Array.isArray()` fallback silently drops the data → a plausible empty state, no crash, no test failure.
Worst finds: Health Check rendered every brand 0/100 (F11); Autopilot loop stalled at step 2 (F17); the
**entire Phase 2 paywall was `backdrop-filter: blur(6px)`** with 6/9 routes ungated server-side (F28).

### Gate 3 (cross-prompt seam audit) — 31 findings, 7 HIGH — CLOSED, runtime-proven
**Method: grep the SEAM, not the file.** Every cross-sprint bug is a two-document problem — each side
coherent, only the pair breaks.
- **B-2/B-3:** every report degraded since S4 — field-name drift (`qualityStatus`→`sampleQuality`,
  `compositeScore`→`scoreCompositeAvg`) hidden behind a `(trend as Record<string,unknown>)` cast. Every
  exec summary said "improved by 0.0 points". **Fixed + proven** — a real report now shows "improved by
  39.8 points" matching the DB (39.84). Generating a real report found **2 MORE** field drifts a code
  review had passed.
- **A-2:** the citation-source-intelligence pipeline had **NEVER fired** — a listener with no emitter.
  **Fixed + proven at runtime** — 7 rows written, reconciled against source data. First execution in
  product history.
- **B-1:** `orgId`/`organizationId` mismatch → 23502 crash. Fixed; all 21 events matrixed, no third
  mismatch.
- **D-2/D-3:** F28 was ~23 routes not 6; `[id]` write handlers bypassed the gate (a free user could
  PATCH paid tasks). Fixed with behavioural break-proofs (disable gate → RED with leaked payload).
- **F-1:** OQ-1 local-SEO deletions were uncommitted. Committed.
- **MED batch:** F-4 (local-trust scorer gated on table-existence not data → fabricated zeros — F11
  class), G-2 (sentiment −1..1 in a 0-100 column), F-7 (journey templates hardcoded
  "electricians in Melbourne" → parameterized per-brand), F-6 (orphaned sparkline mounted, triple-guarded).
- **G-3 root cause (the session's best catch):** `technical_audits` had duplicate rows. The proposed
  keep-rule "keep highest score" was **INVERTED** — the high-score row was a **PHANTOM** from a
  redundant Inngest writer (`technical-audit-run.ts`) with empty findings. Ground-truth (matching the
  row to Audit #20's known terminal output) proved 37=real, 83=phantom. **Deleted 10 phantoms by
  `findings != '{}'`, removed the phantom writer, ported its event emit to the real writer first.**

### Infra — drizzle-kit FIXED (P1)
Root cause of every migration failure incl. S8's CRITICAL: `db/schema/index.ts` re-exported auth tables
via `export * from "./auth"`, so `drizzle-kit` thought it owned Better-Auth's tables → every `generate`
crashed. **Fixed:** removed the barrel export (auth consumers import directly), rebuilt the snapshot to a
clean `0010` baseline. **There is now a working code→DB path** — used it to ship `0011` (audit FK
CASCADE + unique constraints) cleanly to both DBs. Drift checker: **dev == prod, zero drift.**

### Commits this session
`e2d8513` (dead localSeo import), `d5f47f8` (7 Gate 3 HIGH, 51 files), `d0f2244` (tasks/[id] PATCH tier),
`85407bd` (qualityPasses phantom labels). ⚠️ **The MED batch + cleanup + phantom-writer removal + 0011 +
manifest were NOT yet committed at handoff — CONFIRM their commit status first thing.**

---

## 8. ⚠️ OPEN ITEMS (what's left)

| Item | Status | Notes |
|---|---|---|
| **Commit the uncommitted work** | ⏳ **DO FIRST** | MED batch (F-4/F-5/G-2/F-7/F-6), cleanup (D-4/F-3/G-1), phantom-writer removal, 0011, manifest. Confirm what's committed vs not. |
| **`main` is at Sprint 1** | ⏳ **decide** | `dev/phase2` is 14 commits / 1,063 files / 151k insertions ahead. `main` is a strict ancestor (clean fast-forward). **13 sprints — every Inngest fn, all of Gate 3 — live on ONE unmerged branch.** Single point of failure; merge before go-to-market. |
| **Health Check 404** | ⏳ **unresolved, NOT today's fault** | Clicking the Health Check tile 404s (route ran 361ms then bounced). Diagnostic cleared today's changes: route exists, compiles, imports clean, all 5 APIs 200. Leading theory: **client-router cache / auth-transition artifact** — Sri to try hard-refresh (Ctrl+Shift+R). If it persists on hard-refresh while logged in → real auth/routing bug (not data/schema). |
| **Remaining LOW findings** | ⏳ cleanup | C-2, E-1, F-5(done), G (mostly done). Plus the `50/0 · 0%` per-engine audit-progress display bug (envelope-unwrap class, spotted during the audit run). |
| **`0011` baseline landmine** | ⏳ note | `0010_baseline-reconcile.sql` contains `CREATE TABLE` for all 64 tables — **must NOT be applied to existing DBs.** Consider renaming it `_DO_NOT_APPLY` or seeding `__drizzle_migrations` so `migrate` skips it. |
| **A-3 fully proven** | ⏳ soft | Fan-out mechanism proven; the specific `recommendation.created` chain awaits an audit that actually produces recommendations (last run produced 0 enriched). |

---

## 9. HOW TO WRITE A GOOD FIX PROMPT (the house style)
Every prompt Claude Code applies should have:
1. **A "why this matters" header** connecting the finding to real impact (not just "X is wrong").
2. ⚠️ **markers on the load-bearing steps** and the traps.
3. **A behavioural break-proof, never a grep** — "disable the thing → assert it goes RED with the actual
   broken behaviour (200 with payload / wrong number / etc.)". A grep for a string is not a proof.
4. **The DB answer key up front** where a screen/value is involved — know the truth before looking.
5. **"Watch the terminal"** for anything involving Inngest events.
6. **Explicit constraints** — READ-ONLY where diagnosing; "don't force it / don't make the test pass /
   don't act unilaterally on prod deletes (backup first)".
7. **A REPORT-BACK block** listing exactly what to paste inline, with ⚠️ on the decisive questions.
8. **Three-way verdicts** where an outcome is ambiguous ("ran ≠ wrote ≠ wrote-correctly").

⚠️ **Prod deletes need Sri's explicit sign-off, and a `pg_dump` backup first.** Never propose a
destructive prod action without: (a) ground-truthing which data is real, (b) a backup, (c) an `EXISTS`
safety net so you never orphan a row.

## 10. RECURRING BUG CLASSES (watch for these)
- **envelope-unwrap** — `Array.isArray()` on a wrapped `{key:[...]}` → silent empty state
- **field-name drift hidden by a cast** — `as Record<string,unknown>` / `as any` silences TS on a DB
  row or event payload → NaN/undefined → plausible-wrong output
- **null-vs-zero** — truthy checks (`x && ...`, `?? 0`) treating a real 0 or a missing row as the same
  → fabricated scores (F-4, G-2, F11 all this class)
- **dot-vs-slash / field-mismatch event seams** — emitter and listener disagree → dead chain, no error
- **phantom/redundant writers** — two functions writing the same table, one with a worse algorithm
- **cosmetic gates** — a control that renders but enforces nothing (the blur paywall)
- **presence-grep theatre** — a test asserting a string exists while the code using it is broken

---

**Bottom line:** Phase 2 is built and its seams are proven coherent. Immediate next steps: **confirm
commits → decide the `main` merge → resolve/close the Health Check 404 (hard-refresh test).** Then Phase
2 GTM. Write every fix as a ready-to-paste Claude Code `.md` with a behavioural break-proof and a
report-back block.
