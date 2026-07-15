# Claude Code — S6 §11 test track — SECTION 1 of 4: Backend Unit (the pure scorers) — with EXACT canon values

Building the S6 §11 test track SECTION BY SECTION (one section, re-break proof, confirm, then next — do NOT jump to
Sections 2-4). SECTION 1 = the Backend Unit scorers. Most likely EXIST from the build (89 tests) — so INVENTORY against
§11, VERIFY each is real + fires on re-break, and FILL only gaps. Do NOT duplicate/rewrite passing real tests. The exact
formula values below are from LLD §6.2/§6.6 (5260/5404-5468/5800) — pin assertions to THESE numbers.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint6/.

## SECTION 1 — the 6 §11 Backend Unit tests, with the exact canon formulas to assert:

### 1. visit-classifier.test.ts
Purpose derivation: is_active_agent→'retrieval'; data-tier crawler→'training'; must_allow + >3 pages→'indexing'; else NULL.

### 2. citation-probability-scorer.test.ts (LLD 5260 — the headline scorer; bands just fixed on screen)
Contributions sum, with a ~0.85 practical ceiling. Assert each input MOVES the score by the canon delta:
- **content_format**: how_to_guide **+0.18** … product_page **+0.02** (map ALL enum values; pin the extremes + a middle one)
- **answer_capsule**: 0–0.25 (scaled)
- **freshness (all FOUR enums):** fresh **+0.10**, aging **+0.05**, at_risk **+0.025**, stale **+0.00**
- **is_entity_home_candidate: +0.08**
- **optimal_passage_count ≥3: +0.05**
- **outbound_citation: 0 / +0.03 / +0.06 / +0.09** (by count tier)
- **has_author_attribution: +0.04**
- **~0.85 ceiling** (a maxed input set caps ~0.85, not 1.0)
Re-break: change any single delta (e.g. fresh +0.10→+0.20, or the 0.85 ceiling) → a test must FAIL.

### 3. content-format-advisor.test.ts (LLD 5800)
- **FORMAT_BY_ENGINE**: chatgpt→listicle/expert_article; gemini→how_to_guide; perplexity→listicle/faq_block;
  all_local→listicle/suburb_specific_article. Assert the map per engine.
- **The 3:1 rule**: "for every 3 listicle pages, recommend 1 how-to guide." Assert at boundaries (3 listicles→1 how-to
  rec; 6→2; 2→0).
Re-break: break the map or the 3:1 ratio → FAIL.

### 4. agent-readiness.test.ts (LLD 5404-5468, §6.6 — the 5 dims, each /20, EXACT breakdowns)
Assert each dimension formula at its thresholds:
- **tech_score /20:** llmstxt_present(3)+llmstxt_valid(3)+robots_allows(3)+ssr_passes(3)+ai_discovery(2)+page_load_fast(2)
  +mcp_present(2)+mcp_valid(2); **mcp_tools_count = 0 pts**.
- **entity_clarity_score /20:** org_schema(5)+local_business_schema(4)+local_reg_in_schema(4)+name_consistent(4)+
  service_readable(3). **entity_clarity_score is NOT score_of_10** — re-break: point it at brand_entity_scores.score_of_10
  → the independence test must FAIL.
- **verify_score /20:** abn_confirmed(5)+wikipedia_au(5)+au_directories(min(n,4))+review_citations(min(n,3))+
  expert_quotes(3).
- **authority_score /20:** topical_coverage(TCG 0-100→0-8)+prompt_appearance(citation_rate×6, max 6)+
  citation_diversity(min(n,6)).
- **task_score /20:** booking(5)+pricing(5)+service_area(5)+faq_direct_answers(min(n,5)).
- **total_score /100** = sum of the 5; no uncapped overflow.
- **§8.4a Task-Fit detection cases (assert explicitly — the under-specified logic v1.5 added):**
  - structured pricing `<table>` / `Offer` schema → **task_pricing_visible=true**; prose "from $99" → **false**
  - Calendly / `ReserveAction` path → **task_booking_accessible=true**; auth-gated booking → **false**
  - **SaaS brand → task_score IS NOT NULL (computed)** while local_ai_trust_score IS NULL
  - **all-pages error_type='blocked_cdn' → all 3 task booleans false** (no signal defaulted true)
  - a partial-score rationale names a concrete missing signal (length > 30)
Re-break: break any dimension weight (e.g. org_schema 5→3) → FAIL; break a §8.4a case (pricing prose→true) → FAIL.

### 5. local-ai-trust-scorer.test.ts (LLD §6.6 — and the BINDING NULL decision)
- **/100 composite weights:** gmb×0.25 + directory×0.25 + abn×0.15 + nap×0.20 + citation×0.15.
- **NULL for vertical='saas'** (scorer checks brand.vertical and skips).
- **BINDING §6.6 DECISION — NULL when local_seo_results absent, NOT a partial:** local_seo_results (S8) supplies gmb(0.25)
  +nap(0.20)=45%; until it exists, local_ai_trust_score = **NULL** (guard the read with `to_regclass('local_seo_results')`)
  — do NOT compute a partial, do NOT use gmb/nap=0 (a partial caps a perfect brand at ~55/100, a misleading
  customer-facing number — the honest-data discipline). **Assert: local_seo_results-absent → NULL (not a partial number).**
Re-break: (a) compute for 'saas' → FAIL; (b) return a partial when the table's absent instead of NULL → the
NULL-when-absent test must FAIL; (c) break a weight → FAIL.

### 6. entity-home-auditor.test.ts (LLD 5820)
- @id-points-to-canonical-domain detection; sameAs count; **sameAs < 3 → gap** (and @id-missing → gap).
Re-break: break the @id-domain check or the sameAs<3 gap threshold → FAIL.

## STEP 1 — Inventory: which of the 6 exist + are they REAL?
```bash
ls tests/phase2/sprint6/ 2>/dev/null
for f in visit-classifier citation-probability content-format-advisor agent-readiness local-ai-trust entity-home-auditor; do
  echo "=== $f ==="; find tests -iname "*$f*" 2>/dev/null; done
grep -rln "readFileSync\|toContain.*import\|typeof.*===.*function" tests/phase2/sprint6/*{visit-classifier,citation,format-advisor,agent-readiness,local-ai-trust,entity-home}* 2>/dev/null
```
Report which exist + flag any source-grep/typeof-smoke (not behavioral).

## STEP 2 — Verify each is behavioral + fires on re-break (ONE AT A TIME)
For each of the 6: confirm it asserts the ACTUAL canon values above, then prove it FAILS on re-break (break the value →
test fails → restore). Report per test: real + re-break fires. Rewrite any smoke test to behavioral, then prove re-break.
Priority re-breaks: citation-probability (a delta or the 0.85 ceiling), agent-readiness (a /20 weight + a §8.4a case +
entity_clarity-vs-score_of_10), local-ai-trust (SaaS-null + NULL-when-table-absent + a weight).

## STEP 3 — Fill gaps
Any of the 6 missing → write the real behavioral test with the canon values above. Each fails on re-break.

## STEP 4 — Run Section 1 + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint6/
```
- The 6: which existed real / rewritten / built new. Re-break fired for each (esp. the priority ones).
- Section 1 green; total count.
STOP — do NOT start Section 2. Report, and we do Section 2 (Backend Integration) next.

## Constraints
- SECTION 1 ONLY (the 6 Backend Unit scorers). Not Sections 2-4.
- Inventory first — most exist (89 tests); verify + fill, don't duplicate/rewrite passing real tests.
- Pin assertions to the EXACT canon values above (deltas, /20 breakdowns, weights, 0.85 ceiling) — not round numbers.
- Every test behavioral + fires on re-break. NO source-greps/typeof-smoke — rewrite if found.
- local-ai-trust: assert NULL-when-local_seo_results-absent (the BINDING §6.6 decision — partial is forbidden), NOT a
  partial score. entity_clarity independent of score_of_10 (re-break must fail).
- §8.4a cases explicit (pricing table/prose, booking path/auth-gated, SaaS task_score-not-null, all-blocked_cdn→false).
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §6.2 / §6.6 / §11 win.

## NOTE
Section 1 of 4, section-by-section. Backend Unit scorers with the EXACT LLD formula values pinned (citation-probability
deltas + 0.85 ceiling per 5260; the 5 agent-readiness /20 breakdowns per §6.6/5404-5468; local-ai-trust weights). Most
exist from the build — INVENTORY vs §11, VERIFY behavioral + re-break (break the canon value, confirm it fails), FILL
gaps, REWRITE any smoke to behavioral. Key canon points to assert: entity_clarity_score is NOT score_of_10; the §8.4a
task-fit cases; and — the BINDING §6.6 decision — local_ai_trust_score is NULL (not a partial) until the S8
local_seo_results table exists (partial forbidden as a misleading customer metric). STOP after Section 1 and report;
Sections 2 (Backend Integration), 3 (the walk's regression guards), 4 (QA greps) follow one at a time.
