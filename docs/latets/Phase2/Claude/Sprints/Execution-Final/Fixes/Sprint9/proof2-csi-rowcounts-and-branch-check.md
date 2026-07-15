# PROOF 2 — before/after row counts (Sri runs the audit in the app; you count the rows)

## The split
- **Sri** starts the dev server + Inngest, opens the app, clicks **"Run audit"** on Metropolitan, and
  **watches the terminal.** ⚠️ **The terminal is the load-bearing proof** — an event chain that never
  reaches its listener is **invisible in code**. That is exactly how the dot-vs-slash bug survived a
  green grep for two sprints.
- **You** run the DB counts **before** and **after**, and settle the branch question below.

**Target DB: `visibleau_prod`** (the one the app runs against — Metropolitan's 18 audits, Bondi's
task, the 16 comparisons all live there).
**Metropolitan** = `418f321f-2489-4560-aaa9-895728580465`

---

## ⚠️ STEP 0 — SETTLE THE BRANCH DIVERGENCE FIRST (this may be a finding)

The Proof-1 report said: *"the emits were added on `dev/phase2`… **`classify-citation-sources.ts`
doesn't even exist on `main`**."*

**If an S5 source file never landed on `main`, the divergence is not small — and `main` is not the
artifact we've been auditing.** Settle it:
```bash
cd c:/startup/VisibleAU/src
git branch --show-current
git log --oneline -1 main
git log --oneline -1 dev/phase2
# How far apart are they?
git rev-list --count main..dev/phase2      # commits on dev/phase2 not on main
git rev-list --count dev/phase2..main      # commits on main not on dev/phase2
# What FILES differ? (the real question)
git diff --stat main dev/phase2 | tail -5
# Specifically:
git ls-tree main --name-only -r | grep -c "classify-citation-sources" || echo "ABSENT on main"
```
**REPORT:**
- Which branch is checked out (the audit must run against **`dev/phase2`**, where the fixes live).
- **How many commits / files apart** are `main` and `dev/phase2`?
- ⚠️ **Is `classify-citation-sources.ts` genuinely absent from `main`?** If an S5 file never merged,
  **what else didn't?** That's a finding in its own right — `main` would be missing shipped work.

⚠️ **Do NOT merge or deploy anything.** Report the divergence; **Sri decides.**

---

## STEP 1 — BEFORE (run this, then tell Sri to click "Run audit")
```bash
psql "$PROD" -c "
  SELECT
    (SELECT COUNT(*) FROM citation_source_intelligence)                            AS csi_total,
    (SELECT COUNT(*) FROM citation_source_intelligence
       WHERE brand_id='418f321f-2489-4560-aaa9-895728580465')                      AS csi_metro,
    (SELECT COUNT(*) FROM webhook_deliveries)                                      AS webhooks,
    (SELECT COUNT(*) FROM citations
       WHERE audit_id IN (SELECT id FROM audits
                          WHERE brand_id='418f321f-2489-4560-aaa9-895728580465'))  AS citations,
    (SELECT COUNT(*) FROM audits
       WHERE brand_id='418f321f-2489-4560-aaa9-895728580465')                      AS audits;"
```
⚠️ **`csi_total` should be 0 (or near-0) — `build-citation-source-intelligence` has NEVER FIRED.**
Record every number. **Also confirm `citations` > 0** — if there are no citations to classify, the
chain has nothing to work on and a zero after the run would be a *false negative*.

**→ Tell Sri: "BEFORE counts captured — run the audit now, and paste the terminal."**

---

## STEP 2 — AFTER (once Sri confirms the audit finished)
Re-run the identical query. Then:

```bash
# Did CSI actually gain rows for Metropolitan?
psql "$PROD" -c "
  SELECT source_domain, source_type, authority_score, created_at
  FROM citation_source_intelligence
  WHERE brand_id='418f321f-2489-4560-aaa9-895728580465'
  ORDER BY created_at DESC LIMIT 5;"

# A-3: did fanout-webhooks receive recommendation.created?
psql "$PROD" -c "
  SELECT event_type, status, created_at FROM webhook_deliveries
  ORDER BY created_at DESC LIMIT 5;"
```

### ⚠️ CLASSIFY THE RESULT — three outcomes, three very different meanings
| Outcome | Meaning |
|---|---|
| **CSI rows > 0** | ✅ **A-2 PROVEN.** The emit lands, the function executes, it writes. **First time in the product's history.** |
| **CSI still 0, and `build-citation-source-intelligence` NEVER APPEARED in the terminal** | ❌ **The emit is not reaching the listener.** Check the event name **character by character** on both sides — `citations/classified` (slash, plural, exact). ⚠️ **This is the dot-vs-slash class; it has bitten twice.** |
| **CSI still 0, but the function DID appear in the terminal** | ❌ **A SECOND BUG: it fired but wrote nothing** — a silent early-return. Read its guards. *"Ran" ≠ "worked."* |

**The third row is the one people miss.** A function appearing in the terminal is not proof it did
anything.

---

## CONSTRAINTS
- **READ-ONLY on the DB.** Count and inspect; do not seed, do not insert, do not clean up.
- **Do NOT invoke the Inngest function directly** to "make it work" — that **bypasses the exact seam
  under test.** The bug was never in the function; it was in whether the *event reaches it*. Only a
  real `Run audit` through the app proves the chain.
- Do NOT merge/deploy anything (Step 0 reports only).
- If a count doesn't move, **that is the finding.** Report it plainly — do not adjust anything to make
  it pass.

## REPORT BACK (paste inline)
1. ⚠️ **Step 0 — the branch divergence.** Which branch is checked out? How far apart are `main` and
   `dev/phase2`? **Is `classify-citation-sources.ts` really absent from `main` — and what else is?**
2. **BEFORE counts** (all five numbers). Is `csi_total` 0? Is `citations` > 0?
3. **AFTER counts.**
4. ⚠️ **The classification** — which of the three outcomes? If CSI is still 0, **which of the two
   failure modes** (emit not landing vs. fired-but-wrote-nothing)?
5. **`webhook_deliveries`** before → after (A-3).
