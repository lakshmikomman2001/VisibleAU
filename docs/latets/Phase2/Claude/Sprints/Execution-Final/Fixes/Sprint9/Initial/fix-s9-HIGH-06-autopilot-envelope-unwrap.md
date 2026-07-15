# FIX S9-HIGH-06 (F15) — Autopilot Loop: the SAME envelope-unwrap bug as F11 (F11's fix only touched health-check)

## Severity: HIGH — the sprint's flagship screen ("the aha moment for every Growth user") shows the wrong brand name and all-zero audit data.

## The finding (Metropolitan, `/brands/418f321f-.../autopilot`)
| Field | Truth (DB — same data the Health Check now renders correctly) | **Rendered** |
|---|---|---|
| Brand name | Metropolitan Plumbing | **"Brand"** ← the `?? "Brand"` fallback |
| Step 1 score | 36.3 | **0.0** |
| Step 1 engines | 4 | **0** |
| Step 1 prompts | (real count) | **0** |
| Step 1 state | audit HAS completed (18 audits) → **done** | **"In progress"** (stuck — the derivation can't advance without data) |

**This is F11's bug, in a second file.** F11's fix corrected `health-check/page.tsx` only. The
autopilot page reads `await res.json()` as if it were the inner payload — every API wraps
(`{ audit: {...} }`, `{ brand: {...} }`), so fields resolve `undefined` → `null` →
**`Number(null) = 0`**. The `"Brand"` string is literally the same `brand?.name ?? "Brand"` fallback
the Health Check showed pre-fix. Same signature, same cause.

**Proof it's the page, not the data:** the Health Check now renders Metropolitan's real numbers
(Sentiment 100, 4 engines, 10 July 2026) from these same APIs. The data is there. The autopilot page
just isn't unwrapping it.

## Task — `app/(auth)/brands/[brandId]/autopilot/page.tsx`

### 1 — Apply the SAME unwrap fix as F11
```bash
cd c:/startup/VisibleAU/src
# See exactly how it fetches + reads (compare against the now-correct health-check page):
sed -n '1,110p' "app/(auth)/brands/[brandId]/autopilot/page.tsx"
# The reference implementation (already fixed):
sed -n '35,80p' "app/(auth)/brands/[brandId]/health-check/page.tsx"
```
Unwrap each envelope, defensively (missing envelope → null → honest empty state, not a crash):
```ts
const brand = brandRes.ok ? (await brandRes.json())?.brand ?? null : null;
const audit = auditRes.ok ? (await auditRes.json())?.audit ?? null : null;
// …and any other fetches on this page (tasks / drafts / gaps) — check EACH one's envelope key.
```
**Check every fetch on the page**, not just brand/audit: the loop reads the top remediation_task
(step 2), the explainability rationale (step 3), and the content_draft (step 4). If `/tasks` returns
`{ tasks: [...] }` and the page reads the top level, steps 2–4 are broken too — they currently look
"pending", which is indistinguishable from "no data arrived." **Verify each envelope key against its
route.**

### 2 — Step 1 must show REAL values and be `done`
Per §6U.2 step 1 = "Audit complete (score · engines · prompts)". With the unwrap fixed, Metropolitan
must show its real score / engine count / prompt count — and since the audit HAS completed, step 1's
presentational state should be **`done`**, not `current`/"In progress". Confirm `deriveStepStatus()`
advances correctly once real data arrives (it was likely stuck at step 1 *because* the data was null).

### 3 — Re-check steps 2–5 with real data
Metropolitan has **no open remediation_task** (Step 0 confirmed: "Top open remediation_task: (none)").
So for Metropolitan the loop legitimately can't advance past step 1 → steps 2–5 SHOULD be `pending`,
and §6U.2's **loop-not-started EmptyState** ("the loop will populate after the first audit + gap") may
be the correct state. **Confirm which:** with real data, does Metropolitan show a sensible
"audit done, no gap yet" state rather than a stuck "In progress" with zeros?

**Then walk BONDI** (`0f531803-b529-4d09-9fd6-b6272b5baba8`) — it HAS an open task ("Update local
directory listings"), so its loop should advance further:
- step 1 done (real score/engines/prompts)
- step 2 = the real gap title
- step 3 = the explainability rationale (⚠️ known F9/F13 gap — description is NULL; expect empty,
  report what renders)
- step 4 = the content_draft (if one exists)
- step 5 = **"validation audit scheduled — pending"** (score_after IS NULL — the honesty rule)

### 4 — The honesty rule still holds (don't regress it)
`buildMeasureDescription()` is CORRECT (`scoreAfter == null → "Validation audit scheduled — pending"`,
uses `liftAchieved` not the trend). The unwrap fix must not break it — with real task data flowing,
step 5 must STILL show pending (every `score_after` is NULL system-wide).

## Verify (on screen — both brands)
1. **Metropolitan** → header says **"Metropolitan Plumbing"** (not "Brand"); step 1 shows the real
   score · engines · prompts (not 0.0 · 0 · 0); step 1 is `done`.
2. **Bondi** → the loop advances: step 2 shows "Update local directory listings"; step 5 shows
   **"validation audit scheduled — pending"**.
3. **`<lg`** → the vertical stacked timeline (F5's other half — still owed).
4. Terminal → 200s, and note WHICH routes the page calls.

## Constraints
- Do NOT change `buildMeasureDescription` / the honesty rule (it's correct).
- Do NOT change the stepper's presentational states (`done|current|pending` — correct).
- Do NOT change the horizontal ≥lg layout (F5 — it renders correctly).
- Defensive unwrap (`?.audit ?? null`) → a missing envelope yields the honest empty state.
- Check EVERY fetch's envelope on this page, not just brand/audit.

## Also — this is now a CLASS, not a one-off
F11 (health-check) and F15 (autopilot) are the same bug in two files. **Sweep for others:**
```bash
# Any page/component reading await res.json() WITHOUT unwrapping a named envelope:
grep -rn "await .*\.json()" app/\(auth\)/ components/ | grep -viE "\.json\(\)\)\?\.|\.json\(\)\)\." | head -30
```
For each hit, check whether the route it calls wraps its payload. **Report any other page with the
same latent bug** — it renders plausible zeros rather than crashing, so nothing else will catch it.

## Report back (paste inline)
1. The unwrap diff + **every** envelope key on this page (brand/audit/tasks/drafts).
2. **Screenshot Metropolitan** — real name + real step-1 values + step 1 `done`.
3. **Screenshot Bondi** — the loop advanced (step 2 gap title; step 5 pending).
4. **Screenshot `<lg`** — the vertical stack (closes F5).
5. The sweep: any OTHER page with an unwrapped `res.json()` on a wrapped route?
