# S9 TEST TRACK — SECTION 1: BACKEND UNIT

## Why this section is NOT "add tests for the functions"
**S9 shipped 70/70 green tests + 18/18 green greps — and the walk found 19 findings, 4 HIGH.**
Existing tests test the implementation. This section tests **the canon contract**, and every test must
be **BREAK-PROVEN**: re-introduce the bug it guards → the test goes **RED**. A test that stays green
when the bug returns is decoration.

**Scope:** pure functions ONLY (no DB, no HTTP, no React). Mock nothing that isn't a boundary.
**Location:** `tests/phase2/sprint9/unit/` (match repo convention — check where S8's unit tests live).

---

## 1.1 — `classifyScore(value, dimension)` → `'green' | 'amber' | 'red'`

**CANON (LLD §6U.3, lines 112–115) — the thresholds are per-dimension, NOT shared:**
| Dimension | Source column | green | amber | red |
|---|---|---|---|---|
| AI Sentiment | `audits.scoreSentimentNumeric` | **≥70** | 40–69 | **<40** |
| AI Presence | `audits.scoreFrequency` | **≥60** | 30–59 | **<30** |
| Site Readiness | `technical_audits.scoreComposite` | **≥75** | 45–74 | **<45** |
| Local Authority | `agent_readiness_scores.localAiTrustScore` | (same 3-band; **hide for SaaS**) |

**3 bands. The prototype's 4-band is KNOWN-WRONG (S9-02).**

Tests — table-driven, exhaustive on boundaries:
- Every dimension: **exact boundary** values (69/70, 39/40, 59/60, 29/30, 74/75, 44/45) — off-by-one
  is the classic band bug.
- **0 → red**, **100 → green** for every dimension.
- **Different dimensions, same value, different band:** `classifyScore(65,'sentiment')='amber'` but
  `classifyScore(65,'presence')='green'` and `classifyScore(65,'siteReadiness')='amber'`. **This is
  the test that catches a shared-threshold refactor.**
- **NULL / undefined → NOT a band.** Must return a distinct "not measured" signal, **never `red`**,
  and **never `Number(null)===0 → red`**. ⚠️ **THIS IS F11's ROOT CAUSE.** Assert
  `classifyScore(null)` !== `'red'` explicitly.
- Only 3 bands are ever returned (assert the union — no 4th value).

**BREAK-PROOF (mandatory):** change `>= 70` to `> 70` → the 70-boundary test must go RED. Paste the
RED output.

---

## 1.2 — `buildDimensions(audit, technicalAudit, agentReadiness, brand)` → dimension[]

**CANON:** 4 CROSS-LAYER dims + the #1 action as a 5th card. `SAAS_VERTICALS = ["saas","software",
"fintech","edtech","martech"]`.

Tests:
- **Metropolitan's real answer key** (tradies): Sentiment **100→green**, Presence **5→red**, Site
  Readiness **37→red**, Local Authority **20→red**, Overall **40.5→amber**. Assert every band.
- **Bondi's real answer key** (tradies, 1 audit): Sentiment **50→amber**, Presence **0→red**, Site
  Readiness **21→red**, Local Authority **NULL**, Overall **23.67→red**.
- **SaaS brand → Local Authority is ABSENT** from the array (hidden, not null-valued). Test each of
  the 5 SaaS verticals.
- **Non-SaaS + NULL localAiTrustScore → the dim IS present, marked "not yet measured"**, and is
  **EXCLUDED from the overall average.** ⚠️ **F8** — "not applicable" (SaaS) and "not yet measured"
  (non-SaaS NULL) are DIFFERENT states. Assert the overall average of Bondi = **23.67** (3 dims), not
  a 4-dim average that treats NULL as 0.
- **Each dim reads its CANON column.** Site Readiness must come from `technical_audits.scoreComposite`
  — **not** from `audits`. (S9 had to create the `/site-readiness` route because no existing route
  served this column.) Pass a fixture where `audits` and `technical_audits` hold *different* numbers
  and assert the dim picks the right one.
- **An empty/undefined `technicalAudit` → Site Readiness is "not measured", NOT 0/red.** (F11 again.)

**BREAK-PROOF:** swap Site Readiness's source to `audit.scoreComposite` → the differing-fixture test
goes RED.

---

## 1.3 — `deriveStepStatus(audit, topGap, topTask, topDraft, scoreAfter)` → 5 statuses

**This is F17's function. It stalled the entire loop at step 2 for every brand with gaps.**

**CANON (§6U.2):** 5 steps — Monitor → Explain → Prioritize → Execute → Measure. Statuses:
`done | current | pending`.

Tests:
- **No audit** → step 1 `current`, rest `pending`.
- **Audit, no gap, no task** → `["done","current","pending","pending","pending"]` — **the honest
  stall** (Metropolitan). Assert step 2's copy is "No gaps identified yet".
- ⚠️ **Audit + task, NO gap** → step 2 is **`done`**, loop **ADVANCES to step 3**. **THIS IS F17.**
  The pre-fix code was `if (!topGap) return [...stall]` — a task alone must advance it. Assert step
  2's description is **the task title** (Bondi: "Update local directory listings").
- **Audit + gap, no task** → step 2 `done`, description = `${topGap.topicLabel}: priority #${rank}`.
- **Audit + gap + task** → the **gap wins** the description (canon prefers the topical analysis).
- **+ draft** → step 4 advances.
- **`scoreAfter` non-NULL** → step 5 `done`.
- **`scoreAfter` NULL** → step 5 is **`current`/`pending` with the PENDING copy** — never `done`,
  never a zero lift. (Honesty rule — see 1.4.)

**BREAK-PROOF (the F17 re-break):** revert `if (!topGap && !task)` → `if (!topGap)` → the
**"Audit + task, NO gap"** test must go RED. **This is the single most important break-proof in the
section** — paste its RED output.

---

## 1.4 — `buildMeasureDescription(task)` → the HONESTY RULE

**CANON (v8.19 / v8.27 / v8.32 — BINDING):**
> A lift is shown **ONLY** where `score_after IS NOT NULL`. Otherwise:
> **"Validation audit scheduled — measured impact pending"** — **NOT a zero, NOT a blank.**
> Per-fix delta = **`lift_achieved`**, **NEVER** the `visibility_trends` change (over-attribution).

Tests:
- `score_after = NULL` → the **pending string**. Assert it contains "pending" and **does NOT contain
  `0`, `0.0`, `+0`, or an empty value**. ⚠️ Assert the *absence* of a zero explicitly — that's the
  whole rule.
- `score_after = 42.5`, `lift_achieved = 7.3` → shows **7.3** (the `lift_achieved`), **not** the
  `score_after − score_before` difference, and **not** any `visibility_trends` delta.
- `score_after` present but `lift_achieved = NULL` → **pending** (don't compute a fallback).
- `lift_achieved = 0` with `score_after` non-NULL → shows **0** (an honest measured zero ≠ an
  unmeasured pending). **These two must render DIFFERENTLY.**
- **System-wide truth check:** every `remediation_task` currently has `score_after = NULL` → assert
  the pending path is what fires for the real fixtures.

**BREAK-PROOF:** make the NULL branch return `"0"` → the "does not contain 0" assertion goes RED.

---

## 1.5 — The canonical tracker query (`lib/workflow/progress-summary.ts`)

**CANON (LLD 7895–7931) — exact:**
```sql
WORK COMPLETED  = COUNT(*) FILTER (WHERE status='complete'
                    AND date_trunc('month', completed_at) = date_trunc('month', now()))
MEASURED IMPACT = COALESCE(SUM(lift_achieved) FILTER (WHERE score_after IS NOT NULL
                    AND <same month filter>), 0)
```
**UTC month — explicitly NOT AEST.**

**This is F1–F4's function.** The route rolled its own query while this canonical helper — already
correct — sat unused.

Tests (pure — pass rows in, assert the summary out):
- Uses **`completed_at`**, NOT `updated_at`. ⚠️ **F1.** Fixture: a task with `updated_at` this month
  but `completed_at` LAST month → **must NOT count.**
- **UTC month boundary.** ⚠️ **F2** (the route used JS local-time). Fixture: a task completed
  **2026-07-01 09:00 AEST** = **2026-06-30 23:00 UTC** → belongs to **JUNE**, not July. Assert it does
  NOT count in July. *(Run the test with `TZ=Australia/Sydney` to prove it — under local-time logic
  this test PASSES incorrectly; under UTC it's correct. This is the test that catches F2.)*
- Measured Impact = **`SUM(lift_achieved)`** filtered on `score_after IS NOT NULL` — **not** the
  `visibility_trends` delta. ⚠️ **F3.**
- `COALESCE(..., 0)` → no rows ⇒ **0**, not NULL.
- `status='complete'` (**no -d**) — the canon footgun. A `'completed'` row must NOT count.
- Bondi's real state: 1 open task, 0 complete → **"0 / 1 gaps closed"** ✓ (F6 — verified honest).

**BREAK-PROOF:** switch `completed_at` → `updated_at` → the F1 fixture goes RED. Switch
`date_trunc('month', now() AT TIME ZONE 'UTC')` → local → the AEST-boundary fixture goes RED.

---

## 1.6 — `isSaasVertical(vertical)`
- The 5 canon verticals → `true`. `tradies` / `allied_health` / unknown → `false`.
- **Case/whitespace:** `"SaaS"`, `" saas "` → assert the actual contract (normalise or not — pick one
  and lock it).
- `null` / `undefined` → `false` (**not** a crash, and **not** "hide Local Authority").

---

## CONSTRAINTS
- **Pure functions only.** If a function can't be tested without a DB, say so — that's a *design*
  finding, report it rather than mocking around it.
- **Assert canon, not the code.** If a test fails because the code disagrees with the LLD, **the code
  is wrong** — report it as a NEW finding; do not adjust the test to match the implementation.
- **Every ⚠️ test needs a break-proof.** Re-introduce the bug → RED → revert → green. **Paste the RED
  output for 1.1, 1.2, 1.3, 1.4, 1.5.** A test that stays green under re-break is worthless — that's
  the S8 lesson (four of our own guards were hollow).
- Real answer-key fixtures (Metropolitan / Bondi numbers above) — not invented data.
- Do **NOT** touch §12 QA — that's a **standalone final pass** after Section 5.

## REPORT BACK (paste inline)
1. Test file paths + total count.
2. **The 5 break-proof RED outputs** (1.1–1.5) — especially **1.3 (F17)**.
3. **Any test that fails against the current code** → a NEW finding (code vs canon). List them.
4. Any function you couldn't unit-test purely (a design finding).
5. `pnpm test` — full green, zero regressions on the existing 70.
