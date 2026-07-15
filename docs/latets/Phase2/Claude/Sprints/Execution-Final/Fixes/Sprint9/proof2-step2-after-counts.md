# PROOF 2 — STEP 2: AFTER counts (the audit is finished; the terminal already showed the function RAN)

## What the terminal already proved
The audit completed (Audit #20 · 8m 16s · 200 LLM calls · US$0.22 · Visibility 36.3), and the chain
fired:
```
POST .../fnId=visibleau-classify-citation-sources&stepId=step            206 in 7.9s
POST .../fnId=visibleau-build-citation-source-intelligence&stepId=step   206 in 5.8s   ← FIRST TIME EVER
POST .../fnId=visibleau-generate-recommendations&stepId=step             206 in 5.7s
POST .../fnId=visibleau-fanout-webhooks&stepId=step                      206 in 265ms  ← A-3 receiving
```
**`build-citation-source-intelligence` EXECUTED** — immediately after `classify-citation-sources`, with
a `206` (step complete). The emit landed; the listener woke. **That function had never run once in the
product's history.**

## ⚠️ But "RAN" ≠ "WROTE"
A function can fire, hit a silent early-return, and write nothing — and the terminal would look exactly
like this. **That is the last distinction, and it is a real failure mode.** This step settles it.

**New audit ID: `f3cda7f6-bd64-4794-986f-63b639262cb0`** (Audit #20)
**Metropolitan:** `418f321f-2489-4560-aaa9-895728580465`
**DB: `visibleau_prod`** · READ-ONLY

---

## 1 — AFTER counts (same query as the BEFORE)
```bash
cd c:/startup/VisibleAU/src
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
**BEFORE was:** `csi_total=3 · csi_metro=3 · webhooks=2 · citations=3205 · audits=18`

## 2 — ⚠️ THE DECISIVE QUERY: did the NEW audit produce rows?
`onConflictDoNothing` keys on `(brandId, auditId, engine, sourceType)`. **This is a NEW `audit_id`, so
there can be NO conflict.** Rows for it either exist or they don't — no ambiguity.
```bash
psql "$PROD" -c "
  SELECT engine, source_type, citation_count, brand_present, gap_severity, created_at
  FROM citation_source_intelligence
  WHERE audit_id='f3cda7f6-bd64-4794-986f-63b639262cb0'
  ORDER BY engine, source_type;"
```
⚠️ **This is the whole proof.** Rows here = the function ran AND wrote. Zero rows = it ran and wrote
nothing.

## 3 — Sanity-check the output against the source data
The 3 pre-existing rows were **synthetic** (source types like `official_website` that the classifier
cannot produce). **The new rows must look like REAL classifier output.**
```bash
# What did the classifier actually produce for this audit?
psql "$PROD" -c "
  SELECT engine, cited_source_type, COUNT(*) 
  FROM citations 
  WHERE audit_id='f3cda7f6-bd64-4794-986f-63b639262cb0'
  GROUP BY engine, cited_source_type
  ORDER BY engine;"
```
⚠️ **The CSI rows must MATCH these `(engine, source_type)` combos.** If citations show
`(gemini, other) × 10` then CSI should have a `(gemini, other)` row with `citation_count = 10`.
**A row that does not match the source data is fabricated, not computed** — that is exactly how we
caught the 3 synthetic rows.

## 4 — A-3: did the webhook fan-out record anything?
```bash
psql "$PROD" -c "
  SELECT event_type, status, created_at FROM webhook_deliveries
  ORDER BY created_at DESC LIMIT 6;"
```
Look for a **`recommendation.created`** event_type. ⚠️ The `deliver-webhook` step threw `ECONNREFUSED`
repeatedly — **that is a dead webhook URL in the test data, not a code bug.** The fan-out fired; the
*target* doesn't exist. **Confirm the delivery ROW was created (even with a failed status)** — that
proves A-3's chain, independent of whether the endpoint is reachable.

---

## ⚠️ CLASSIFY THE RESULT
| Outcome | Verdict |
|---|---|
| **Rows exist for `f3cda7f6…`, matching the citation data** | ✅ **A-2 PROVEN END TO END** — emit lands, function fires, function writes, output is real. **First execution in the product's history.** |
| **`csi_total` still exactly 3 / zero rows for the new audit** | ❌ **A SECOND BUG.** The function ran (206 in the terminal) but wrote nothing → **a silent early-return.** Read its guards in `citation-intelligence.ts:70` and report which one bailed. |
| **Rows exist but DON'T match the citation data** | ❌ **A third bug** — it's writing fabricated values, like the 3 synthetic rows. |

## CONSTRAINTS
- **READ-ONLY.** Count and inspect. Do not insert, clean up, or "fix" the 3 synthetic rows yet.
- If zero rows → **that is the finding.** Report it plainly; do not re-run the function to force a
  result.

## REPORT BACK (paste inline)
1. **AFTER counts** (all five) vs BEFORE (`3 · 3 · 2 · 3205 · 18`).
2. ⚠️ **The rows for audit `f3cda7f6…`** — how many, and what do they contain?
3. **Do they MATCH the actual citation `(engine, source_type)` distribution** for that audit?
4. **`webhook_deliveries`** — is there a `recommendation.created` row (A-3)?
5. ⚠️ **The verdict** — which of the three outcomes?
