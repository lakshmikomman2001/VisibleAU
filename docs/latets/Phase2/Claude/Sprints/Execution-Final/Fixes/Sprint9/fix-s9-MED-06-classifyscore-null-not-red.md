# FIX S9-MED-06 (F20) — `classifyScore(null)` returns `'red'` — the latent F11 mechanism, still armed

## Severity: MEDIUM — the exact mechanism that made every brand read "0/100 · Critical" is still in the code. It's currently masked by a downstream workaround.

## The finding (surfaced by Section 1, by asserting CANON instead of the code)
`components/domain/health-check/health-check-panel.tsx:61`:
```ts
if (score == null) return "red";     // ← canon violation
```
**Canon (§6U.3):** a NULL score is **"not yet measured"** — a *distinct state*, **not a red band**.
Red means "measured, and bad." NULL means "we don't know."

**Why it currently looks fine on screen:** `buildDimensions` compensates by setting `pending: true`
when the score is null, so the panel renders the "Not yet measured" card anyway (F8's fix). **The
contract is violated at the function level and papered over by its caller.**

## Why this matters — it is F11, waiting for a second caller
F11 rendered every brand as **0/100 "Critical"** because `Number(null) → 0 → red`. We fixed the
*symptom* (the envelope unwrap). **This is the underlying mechanism, still armed:** any future caller
that uses `classifyScore` **without** `buildDimensions`' compensation will silently render "Critical"
for unmeasured data — no crash, no test failure, a perfectly plausible red band built from nothing.

That's precisely how F11 shipped past 18/18 greps and 70/70 tests.

## Task — fix at root, remove the compensation

### 1 — Make the function honest
`classifyScore` should return a **distinct** value for "not measured" — not a band:
```ts
type Band = "green" | "amber" | "red";
type BandResult = Band | "unmeasured";       // or: Band | null — pick ONE and lock it

function classifyScore(score: number | null | undefined, dim: Dimension): BandResult {
  if (score == null || Number.isNaN(score)) return "unmeasured";   // NOT "red"
  // ...existing 3-band logic, unchanged
}
```
Whichever sentinel you choose (`"unmeasured"` or `null`), **be consistent** and make it impossible to
confuse with a band.

### 2 — Make `buildDimensions` READ that, not compensate for a wrong answer
It currently sets `pending: true` by re-checking `score == null` itself. Change it to derive `pending`
from **`classifyScore`'s** result:
```ts
const band = classifyScore(score, dim);
const pending = band === "unmeasured";
```
Now there is **one** source of truth for "is this measured?", and the workaround disappears.

### 3 — Every consumer of the band must handle `unmeasured`
```bash
cd c:/startup/VisibleAU/src
grep -rn "classifyScore" app/ components/ lib/ tests/
```
- Any switch/map on the band (colour, icon, label) must handle `unmeasured` explicitly.
- **TypeScript should now FAIL** anywhere a consumer assumes the result is one of 3 bands. **That's
  the point** — the type system finds the callers for you. Fix each.

### 4 — The overall average must still EXCLUDE unmeasured dims
⚠️ **F8's fix must not regress.** Bondi's overall = **23.67** (3 measured dims: 50, 0, 21 — Local
Authority NULL is excluded), **NOT** a 4-dim average treating NULL as 0 (which would give 17.75).
Section 1's test 1.2 asserts exactly this — **it must stay green.**

## Verify
1. Update Section 1's tests to assert the new contract:
   - `classifyScore(null, 'sentiment')` → **`"unmeasured"`** (not `"red"`)
   - The existing "NULL is not red" assertion now tests the FUNCTION, not the workaround.
2. **Re-break:** revert `classifyScore` to `return "red"` → the new test goes **RED**. Paste it.
3. **Screenshot Bondi's Health Check** — Local Authority still shows the em-dash + "Not yet measured"
   card, and the overall is still **23.67 → RED (amber/red band unchanged)**. F8 must not regress.
4. **Screenshot Metropolitan's Health Check** — all four bands still match the answer key
   (Sentiment 100 green · Presence 5 red · Site Readiness 37 red · Local Authority 20 red ·
   Overall 40.5 amber).
5. `pnpm test` — all 166 sprint-9 tests still green.

## Constraints
- Fix the FUNCTION; delete the compensation. Don't add a second workaround.
- Do NOT regress F8 (the unmeasured dim is shown, and excluded from the average).
- Do NOT regress F11 (the bands on screen must still match the DB answer key).
- If TypeScript surfaces callers that assumed 3 bands — **that's the feature.** Fix them; don't cast
  the type away.

## Report back (paste inline)
1. The diff (function + `buildDimensions` + every consumer TS forced you to fix).
2. **How many callers TypeScript flagged** — that number IS the blast radius of the latent bug.
3. The re-break RED output.
4. **Both Health Check screenshots** — Bondi (23.67, unmeasured card) and Metropolitan (answer key).
5. Full suite green.
