# Claude Code — DIAGNOSE (report-first, no fixes): is Marrickville's 0.00 audit the zero-engines bug?

During the bulk re-audit test, two brands were audited: **Bondi Plumbing → score_composite 88.25** (audit #132)
and **Marrickville Dental → score_composite 0.00** (audit #133). A legitimate brand audit completing with an
EXACT 0.00 composite is suspicious. There is a known Phase 1 open bug — **`fix-audit-zero-engines`** — where an
audit on an **Agency-tier** brand resolves an EMPTY engine list (tier→engine resolution fails), makes ZERO LLM
calls, scores nothing, and completes at 0.00 with `status='complete'` and no error. The org here IS Agency tier,
so Marrickville's 0.00 may be a live reproduction of that bug — OR Marrickville may simply be a thin/placeholder
brand with no website/content, in which case 0.00 is the honest result.

**This is DIAGNOSIS ONLY. Run the queries, report the verdict. Do NOT change any source.** The distinguishing
question is binary: **did Marrickville's audit run with engines, or zero engines?**

---

## STEP 1 — Inspect the Marrickville audit row (audit #133)
```bash
psql "$DATABASE_URL" -c "SELECT audit_number, brand_id, status, score_composite, engine_count, engines, llm_calls_made, triggered_by, created_at FROM audits WHERE audit_number = 133;"
```
(If column names differ, adjust — look for the engine-list column, the engine-count column, and any
llm-calls/total-calls column. Report the ACTUAL column names you find.)

Report the values of: `engine_count`, `engines` (the array), and `llm_calls_made` (or equivalent).

## STEP 2 — Identify what kind of brand Marrickville is
```bash
psql "$DATABASE_URL" -c "SELECT id, name, website_url, created_at FROM brands WHERE id = (SELECT brand_id FROM audits WHERE audit_number = 133);"
```
Report: does Marrickville Dental have a real `website_url` set, or is it a bare placeholder (null/empty website,
obviously a seed/test brand)?

## STEP 3 — Compare against the WORKING audit (Bondi #132) as a control
```bash
psql "$DATABASE_URL" -c "SELECT audit_number, brand_id, status, score_composite, engine_count, engines, llm_calls_made FROM audits WHERE audit_number = 132;"
```
Bondi scored 88.25 in the SAME bulk run, so its engine_count/engines/llm_calls show what a HEALTHY audit looks
like. Compare Marrickville to it: same engine_count or zero? This isolates whether the difference is
engine-resolution (the bug) or just content (benign).

## STEP 4 — If engines are zero, locate the resolution point (read-only, for the fix scope)
ONLY if STEP 1 shows `engine_count = 0` / `engines = []`:
```bash
# The tier→engine source of truth + how the audit path resolves it
grep -rnE "TIER_ENGINES|enginesForTier|tier-engines|engineCount|engine_count|engines:" lib/llm/tier-engines.ts lib/audit/ inngest/functions/run-audit*.ts app/api/audits/route.ts --include=*.ts | head -30
# What casing does the org/brand tier column store vs what keys the engine map uses?
grep -rnE "'agency'|'Agency'|tier ===|tier\.|subscriptions.tier|organizations.tier" lib/llm/tier-engines.ts lib/audit/ --include=*.ts | head -20
```
Report (do NOT fix): does `tier-engines.ts` key on lowercase (`'agency'`) or title-case (`'Agency'`)? What tier
value does the audit path actually pass in, and from which source (`subscriptions.tier`)? Is there a fallback
that could yield `[]` instead of the Free 2-engine default? This identifies whether it's a key-casing mismatch, a
mis-keyed empty fallback, or the tier read from the wrong source.

## VERDICT (report one of these clearly)
- **(A) ZERO-ENGINES BUG REPRODUCED** — Marrickville has `engine_count = 0` / `engines = []` / `llm_calls_made =
  0`, AND it's a real brand (has a website) OR Bondi #132 shows a non-zero engine_count from the same run. This
  is `fix-audit-zero-engines` live on real data. → A fix is warranted; report the likely root cause from STEP 4.
- **(B) BENIGN — empty/placeholder brand** — Marrickville has NO website / is a bare seed brand, and/or its audit
  DID run engines (engine_count > 0) but found no content to score. The 0.00 is honest. → No fix needed; note
  Marrickville is a placeholder.
- **(C) SOMETHING ELSE** — engine_count > 0 but still 0.00 for a real brand with content, or another anomaly.
  Report the specifics for further investigation.

## REPORT
- Marrickville #133: status, score_composite, engine_count, engines, llm_calls_made (+ actual column names).
- Marrickville brand: real website or placeholder?
- Bondi #132 control: engine_count / engines / llm_calls_made for comparison.
- If zero engines: the tier-resolution findings from STEP 4 (key casing, tier source, fallback behaviour).
- **The verdict: (A), (B), or (C)** — with the evidence that decides it.
- Confirm: no source changed (diagnosis only).

## NOTE
If the verdict is (A), there is an existing fix prompt from a prior session (`fix-audit-zero-engines.md`) anchored
to `tier-engines.ts` (lowercase snake_case keys, `enginesForTier()` with the Free fallback) and the Sprint 3
§6.6 three-table load pattern. The fix would be re-validated against current code before applying — do NOT apply
it now; this task only confirms whether the bug is real.
