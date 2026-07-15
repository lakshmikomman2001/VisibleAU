# VERIFY GATE 3 HIGH FIXES (`d5f47f8`) — the 4 proofs that are still owed

## Why verification is non-negotiable for THESE findings
**Every Gate 3 HIGH is a SILENT failure.** None crash. None fail a test. **A green suite is the exact
condition under which all seven shipped** — for nine sprints. So "51 files changed, 2870 tests pass"
tells us nothing about whether they're fixed.

The four proofs below are behavioural. **Each is the only thing that distinguishes "the code looks
right" from "the feature works."** That distinction has been wrong ~35 times across S9 + Gate 3.

---

## PROOF 1 — B-2/B-3: regenerate a REAL report

The narrative generator has been broken **since S4**. `compositeScore` was always `0` and
`qualityStatus` always `undefined` — so **the correct path has NEVER executed, not once.** The fix
compiles; that is not evidence it runs.

```bash
cd c:/startup/VisibleAU/src
# Generate a report for Metropolitan (418f321f-2489-4560-aaa9-895728580465)
# — use whatever the app's real path is: the /reports/generate route, or the Inngest fn directly.
```

**Then READ the output and report:**
1. ⚠️ Does the exec summary show a **real delta**, or still **"Visibility improved by 0.0 points"**?
2. ⚠️ Do the **data-quality caveats** now appear (RULE 1 — no causal language; RULE 2 — confidence
   notes)? **They have never fired in the product's history.**
3. Does the **key-win / key-gap** branch execute? (It never has — it was gated on `compositeScore`.)

**Paste the actual generated text.** If it still says 0.0, the fix didn't take.

---

## PROOF 2 — A-2/A-3: the pipelines must actually FIRE

`build-citation-source-intelligence` has **never run** — its trigger event was never emitted.

```bash
# BEFORE (should be 0 — it has never fired):
psql "$PROD" -c "SELECT COUNT(*) FROM citation_source_intelligence;"

# Trigger a real audit (or manually send citations/classified) for Metropolitan, then:
psql "$PROD" -c "
  SELECT COUNT(*) FROM citation_source_intelligence
  WHERE brand_id='418f321f-2489-4560-aaa9-895728580465';"
```
⚠️ **Must be > 0.** A compiling emit is a claim; a row is a proof.

**Read the server terminal while it runs** — that is the only place a dead event chain shows itself
(the lesson from the dot-vs-slash bug). Confirm the function actually *executes*, not just that the
event is sent into the void.

**Same for A-3:** does `recommendation.created` now reach `fanout-webhooks`? Check
`webhook_deliveries` for new rows.

---

## PROOF 3 — D-2/D-3: BEHAVIOURAL break-proofs (a grep proves nothing)

⚠️ **F28 taught us this at cost:** the first F28 "break-proof" was a grep asserting the string
`assertTier` appeared in the file. It would have stayed **green** for
`if (false) await assertTier(...)`. **Do not repeat it.**

### 3a — A D-2 route (read path)
1. Comment out `await assertTier(...)` in **one** D-2 route (e.g. `entity-score`).
2. Run the free-tier test.
3. ⚠️ **It MUST go RED with a `200` and the payload in the body** — not a 500, not a 404. Paste it.
4. Revert → green.

### 3b — A D-3 `[id]` route (⚠️ **the WRITE path**)
**This is the one nobody has tested.** F28's own break-proof caught a **`201`** — a free-tier user
*creating* a remediation task — precisely because only reads were tested.

- Free-tier **`GET`** `/api/brands/{id}/tasks/{taskId}` → **403**
- ⚠️ Free-tier **`PATCH`** `/api/brands/{id}/tasks/{taskId}` → **403** (must NOT be 200/204)
- ⚠️ Free-tier **`DELETE`** (if it exists) → **403**
- Same for `drafts/[id]`.
- **Break-proof each:** disable the gate on the **PATCH handler** → must go **RED showing the write
  succeeded.** Paste it.

⚠️ **If any `[id]` route has NO tier check on its write handler, that is a live finding** — a free
user modifying paid-tier data.

---

## PROOF 4 — B-1: the emitter↔listener field matrix (close the CLASS)

`organizationId` vs `orgId` has now bitten **TWICE** (S7's null-org crash, then Gate 3's B-1). Fixing
one instance is not closing the class.

```bash
# Every listener's destructure:
grep -rn -A2 "event.data" inngest/functions/*.ts
# Every emitter's payload:
grep -rn -B1 -A4 "\.send({" app/ lib/ inngest/ --include=*.ts
```

**Build the matrix — for EVERY event:**
| Event | Emitter sends | Listener destructures | Match? |
|---|---|---|---|
| … | `{brandId, organizationId}` | `{brandId, orgId, auditId}` | ❌ |

⚠️ **Report EVERY mismatch, and every field a listener expects that no emitter sends** (that field
arrives `undefined` → NULL → a 23502 waiting to happen). **Is there a third?**

---

## PROOF 5 — ⚠️ WHERE ELSE HAS TYPESCRIPT BEEN SILENCED?

B-2 and B-3 were **both** hiding behind **one cast pattern, in one file**:
```ts
(trend as Record<string, unknown>).qualityStatus
```
**The compiler would have caught both.** Someone silenced it. **If that pattern appears elsewhere,
there are more B-2s waiting** — silently zeroed values, plausible output, no error, no test failure.

```bash
grep -rn "as Record<string, unknown>\|as unknown as\|as any\|@ts-ignore\|@ts-expect-error" \
  lib/ app/ inngest/ components/ --include=*.ts --include=*.tsx
```
**Report every hit with its context.** For each: is it a legitimate boundary cast (parsing JSON,
external API) — or **a silenced type error hiding a field-name drift**? ⚠️ **Any cast on a DB row or
an event payload is suspect** — that is exactly the B-2/B-3 shape.

---

## CONSTRAINTS
- **Behavioural proofs only.** No grep may stand in for a break-proof.
- **Read the server terminal** during Proof 2 — a dead event chain is invisible in the code.
- If a proof **fails**, say so plainly. A fix that doesn't work is a finding, not an embarrassment.
- Do not weaken a test to make it pass.

## REPORT BACK (paste inline)
1. **The regenerated report text** — real delta, or still "0.0 points"? Do the quality caveats appear?
2. **`citation_source_intelligence` row count** (before → after) + the terminal output showing the
   function executing. And `webhook_deliveries` for A-3.
3. **The D-2 read RED** and ⚠️ **the D-3 WRITE RED** (free-tier PATCH → the write succeeded).
4. **The full emitter↔listener field matrix.** Any third mismatch?
5. ⚠️ **Every `as any` / `as Record` / `@ts-ignore` in the codebase**, classified: legitimate boundary
   cast, or a silenced drift? **This is where the next B-2 is hiding.**
