# DIAGNOSE S9-HIGH-04 (F11) — Health Check renders ALL ZEROS despite every API returning 200

## Severity: HIGH — the "highest-value UX decision in Phase 2" (the trial→paid conversion moment) tells every brand they are 0/100 "Critical", including brands with perfect scores.

## The evidence (Metropolitan Plumbing, `/brands/418f321f-.../health-check`)
| Dimension | DB value (verified) | Expected band | **RENDERED** |
|---|---|---|---|
| AI Sentiment | **100** | GREEN | **0 · Critical** ❌ |
| AI Presence | 5 | RED | 0 · Critical (wrong value) |
| Site Readiness | **37** | RED | **0** · Critical (wrong value) |
| Local Authority | **20 (non-NULL)** | RED — **card must render** | **card ABSENT** ❌ |
| Overall | **40.5** | **AMBER** | **0/100 · "Critical — significant room to improve"** ❌ |
| Header | 18 audits exist | — | **"across 0 AI engines"** ❌ |

**Every value is 0.** The band logic is fine (`classifyScore(0)` → red → "Critical" is CORRECT for the
input it gets) — **the inputs are wrong**. The data never reaches the component.

**It is NOT a fetch failure.** The terminal shows every call returning **200**:
```
GET /api/brands/418f321f-.../latest-audit        200
GET /api/brands/418f321f-.../agent-readiness     200
GET /api/brands/418f321f-.../retrieval-audit     200
GET /api/brands/418f321f-.../tasks?status=open   200
```
So the data is fetched successfully and then **dropped / mis-keyed / read from the wrong field** on the
way into the panel. Classic shapes: camelCase-vs-snake_case, a nested `{ audit: {...} }` envelope the
reader doesn't unwrap, a `data.data` double-wrap, or a renamed field (`scoreSentimentNumeric` vs
`sentimentScore`).

**What IS correct (don't break it):** the build followed the **LLD, not the known-bad prototype** —
the dimensions are the 4 CROSS-LAYER ones (AI Sentiment / AI Presence / Site Readiness / Local
Authority) with a **3-band** green/amber/red scale. The S9-02 reconciliation was done right. The
STRUCTURE is correct; only the DATA BINDING is broken.

READ-ONLY diagnosis — find the mismatch, do NOT fix yet.

## Task

### 1 — What EXACTLY does each API return? (the real response shape)
```bash
cd c:/startup/VisibleAU/src
# The three score sources + the task source — dump the response shape each ACTUALLY returns:
sed -n '1,80p' "app/api/brands/[brandId]/latest-audit/route.ts"
sed -n '1,60p' "app/api/brands/[brandId]/agent-readiness/route.ts"
# (Site Readiness — which route serves technical_audits.score_composite? retrieval-audit? or another?)
grep -rln "score_composite\|scoreComposite" app/api/brands/ | head
```
For each: what is the JSON key path of the value the Health Check needs?
- AI Sentiment ← `audits.score_sentiment_numeric` → returned as **what key**?
- AI Presence ← `audits.score_frequency` → returned as **what key**?
- Site Readiness ← `technical_audits.score_composite` → **which route**, **what key**?
- Local Authority ← `agent_readiness_scores.local_ai_trust_score` → returned as **what key**?
- Engine count (the "0 AI engines" header) → **which field**?

### 2 — What does the COMPONENT read?
```bash
sed -n '1,140p' "app/(auth)/brands/[brandId]/health-check/page.tsx"
sed -n '1,140p' components/domain/health-check/health-check-panel.tsx
grep -n "sentiment\|frequency\|presence\|composite\|readiness\|localAuthority\|local_ai_trust\|engine\|score" \
  "app/(auth)/brands/[brandId]/health-check/page.tsx" components/domain/health-check/health-check-panel.tsx
```
Line up the two lists. **Report the mismatch table:**
| Dimension | API returns (key path) | Component reads (key path) | Match? |
|---|---|---|---|

### 3 — Confirm the zero is a fallback, not real data
The all-zeros pattern suggests `?? 0` / `Number(undefined) → NaN → 0` defaults. Find them:
```bash
grep -n "?? 0\||| 0\|Number(\|parseFloat\|toFixed\|= 0" \
  "app/(auth)/brands/[brandId]/health-check/page.tsx" components/domain/health-check/health-check-panel.tsx | head -20
```
A `?? 0` on a MISSING key silently produces exactly this screen — real scores replaced by zeros, bands
computed honestly from garbage. **This is the mechanism to confirm.**

### 4 — Why is Local Authority absent even with a NON-NULL score (20)?
Earlier code read: `if (!isSaas && localAuthorityScore != null) { push(card) }`. Metropolitan is
`tradies` (not SaaS) and its `local_ai_trust_score` = **20** (non-NULL) — so the card SHOULD render.
It doesn't → `localAuthorityScore` is arriving `undefined` (same root cause). Confirm the key path the
component uses vs what `/agent-readiness` returns.
> NOTE: this ALSO means the earlier F8 ("hidden when NULL") was a symptom, not the disease — the card
> is missing even when the data exists.

### 5 — The "0 AI engines" header
```bash
grep -n "engine\|engineCount\|engines\|across.*AI engines" \
  "app/(auth)/brands/[brandId]/health-check/page.tsx" components/domain/health-check/*.tsx | head
```
Same question: which key does it read, and does any API return it?

## Report back (paste inline)
1. **The mismatch table** (API key path vs component key path, per dimension) — the smoking gun.
2. The `?? 0` / default-to-zero sites that turn a missing key into "Critical".
3. Why Local Authority doesn't render despite score=20.
4. The engine-count field.
5. Your read: is this ONE bug (e.g. the page fetches but never passes the data down / a wrong envelope
   unwrap) or several independent key mismatches? Name the single root cause if there is one.

## Constraints
- READ-ONLY. Diagnose; do not fix (the fix comes scoped, after we know the root cause).
- Do NOT change the band logic (`classifyScore` is CORRECT — `>=` thresholds verified).
- Do NOT touch the dimension set or the 3-band scale (the LLD reconciliation is RIGHT — that part
  passed).
