# S9 WALK — PART 3: Trend sparkline · Explainability contract · Persona dashboards · SaaS Health Check

## Context
Parts 1–2 found 11 findings including a HIGH (the Health Check rendering every brand as 0/100
"Critical"), all under 18/18 green greps + 70/70 green tests. These four surfaces are the remainder.

**The pattern to expect:** the bugs were never in the logic — they were in the *wiring* (a wrong
column, a swapped pending-trigger, an unwrapped envelope). Watch for data that arrives but never
lands.

---

## WALK 3A — Per-prompt trend sparkline (§6U.5, LLD 9162 v8.16)

### Why this one is loaded
Grep #4 checks `citations.brand_id` is ABSENT — i.e. it guards a **bug the LLD already had to fix
once** (v8.16). The original query used `citations.brand_id`, **a column that does not exist**;
the fix is to JOIN through `audits`:
```sql
SELECT DATE_TRUNC('week', c.created_at) AS week,
       COUNT(CASE WHEN c.brand_mentioned THEN 1 END)::float / NULLIF(COUNT(*), 0) AS mention_rate
FROM citations c
JOIN audits a ON c.audit_id = a.id          -- ← the v8.16 fix
WHERE a.brand_id = ? AND c.prompt = ?
GROUP BY week ORDER BY week
```
A grep can confirm the JOIN *exists in the source*. It cannot confirm the sparkline **renders real
weekly data**. That's this walk.

### Where
The **prompt-results table** (Growth+) — a 12-week mention-rate sparkline under each prompt row.
Find the screen:
```bash
cd c:/startup/VisibleAU/src
grep -rln "prompt-trend-sparkline\|PromptTrendSparkline\|prompts/.*trend" \
  components/ app/ 2>/dev/null | head
# Which page renders the prompt-results table? (that's where the sparkline lives)
grep -rln "prompt-results\|promptResults\|audit-results" app/\(auth\)/ | head
```
Use **Metropolitan** (18 audits — the only brand with enough history for a 12-week trend). Bondi has
1 audit → expect its empty state.

### Checks
| # | Check | PASS | FAIL |
|---|---|---|---|
| 1 | **The sparkline RENDERS** with real weekly points | a 12-week line/bars with varying values | ❌ flat line · ❌ all zeros · ❌ blank cell · ❌ "Not enough history" on a brand WITH history |
| 2 | **The values are real** — spot-check one prompt against the DB (below) | the chart's weekly mention rates match the query | ❌ plausible-but-wrong numbers (the F11 lesson) |
| 3 | **Empty state** (<2 weeks of data) | "Not enough history yet" | ❌ a misleading flat-zero line (implying 0% mentions rather than "no data") |
| 4 | **Error state** | a muted dash (inline cell — no boundary) | ❌ a crash / a boundary blowing up the table |
| 5 | **Loading** | a shimmer in the sparkline cell | — |
| 6 | **RESPONSIVE `<sm`** | the sparkline moves BELOW the prompt text (not inline) | ❌ squashed/overflowing inline |
| 7 | **Tier gate** | Growth+ only | ❌ visible to Free/Starter |

### Verify the numbers against the DB (the answer-key discipline that caught F11)
Pick one prompt visible in the table, then:
```bash
# The canonical v8.16 query — what the sparkline SHOULD show:
psql "$PROD" -c "
  SELECT DATE_TRUNC('week', c.created_at) AS week,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE c.brand_mentioned) AS mentioned,
         ROUND(COUNT(*) FILTER (WHERE c.brand_mentioned)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS mention_rate_pct
  FROM citations c
  JOIN audits a ON c.audit_id = a.id
  WHERE a.brand_id = '418f321f-2489-4560-aaa9-895728580465'
    AND c.prompt = '<PASTE ONE PROMPT FROM THE SCREEN>'
  GROUP BY week ORDER BY week;"
```
**Compare the returned weekly rates to the rendered sparkline.** If they don't match, that's the F11
class again (data arriving but not landing).

### Also confirm the route
```bash
grep -n "JOIN audits\|citations.brand_id\|c.audit_id\|assertBrandAccess\|setRlsContext\|withRlsContext" \
  "app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts"
```
EXPECT: the `JOIN audits` path, **zero** `citations.brand_id`, and the brand gate present.

---

## WALK 3B — The explainability 5-question contract (LLD 5607–5654)

### The binding
Every customer-facing recommendation/gap/insight MUST answer all 5:
1. **Where do I stand?** → `standingSummary`
2. **Why is this happening?** → `whyExplanation`
3. **What should I do?** → `actionSuggestion`
4. **What impact could it have?** → `expectedImpact` (**evidence-based — NO revenue estimates**)
5. **How confident is VisibleAU?** → `confidenceLabel` (`confirmed` | `likely` | `hypothesis`)

Plus: rationale templates are **plain English, Year-10 reading level**, and must **never** use the
words *algorithm*, *heuristic*, *statistical*, or *confidence interval*.
Plus the **S9 RULE**: S9 **RENDERS** stored `{score, explainability}` from S6 — **no
`ExplainabilityService` import, no `annotate()` call** in S9 components (grep #12 = 0 matches ✓).

### Checks — on the scored surfaces (Action Center / gaps / audit results / the loop's step 3)
| # | Check | PASS | FAIL |
|---|---|---|---|
| 1 | A scored recommendation shows the **5 elements** | all five present | ❌ any missing |
| 2 | **No forbidden words** | plain English | ❌ "algorithm" / "heuristic" / "statistical" / "confidence interval" anywhere in customer-facing copy |
| 3 | **No revenue estimates** in `expectedImpact` | evidence-based ("could improve citation rate on 3 prompts") | ❌ "$X/month" / "could earn you…" |
| 4 | **confidenceLabel is one of the 3** | confirmed / likely / hypothesis | ❌ a fabricated/other label |
| 5 | **Gap rows hardcode `likely`** (WF-03 v8.34 — `topical_coverage_gaps` has NO confidenceLabel column) | gap-derived content shows **likely** | ❌ a gap showing `confirmed` (fabricated confidence) |
| 6 | **Rationale is real, not empty/generic** (LLD: "an empty or generic rationale is a build failure") | ≥30 chars, specific | ❌ blank · ❌ boilerplate |

> **F9 CONTEXT (already known):** `remediation_tasks` has NO `explainability` column and S6 never
> stored annotations there — so the Health Check's #1 action renders an empty rationale. That's an
> UPSTREAM gap (carried to S6), not an S9 bug. **This walk asks a different question:** on the
> surfaces where S6 DID store annotations (audit results / gaps / Action Center), does S9 render the
> full 5-question shape? If NO surface has a stored annotation, then the "explainability" pillar is
> effectively unshipped — which is a much bigger finding than F9, and worth knowing.

### Where the annotations live
```bash
# Does ANY table store an explainability annotation? (the S9 RULE assumes S6 wrote them)
grep -rn "explainability\|standingSummary\|whyExplanation\|actionSuggestion\|expectedImpact\|confidenceLabel" \
  db/schema/*.ts | head -20
# Which API routes RETURN an explainability shape?
grep -rln "explainability\|standingSummary\|whyExplanation" app/api/ | head
# And which components RENDER it?
grep -rln "explainability\|standingSummary\|whyExplanation\|rationale" components/ | head
```
**REPORT:** does a stored annotation exist anywhere (column + route + component)? Screenshot one
surface that renders the full 5-question shape. **If none exists → FINDING (the differentiator the
LLD calls "VisibleAU's strongest" isn't shipped).**

---

## WALK 3C — Persona-aware dashboards (§6U.6, LLD 9085)

### The binding (pure frontend — NO schema; persona derived from the brand's existing vertical/tier)
- **Agency:** multi-brand command centre + cross-brand task queue (Agency+)
- **SMB:** Health Check + top-5 fixes + Mention-Source archetype + LinkedIn presence + Knowledge
  Panel status + brand-mention count vs vertical benchmark
- **Local tradie:** suburb visibility + agent readiness + AU directory checklist (Priority 1) +
  consensus score + Entity-Home check + Wikidata status + Reddit AU-subreddit feed + YouTube
  presence + embedding-page gap alert
- **Persona filter (Growth+):** prompt-results dropdown filtering by `persona_tag` (existing data,
  no new API — `/audit-results?persona=…` reading `vertical_pack_prompts.persona_tag`)

### Checks
| # | Check | Note |
|---|---|---|
| 1 | **Agency persona** — your current org (Test Org Agency 1, Agency tier) | The dashboard DOES show an "Agency Command Centre" (cross-brand task queue + brand comparison) — screenshot it and confirm it matches the Agency spec |
| 2 | **Which persona is derived, and from what?** | vertical + tier. Confirm the derivation (a tradie brand on a Growth org → tradie persona?) |
| 3 | **Tradie persona** — the richest spec (9 elements) | ⚠️ Metropolitan/Bondi are `tradies`. Does a tradie-persona dashboard exist? Which of the 9 elements render? **A partial implementation is likely — enumerate what's there vs the spec.** |
| 4 | **SMB persona** — 6 elements | Does it exist? |
| 5 | **Persona filter** on prompt results (Growth+) | The dropdown, filtering by `persona_tag` |
| 6 | **RESPONSIVE** | Agency grid multi-column `≥lg`, single `<lg` |

> **Expect a gap here.** §6U.6 specifies three distinct persona dashboards with ~20 elements
> total (LinkedIn presence, Knowledge Panel, Wikidata, Reddit feed, YouTube presence…). Many of
> those depend on data from layers that may not exist. **The honest question: is the persona layer
> shipped, partially shipped, or just the Agency command centre?** Enumerate precisely — don't
> assume the spec was met just because *something* renders.

```bash
grep -rln "persona\|PersonaDashboard\|persona-dashboard\|persona_tag\|personaTag" \
  components/ app/ db/schema/ 2>/dev/null | head
grep -rn "tradie\|smb\|agency" components/domain/**/persona*.tsx 2>/dev/null | head
```

---

## WALK 3D — SaaS-brand Health Check (the conditional hide)

### The binding
**SaaS brand → Local Authority hidden ENTIRELY** (the other 3 dims + #1 action shown). This is
distinct from the non-SaaS NULL "Not yet measured" state we just shipped (F8).
`SAAS_VERTICALS = ["saas","software","fintech","edtech","martech"]`

### Do it
Two SaaS brands exist: **Employment Hero** (20 audits) and **Canva**. Use Employment Hero:
```bash
psql "$PROD" -c "
  SELECT b.id, b.name, b.vertical,
         a.score_sentiment_numeric, a.score_frequency
  FROM brands b LEFT JOIN audits a ON a.brand_id=b.id AND a.status='complete'
  WHERE b.name ILIKE '%employment hero%'
  ORDER BY a.created_at DESC LIMIT 1;"
psql "$PROD" -c "
  SELECT score_composite FROM technical_audits
  WHERE brand_id=(SELECT id FROM brands WHERE name ILIKE '%employment hero%' LIMIT 1)
  ORDER BY created_at DESC LIMIT 1;"
```
Compute the expected bands (same thresholds), then open
`/brands/{employmentHeroId}/health-check`.

| # | Check | PASS | FAIL |
|---|---|---|---|
| 1 | **Local Authority is ABSENT** (not "Not yet measured") | 3 dimension cards only | ❌ a 4th card · ❌ the "Not yet measured" pending card (that's the non-SaaS state) |
| 2 | The other 3 render with correct bands | vs the computed key | ❌ mismatch |
| 3 | **Overall = average of 3** | not /4 | ❌ divided by 4 (deflating the score) |
| 4 | #1 action present | | |

> This is the ONE code path F11's fix didn't exercise. It's a different branch
> (`isSaas` → hide) from the one we verified (`!isSaas && null` → pending).

---

## Report back (paste inline)
1. **3A:** the sparkline screenshot (Metropolitan) + the DB weekly rates + do they MATCH? + the
   `<sm` responsive shot + Bondi's empty state.
2. **3B:** does a stored explainability annotation exist ANYWHERE (schema/route/component)? A
   screenshot of a surface rendering the 5-question shape — or the finding that none does.
3. **3C:** which persona dashboards exist, and precisely which spec elements render vs the ~20
   specified. Screenshot the Agency command centre + any tradie/SMB persona view.
4. **3D:** the Employment Hero Health Check — is Local Authority ABSENT (SaaS hide), and is the
   overall averaged over 3?
5. The terminal during each.
