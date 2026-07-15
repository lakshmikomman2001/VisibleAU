# DIAGNOSE — `serve()` says **42**. Canon says **25**. A test says **29**. Settle it before Gate 3.

## Three sources disagree
| Source | Count |
|---|---|
| **S9 §12 canon** | *"serve() untouched (still **25** fns — no S9 addition)"* |
| **S9 §13 anti-patterns** | *"S9 adds NONE — serve() stays **25/25**"* |
| **S9 §14 handoff → Gate 3** | *"the 7-layer platform (37 tables, **25 Inngest functions**, 16 GAPs)"* |
| **The §12 QA script (A3)** | **42** — and marked **PASS** |
| **`e2e-cross-sprint-seams` (failing)** | expected **29**, got **42** |

**Something added ~17 Inngest functions and nobody noticed.** And A3 currently asserts `=== 42`, which
merely **pins whatever is there** — it was never anchored to 25, so it *cannot* detect an S9 addition.
Marking that PASS is the same failure mode as the original §12 greps: **it looks like a check.**

⚠️ **This matters because §14 hands that number to Gate 3**, whose entire job is cross-sprint
consistency. A wrong baseline propagates into the Phase-2 handoff.

READ-ONLY. Diagnose; change nothing except (optionally) the QA script's assertion once we know the
truth.

---

## TASK

### 1 — What is actually in `serve()`?
```bash
cd c:/startup/VisibleAU/src
# The functions array passed to serve():
sed -n '1,120p' app/api/webhooks/inngest/route.ts
# Count the entries in the functions array (not imports, not exports elsewhere):
grep -c "," app/api/webhooks/inngest/route.ts   # rough — then count the array properly
```
**List every function name in the array**, and report the true count.

⚠️ **Check HOW the QA script counts.** If it greps for `inngest.createFunction` across the repo, or
counts *exported handlers*, it will over-count — a function defined but **not registered in `serve()`**
is not a served function. **The number that matters is the length of the array passed to `serve()`.**
Report both numbers if they differ:
- functions **defined** (`createFunction` occurrences)
- functions **registered** in `serve()`

### 2 — Where did the extra ~17 come from?
```bash
# When did each function enter the serve() array?
git log --oneline -20 -- app/api/webhooks/inngest/route.ts
# And which sprint added them:
git log -p --follow app/api/webhooks/inngest/route.ts | grep -E "^\+.*[a-zA-Z]+Function|^commit|^Date" | head -60
```
**Attribute the growth by sprint.** Expect: S1–S8 each legitimately added functions, and canon's "25"
was simply **never updated** as the phase progressed. The failing test expecting **29** suggests it was
last accurate around S3–S4.

**Three possible verdicts — report which:**
- **A) Canon is STALE.** The functions are all legitimate S1–S8 additions; the "25" was frozen early
  and never revised. → **Canon must be corrected** (§12, §13, §14), and the true number carried into
  Gate 3.
- **B) The COUNT is measured wrong.** The script counts definitions, not `serve()` registrations. →
  Fix the script; the real number may well be 25.
- **C) Functions were ADDED that shouldn't exist.** Some were added outside their sprint's scope, or
  S9 added one despite "S9 adds NONE." → **A real finding.**

### 3 — Did S9 add ANY?
This is the question §12 was actually asking, and it's the only one that's an S9 concern.
```bash
# Diff serve() against the commit BEFORE S9 started (a8f20ed = S7 commit; find the S8 tip):
git log --oneline -5 --before="<S9 start date>" -- app/api/webhooks/inngest/route.ts
git diff <S8-tip>..HEAD -- app/api/webhooks/inngest/route.ts
```
**S9 must add ZERO.** If the diff is empty → the anti-pattern is satisfied regardless of the absolute
count. **That's the assertion A3 should be making.**

### 4 — Fix the check so it means something
A3 currently asserts `serve() === 42` — a snapshot, not an invariant. It cannot catch "S9 added one"
(the thing §12 wanted), only "someone removed one."

**Replace it with a set-difference guard:**
```
Assert the serve() array's CONTENTS match a checked-in manifest of expected function names
(e.g. tests/fixtures/inngest-functions.json).
→ Any ADDITION goes RED (naming the new function).
→ Any REMOVAL goes RED (naming the missing one).
→ Updating the manifest becomes a DELIBERATE, reviewable act.
```
That's the same set-difference shape as the nav-orphan / component-mount / dead-link guards — and it's
the only version of this check that would have caught an unauthorised addition.

---

## CONSTRAINTS
- **Do NOT change `serve()`.** We're settling what the number IS, not altering it.
- **Do NOT update canon unilaterally** — report the true count and the attribution; **Sri decides**
  what §12/§13/§14 should say.
- If S9 **did** add a function → that is a **finding**, report it as one.
- The fixed A3 guard must catch an **addition**, not just a removal.

## REPORT BACK (paste inline)
1. **The true `serve()` count**, and the **full list of registered function names**.
2. If it differs: functions **defined** vs functions **registered** (the script may be counting the
   wrong thing).
3. **The per-sprint attribution** — where did the growth come from?
4. ⚠️ **Did S9 add any?** (`git diff <S8-tip>..HEAD` on that file — must be empty.)
5. **VERDICT: A (canon stale) / B (miscounted) / C (unauthorised additions)?**
6. **The number Gate 3 should inherit** — and what §14's handoff line should say.
7. The set-difference guard replacing A3 + its re-break (add a fake function → RED).
