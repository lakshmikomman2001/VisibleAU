# S9 TEST TRACK — SECTION 3: WALK REGRESSION GUARDS

## The one rule
**Guard the BEHAVIOUR, never the FIX.**

A test asserting `page.tsx` contains `?.audit` is green forever and catches nothing — the bug returns
the instant someone refactors to `const { audit } = await res.json()`. The guard must assert **what
the user sees**, so *any* re-introduction of the bug — by any mechanism — goes RED.

**Every guard needs a break-proof.** Re-introduce the bug → RED → revert → green. **A guard that stays
green under re-break is worse than no guard: it is a false alibi.** (S8: four of our own guards were
hollow.)

Where an existing test already covers a finding (Sections 1–2), **do not duplicate it — reference it
and move on.** This section fills the gaps: the findings that live at the page/render layer, plus the
ones that must never be "fixed" into a lie.

**Location:** `tests/phase2/sprint9/regression/`
**Naming:** one describe block per finding — `describe("F17 — autopilot loop advances on a task with no gap")`.

---

## GROUP A — THE ENVELOPE CLASS (F11 · F15 · F16 · F17) — 4 of 23 findings, one root cause

**The bug:** routes return inconsistent shapes; pages guess; a wrong guess yields
`undefined → null → Number(null)=0 → red`. **200 OK, data arrives, page silently drops it.** No crash,
no failed test.

### A guard that would have caught ALL FOUR
Don't write four separate string-matching tests. Write **one behavioural invariant**:

> **For every S9 page, given a route response containing REAL data, the page must render THAT DATA —
> not zeros, not an empty state, not a placeholder.**

Implementation: render each page with a mocked fetch returning the route's **real envelope shape**,
then assert the *rendered output* contains the real values.

| Finding | The assertion |
|---|---|
| **F11** | health-check with `{audit:{scoreSentimentNumeric:100,...}}` → renders **100 / green**, **NOT 0 / "Critical"**. ⚠️ Assert the *absence* of `0` and `Critical`. |
| **F15** | autopilot with `{brand:{name:"Metropolitan Plumbing"}}` → renders **the name**, **NOT the literal string `"Brand"`**. And with `promptsCount: 10` → renders **10 prompts**, not 0. |
| **F16** | discovery with `{journeys:[{...}],templates:[...]}` → renders **1 journey**, not 0. |
| **F17** | autopilot with a **task and NO gap** → step 2 = **done**, shows the task title, loop **advances to step 3**. (Section 1 covers `deriveStepStatus` purely; this covers the *page*.) |

**⚠️ THE CRITICAL PART — the negative test.** Each page must **also** be rendered with the *wrong*
shape (a bare array where the route wraps, or vice versa) and assert it **does NOT silently render
zeros**. It should throw, or render an explicit error — **never a plausible empty.** *That tolerance
is the bug.* If a page still renders "0" from a mis-shaped response, **the class is not closed** —
report it.

**BREAK-PROOF:** revert one page to `await res.json()` (bare) → its test goes RED **rendering 0**.
Paste it.

---

## GROUP B — THE ORPHAN CLASS (F10 · F12 · F19)

Already guarded by three existing tests — **verify they're real, don't rewrite them**:
- **brand-grid nav guard** (F10 — nav-orphan, **5th consecutive sprint**): every brand route has a tile.
- **component-mount guard** (F12): every feature component has an importer. *(Sparkline is waivered —
  confirm the waiver is still documented and the stale-waiver check fires if it's removed.)*
- **dead-link guard** (F19): every internal href resolves. ⚠️ **It missed F19 because it only scanned
  `app/`.** Confirm it now scans `components/` **and re-break it**: add
  `` href={`/brands/${brandId}/nonexistent`} `` **inside a component** → must go RED naming that file.
  *This guard has already failed once — prove it works.*

---

## GROUP C — THE TRACKER (F1 · F2 · F3 · F4 · F21)
Sections 1 + 2 cover the query. **This section covers the RENDER:**
- The dashboard tracker shows **"0 / 1 gaps closed this month"** for the real fixture (F6 — honest).
- Measured Impact shows **"Validation audit scheduled — measured impact pending"**, and ⚠️ **NOT a
  zero, NOT a blank.** Assert the *absence* of `0`.
- ⚠️ **F7:** the dashboard contains **exactly ONE** work-completed surface. Assert the *count* of
  elements matching /work completed/i is **1** — so a vestigial second card can't creep back.

---

## GROUP D — HONESTY GUARDS (F6 · F8 · F18 · F20) — protect the truthful states

**These exist to stop a future "fix" turning an honest state into a lie.** They are the subtlest
guards here, and the most important.

- ⚠️ **F8 — the two NULLs are DIFFERENT.**
  - SaaS brand → Local Authority **absent from the DOM entirely** ("not applicable")
  - non-SaaS + NULL → the card **IS present**, shows an **em-dash + "Not yet measured"**, and is
    **EXCLUDED from the overall average**.
  - Assert Bondi's overall = **23.67** (3 dims), **NOT 17.75** (4 dims with NULL→0).
  **If someone "simplifies" these into one code path, this guard fires.**

- ⚠️ **F20 — `classifyScore(null)` must NEVER return a band.** Assert it returns `"unmeasured"` and
  that **no consumer maps `unmeasured` to red**. *This is F11's mechanism — it must stay disarmed.*

- **F6 — "0 / 1 gaps closed" is CORRECT** for a brand with 1 open, 0 complete. Guard it so nobody
  "fixes" an honest zero into a fabricated number.

- **F18 — an empty journeys list renders "No journeys yet"**, **not a 404** and not a crash. (The 404
  was a stale `.next` manifest, not code — but the empty-state path must stay honest.)

---

## GROUP E — CARRIED FINDINGS — guard the CURRENT (imperfect) behaviour

⚠️ **These are NOT fixed. Guard what they honestly do TODAY**, so the gap stays visible and doesn't
silently "resolve" into fabrication.

- **F9/F13 (→S6):** `remediation_tasks` has **no `explainability` column**; the rationale renders as
  **"Explanation will appear after gap analysis"**. ⚠️ Assert it renders **that honest placeholder** —
  and that the app **does NOT fabricate a rationale**. Also assert the confidence enum currently
  emits `likely` (canon binds `confirmed|likely|hypothesis`) — **document that only 3 of the LLD's 5
  fields ship.** When S6 lands, this guard must be *updated*, not deleted.
- **F14 (personas ~70%):** guard the 4 shipped elements; document the 4 absent.
- **F23 (→S7):** templates hardcode vertical + city ("top electricians in Melbourne" shown to a Sydney
  plumber). Guard the current text so the gap is *visible in the suite*, not forgotten.

---

## GROUP F — RESPONSIVE (F5)
- **≥lg** → the 5 steps render **horizontally**.
- **<lg** → they **stack vertically**.
- ⚠️ **No ungated `animate-pulse`** anywhere in the autopilot components (**RM-02** — grep #14 claimed
  PASS while a violation was live). Assert `prefers-reduced-motion` gating.

---

## CONSTRAINTS
- **Behaviour, not implementation.** No test may assert that source contains a particular string. If
  the only way to guard something is a source grep (as in Section 1's 1.5), **say so explicitly** and
  flag it as weak — a grep is not a guard.
- **Every guard gets a break-proof.** Re-introduce the bug → **RED** → revert → green.
- **Do NOT fix carried findings** (F9/F13, F14, F23). Guard today's honest behaviour.
- **Do NOT duplicate Sections 1–2.** Reference and move on.
- Real answer-key fixtures (Metropolitan / Bondi) — not invented data.
- Do **NOT** touch §12 QA — standalone final pass after Section 5.

## REPORT BACK (paste inline)
1. File paths + test count; a **table mapping every finding F1–F23 → its guard** (any finding with no
   guard: say so and why).
2. **The break-proof REDs** — at minimum **Group A** (revert an unwrap → renders 0) and the **F19
   dead-link re-break** (that guard has already failed once).
3. ⚠️ **The negative envelope test:** does any page still render a plausible **0** from a mis-shaped
   response? **If yes, the envelope class is NOT closed** — that's a finding.
4. Any guard you could only write as a source-grep — flagged as weak.
5. Full suite green (217 + Section 3).
