# S9 §12 QA — STANDALONE FINAL PASS

## ⚠️ READ THIS FIRST — the §12 greps are the reason this sprint had 28 findings

**S9 shipped 18/18 GREEN §12 greps. The walk then found 20 findings, 4 HIGH. The test track found 8
more, including a HIGH. Every single one was invisible to §12.**

**Why:** *every* §12 grep asserts **that a string exists in a file**. Not one asserts **behaviour**.

| §12 grep | Returned | While… |
|---|---|---|
| `grep "done\|current\|pending" loop-step-card.tsx → ≥1` | ✅ PASS | the loop **stalled at step 2 for every brand with a task** (F17) |
| `grep "score_after\|lift_achieved" → ≥1` | ✅ PASS | the honesty rule was **never reached** — the loop never got to step 5 |
| `grep -E "md:\|sm:\|lg:" health-check/ → ≥1` | ✅ PASS | the Health Check grid was a **hardcoded inline style that does not respond to viewport at all** (F26) |
| `grep "assertBrandAccess" → ≥2` | ✅ PASS | **6 of 9 Growth+ routes had NO TIER CHECK** — the paywall was a CSS blur (F28) |
| `grep "prefers-reduced-motion" → ≥1` | ✅ PASS | an **ungated `animate-pulse`** was live (F5) |
| `grep "explainability\|rationale" → ≥1` | ✅ PASS | the rationale **rendered empty** — no column exists (F9/F13) |

**A string being present proves nothing about whether the code using it runs, runs correctly, or runs
at all.** §13's anti-pattern list even *names* "Tier mis-gating" — and F28 shipped past a grep pointed
straight at it.

**So this pass does NOT re-run the 18 greps.** It converts each into the **behavioural invariant it was
trying to express**, and asserts THAT. Where an invariant is already covered by Sections 1–5,
**reference the test and move on** — do not duplicate.

**Output: a single runnable script** — `scripts/qa/sprint9-invariants.sh` (match S8's
`sprint8-invariants.sh` convention) — plus this report.

---

## PART A — THE STRUCTURAL CONTRACT (greps are legitimate here)
These assert *absence* — that S9 didn't add what it must not add. A grep genuinely proves absence.

| # | Invariant | Check |
|---|---|---|
| A1 | **No S9 migration** | `ls db/migrations/*sprint9*` → empty |
| A2 | **No new table** | no `CREATE TABLE` in any S9 migration |
| A3 | **serve() still 25 fns** | S9 adds **no Inngest function** — count the array |
| A4 | **No 2nd chart library** | only the SoV/visibility-trend lib appears in `package.json` diff |
| A5 | **No Clerk in S9 components** | `grep "Clerk\|@clerk" components/domain/autopilot/` → **0** |
| A6 | **No `var()`+hex-alpha bug** | `grep -E "var\(--[a-z-]+\)[0-9a-fA-F]{2}"` → **0** |
| A7 | **No `ExplainabilityService.annotate(`** | S9 **renders**, never regenerates → **0** |
| A8 | **No `citations.brand_id`** | the **v8.16 trap** — `citations` has no `brand_id`; the trend route MUST join `citations.audit_id → audits.brand_id` → **0** |
| A9 | **No task-enum in the stepper** | `grep "open\|in_progress\|ready_for_review\|wont_fix" autopilot-loop.tsx` → **0** (§13: keep `step.status` separate) |
| A10 | **No raw multidims in Health Check** | `grep "scorePosition\|scoreContext\|scoreAccuracy" health-check-panel.tsx` → **0** (S9-02) |
| A11 | **No new write path for approve** | the 1-click approve **re-uses S2's existing** `content_drafts` approve — not a new route |

⚠️ **A8 is the one grep here that is genuinely load-bearing** and was never behaviourally tested (the
sparkline is orphaned — F12 — so its route has never run against real data). **Also assert
behaviourally:** call the trend route for Metropolitan → it must return rows and **not** error on a
missing column.

---

## PART B — THE ANTI-PATTERNS (§13), AS BEHAVIOUR
Each §13 anti-pattern, converted from "is the string there?" to "does the system actually do this?"

| # | §13 anti-pattern | The behavioural assertion | Covered by |
|---|---|---|---|
| B1 | **Tier mis-gating** ⚠️ | Free-tier session → **every** Growth+ route returns **403 with no payload**. `subscriptions.tier` only. `orgs.tier='free'`+`subs.tier='growth'` → **200**. | §2.3 + F28 break-proof |
| B2 | **Unverified "improvement"** ⚠️ | `score_after` NULL → **"validation audit scheduled — pending"**, **no number**. Non-NULL → **`lift_achieved`** (not the `visibility_trends` delta). **Flat → "no measurable change"; negative → the real negative.** | §1.4 + §4.0 |
| B3 | **Health Check ≠ raw multidim** | The 4 cross-layer dims render **from their canon columns** (Site Readiness ← `technical_audits.scoreComposite`). **Fixture where `audits` and `technical_audits` differ → the right one wins.** | §1.2 + §2.5 |
| B4 | **step.status vs task enum** | Pass `"in_progress"` as a step status → renders as **invalid**, not as a valid state. | §4.1 |
| B5 | **Empty rationale is a build failure** ⚠️ | The rationale renders the **honest placeholder** and **never fabricates**. ⚠️ **Canon calls an empty rationale a BUILD FAILURE** — and it IS empty (no `explainability` column). **This is F9/F13, carried to S6. State it plainly in the report — do not let a carried finding pass silently as "OK".** | §3 Group E |
| B6 | **Brand-access gate dropped** | Cross-org → **404**, zero rows leaked, **in the browser** and on the wire. | §2.2 + §5.6 |
| B7 | **Reduced-motion ignored** | Real `prefers-reduced-motion: reduce` → **no animation runs**. | §5.4 |
| B8 | **Tracker buried** | It renders **above** SoV/Recent audits, and **exactly ONE** work-completed surface exists (F7). | §3 Group C + §5.7 |
| B9 | **New Inngest fn / schema** | A3/A1 above. | Part A |

**For each: cite the test that proves it. If any anti-pattern has NO behavioural test, that is a gap —
report it.**

---

## PART C — THE ANSWER KEY, END TO END (the F11 discipline)
The single technique that caught the worst bug of the sprint: **know the DB before you look at the
screen.**

```
Metropolitan (418f321f…): Sentiment 100 · Presence 5 · SiteReadiness 37 · LocalAuth 20 · Overall 40.5 → 41 "Fair"
Bondi (0f531803…):        Sentiment 50  · Presence 0 · SiteReadiness 21 · LocalAuth NULL → "Not yet measured" · Overall 23.67 → 24 "Critical"
Bondi #1 action: "Update local directory listings" (priority 5000) · Metropolitan: none
score_after: NULL on EVERY remediation_task system-wide
```
- Assert the **rendered** values match, for both brands, on a real screen.
- ⚠️ **NO brand renders `0/100 · Critical` when its real score is non-zero.** *That was F11 — the bug
  this entire track exists because of.*
- ⚠️ **The two brands DIVERGE on the autopilot loop:** Bondi advances (it has a task); Metropolitan
  honestly stalls at step 2. **That divergence is F17's proof.**

---

## PART D — DB / MIGRATION DISCIPLINE
- ⚠️ **dev (`visibleau`) and prod (`visibleau_prod`) have IDENTICAL schemas.** *(Verified this sprint:
  71 tables · 953 columns · 157 indexes · zero drift. **S8's CRITICAL F1 was this exact gap** —
  a migration applied to dev, never prod → 44 routes 500'd.)* **Re-run the drift checker.**
- **RLS is enabled AND forced** on `remediation_tasks`, `brands`, `audits` (`relrowsecurity` +
  `relforcerowsecurity` both `true`).
- ⚠️ **Note for the record:** dev connects as `postgres` (**superuser, BYPASSRLS**) — **so RLS never
  fires in dev.** The test suite (§2.7, via `SET LOCAL ROLE visibleau_app`) is the **only** place RLS
  is exercised. **Any RLS regression will be invisible in dev by construction.**
- ⚠️ **`date_trunc` UTC sweep:** every `date_trunc('month', now())` uses **`AT TIME ZONE 'UTC'`**
  (F21 — the Postgres server is `Australia/Sydney`; **3 sites**, incl. `quota-check.ts`). **Re-grep:
  any bare `date_trunc(... now())` is a regression.**

---

## PART E — THE FULL SUITE + THE HONEST LEDGER
1. **Every S9 test green** (~417 across §§1–5). Report the count.
2. ⚠️ **The 51 pre-existing failures in Sprint 2/3/4** — **name them.** A permanently-red baseline
   erodes the signal from green, and they've been hand-waved all sprint. **List the files.** They are
   out of S9's scope, but they should be *visible*, not absorbed.
3. **The carried ledger** — state each plainly, so nothing "passes" by being forgotten:
   | Finding | Carried to | Status |
   |---|---|---|
   | **F9/F13** explainability: 3/5 fields, wrong enum, never persisted — **§13 calls an empty rationale a BUILD FAILURE** | **S6** | ⚠️ open |
   | **F12** sparkline built, never mounted (host table unbuilt) | **S10** | open |
   | **F14** personas ~70% (4 elements absent) | — | open |
   | **F23** journey templates hardcode vertical + city | **S7** | open |
   | **F25** `autopilot-loop` lacks canon's loading/EmptyState/error-boundary *(page-level exists)* | — | minor |
   | **Envelope standardisation** (~2h, low blast radius) — 3 bare-array routes → named envelopes; **delete the tolerant `Array.isArray` fallbacks so a mis-read fails LOUDLY** | **Sri decides** | ⚠️ **produced 4 of 28 findings** |

---

## CONSTRAINTS
- ⚠️ **Do NOT re-run the 18 §12 greps and report "18/18 PASS."** They were 18/18 green while 28
  findings shipped. **Assert the behaviour each grep was gesturing at.**
- Where Sections 1–5 already prove an invariant, **cite the test** — don't duplicate.
- **A carried finding is NOT a pass.** Name it as open (especially **B5** — canon calls it a build
  failure).
- Any invariant with **no behavioural test** = a **gap**. Report it; don't paper over it.

## REPORT BACK (paste inline)
1. **`scripts/qa/sprint9-invariants.sh`** + its full output (N/N).
2. ⚠️ **Part B — any anti-pattern with NO behavioural test backing it.**
3. ⚠️ **Part C** — the answer key, rendered, both brands. **Does any brand render 0/100 when its real
   score isn't 0?**
4. **Part D** — drift = zero? RLS forced? **Any bare `date_trunc(... now())` left?**
5. **Part E** — total green; **the 51 pre-existing failures, named**; the carried ledger restated.
6. **VERDICT: is Sprint 9 shippable?** — with every open item named, not hidden.
