# QUERY — Where did the 3 `citation_source_intelligence` rows come from? (run BEFORE the audit)

## The contradiction
- **Gate 3 (A-2) says:** *"`build-citation-source-intelligence` listens for `citations/classified`;
  `classify-citation-sources` never emits it. **The pipeline has never fired.**"*
- **But the BEFORE count says:** `citation_source_intelligence` has **3 rows** (created **July 7** —
  before the emit was added on July 14).

**Both cannot be true unless something ELSE wrote those rows.**

⚠️ **This matters for the proof:** if we don't know what produced them, then a `3 → 6` result after the
audit proves only that *something* wrote rows — **not that OUR emit caused it.** Settle it first.

**The suspicious ratio:** **3 CSI rows against 3,205 citations.** If the function aggregates **by source
domain**, 3 might be legitimate (3 distinct domains). If it writes per-citation or per-source, **3 is
nonsense** — and those rows came from somewhere else.

READ-ONLY. Do not start the server yet; do not run the audit yet.

## Task

### 1 — What ARE the 3 rows?
```bash
cd c:/startup/VisibleAU/src
psql "$PROD" -c "
  SELECT id, brand_id, source_domain, source_type, authority_score, audit_id, created_at
  FROM citation_source_intelligence
  ORDER BY created_at;"
```
- Do they look **real** (plausible AU domains, sensible authority scores) or **synthetic** (seed-ish
  placeholder values)?
- Is there an **`audit_id`** on them? If so, **which audit** — and does that audit still exist?

### 2 — ⚠️ WHO ELSE WRITES TO THIS TABLE?
This is the decisive question.
```bash
grep -rn "citationSourceIntelligence\|citation_source_intelligence" \
  lib/ app/ inngest/ db/ tests/ scripts/ --include=*.ts --include=*.sql | grep -viE "^tests/.*expect|SELECT"
```
Look specifically for **INSERT / `.insert(` / `.values(`** paths:
- Is `build-citation-source-intelligence.ts` the **only** writer?
- Is there a **seed** file? (`db/seed/…`)
- Does any **other** Inngest function or route write to it?
- Did a **migration** insert rows?

⚠️ **If `build-citation-source-intelligence.ts` is the ONLY writer, then it HAS run** — and **Gate 3's
A-2 premise is wrong.** That is a finding about the audit, not about the code. Say so.

### 3 — Could it have fired via a different event name?
```bash
grep -n "event:\|trigger" inngest/functions/build-citation-source-intelligence.ts
git log --oneline -5 -- inngest/functions/build-citation-source-intelligence.ts
git log --oneline -5 -- inngest/functions/classify-citation-sources.ts
```
Did the trigger event **change name** at some point? If it previously listened for something that
*was* emitted (and was later renamed), that explains 3 old rows and a dead pipeline since.
**Check the git history around July 7.**

### 4 — What SHOULD the row count be?
```bash
# How many DISTINCT source domains does Metropolitan actually have?
psql "$PROD" -c "
  SELECT COUNT(DISTINCT source_domain) AS distinct_domains
  FROM citations
  WHERE audit_id IN (SELECT id FROM audits
                     WHERE brand_id='418f321f-2489-4560-aaa9-895728580465');"
```
⚠️ **This is the answer key for the AFTER count.** If Metropolitan has, say, 47 distinct source
domains, then a correctly-firing `build-citation-source-intelligence` should produce **~47 rows**, not
3. **Know this number before you run the audit** — the F11 discipline.

If the function is **upsert**-based (one row per domain), the count won't grow much on a re-run — it'll
**update `updated_at`** instead. ⚠️ **Then "3 → 3" would NOT be a failure**, and we'd need to check
timestamps, not counts. **Report which semantics the function uses (INSERT vs UPSERT).**

## Report back (paste inline)
1. **The 3 rows** — real or synthetic? Do they have an `audit_id`?
2. ⚠️ **Is `build-citation-source-intelligence.ts` the ONLY writer?** (If yes → **Gate 3's A-2 is
   wrong** and the function HAS run before.)
3. Did the **trigger event name change** around July 7?
4. ⚠️ **The answer key:** how many **distinct source domains** does Metropolitan have? *(= how many
   rows a correct run should produce.)*
5. ⚠️ **INSERT or UPSERT?** — this determines whether the AFTER proof is a **row count** or an
   **`updated_at` timestamp**.
