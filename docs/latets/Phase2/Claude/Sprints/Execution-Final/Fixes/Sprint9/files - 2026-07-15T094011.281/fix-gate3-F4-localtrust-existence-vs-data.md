# FIX Gate 3 F-4 [MED] — `computeLocalAiTrustScore` fabricates a score from silent zeros

## The bug
`lib/platform/local-ai-trust-scorer.ts` gates on whether `local_seo_results` **exists as a table** —
not on whether a **row exists for the brand**:
```ts
// checks to_regclass('local_seo_results') — table existence only
// then lines ~69/72:
const gmbScore  = lsr?.gmb_score  ?? 0;   // ⚠️ no row → 0
const napScore  = lsr?.nap_score  ?? 0;   // ⚠️ no row → 0
```
**Today** the table doesn't exist, so it returns NULL correctly. **But the moment the table exists and
is empty** — which is *exactly* what a fresh `drizzle-kit migrate` produces (and F-2's
`0008_brief_luckman.sql` still creates it) — `lsr` is `undefined`, both scores fall to `0`, and the
function returns a **fabricated composite** (45% of its weight from silent zeros) instead of the
mandated NULL.

⚠️ **This is the F11 pattern** — `undefined → 0 → a plausible, wrong score`. And it **directly violates
S6b-02**: *"`local_ai_trust_score` = NULL until `local_seo_results` **has data**."* The spec says "has
data"; the code checks "table exists." **Those are different conditions.**

**This is latent, not live** (the table doesn't exist yet) — but it's a landmine primed to detonate the
first time local-SEO tables are created empty. Fix it before that happens.

## Task
```bash
cd c:/startup/VisibleAU/src
cat lib/platform/local-ai-trust-scorer.ts
```
1. **Change the gate from existence to data.** The function must return **NULL** (with its "not yet
   measured" reason) when there is **no row for this brand**, not just when the table is absent.
   - Keep the table-existence check (avoids a query error when the table doesn't exist), **but add**:
     if the table exists and the query returns **no row for this brand** → return NULL, do **not**
     fall through to `?? 0`.
2. ⚠️ **Never let `gmb_score` / `nap_score` default to 0 to produce a composite.** A missing input
   means *unmeasured*, not *zero*. If a real row exists but a single field is null, decide explicitly
   (per S6b-02) — but a **missing row is always NULL**.
3. **Fix the stale reason string (F-5, do it here):** it currently says *"activates with local SEO data
   (Sprint 8)."* S8's local-SEO was **DEFERRED and removed** (OQ-1). Reword to not promise a shipped
   sprint — e.g. *"Local trust scoring activates once local directory data is available."*

## Break-proof (behavioural — the existence-vs-data distinction)
```
Test 1: table ABSENT → returns NULL (reason set)           [current behaviour — keep]
Test 2: table EXISTS but NO ROW for brand → returns NULL    ⚠️ THE FIX — this is what F-4 is
Test 3: table EXISTS with a real row → returns a real score
```
⚠️ **Test 2 is the whole finding.** Create the table empty in a throwaway/test DB, call the scorer, and
assert **NULL — not 0, not a partial composite.** If it returns a number, F-4 isn't fixed.

## Constraints
- Do NOT create/seed `local_seo_results` in prod — it's **DEFERRED (§0.6)**. Test 2 uses a throwaway/
  test DB only.
- A missing row → **NULL**, always. Never a zero-derived score.

## Report back
1. The gate change (existence → data-existence).
2. ⚠️ **Test 2 result:** empty table → **NULL**, confirmed (not 0)?
3. The reworded reason string (F-5).
