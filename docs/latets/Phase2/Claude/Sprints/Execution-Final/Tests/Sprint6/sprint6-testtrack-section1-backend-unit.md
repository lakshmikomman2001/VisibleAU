# Claude Code — S6 §11 test track — SECTION 1 of 4: Backend Unit (the pure scorers/derivers)

Building the S6 §11 test track SECTION BY SECTION (one section, re-break proof, confirm, then the next — do NOT jump
ahead to Sections 2-4). This is SECTION 1: the Backend Unit tests (pure scorers/derivers). Most likely EXIST from the
build (89 tests reported) — so INVENTORY what's there against the §11 list, VERIFY each is real + fires on re-break, and
FILL only the gaps. Do NOT duplicate or rewrite passing real tests.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. Tests in
tests/phase2/sprint6/.

## SECTION 1 — the §11 Backend Unit tests (6 files)
1. **visit-classifier.test.ts** — purpose derivation: active→retrieval; data tier→training; must_allow+>3 pages→indexing;
   else NULL.
2. **citation-probability-scorer.test.ts** — contributions sum correctly; ~0.85 ceiling; format/freshness/entity-home/
   author inputs each move the score. (This is the headline scorer — the one whose bands we just fixed on screen.)
3. **content-format-advisor.test.ts** — the FORMAT_BY_ENGINE map; the 3:1 listicle:how-to rule.
4. **agent-readiness.test.ts** — each of the 5 dimension formulas at its thresholds; total /100; **entity_clarity_score
   independent of score_of_10**. **§8.4a Task-Fit:** structured pricing `<table>`/`Offer` schema → task_pricing_visible=
   true, prose "from $99" → false; Calendly/`ReserveAction` → task_booking_accessible=true, auth-gated booking → false;
   **SaaS brand → task_score IS NOT NULL (computed) while local_ai_trust_score IS NULL**; **all-pages blocked_cdn → all
   3 task booleans false** (no signal defaulted true); partial-score rationale names a concrete missing signal (len>30).
5. **local-ai-trust-scorer.test.ts** — /100 composite weights; **NULL for vertical='saas'**; degrades when
   local_seo_results absent.
6. **entity-home-auditor.test.ts** — @id-points-to-domain detection; sameAs count; sameAs<3 gap.

## STEP 1 — Inventory: which of the 6 exist, and are they REAL?
```bash
ls tests/phase2/sprint6/ 2>/dev/null
for f in visit-classifier citation-probability-scorer content-format-advisor agent-readiness local-ai-trust-scorer entity-home-auditor; do
  echo "=== $f ==="; find tests -iname "*$f*" 2>/dev/null
done
# Are any of these source-greps / typeof-smoke rather than behavioral? (the fake-test class from S4/S5)
grep -rln "readFileSync\|toContain.*import\|typeof.*===.*function" tests/phase2/sprint6/*visit-classifier* tests/phase2/sprint6/*citation* tests/phase2/sprint6/*format-advisor* tests/phase2/sprint6/*agent-readiness* tests/phase2/sprint6/*local-ai-trust* tests/phase2/sprint6/*entity-home* 2>/dev/null
```
Report: which of the 6 exist, and flag any that are source-greps/typeof-smoke (not real behavioral tests).

## STEP 2 — For EACH existing test, verify it's behavioral + fires on re-break (the proof)
Go through the 6 ONE AT A TIME. For each, confirm it asserts the ACTUAL behavior (not that a function exists), then prove
it fails when the target breaks:
- **visit-classifier:** break a branch (e.g. active→retrieval → active→training) → the test must FAIL. Restore.
- **citation-probability-scorer:** change a contribution weight or the 0.85 ceiling → a test must FAIL (pins the exact
  deltas). Restore. (This guards the scorer behind the headline we just fixed.)
- **content-format-advisor:** break the FORMAT_BY_ENGINE map or the 3:1 rule → FAIL. Restore.
- **agent-readiness:** break a dimension formula → FAIL; AND verify the §8.4a cases explicitly (pricing table→true vs
  prose→false; booking path→true vs auth-gated→false; SaaS task_score NOT NULL but local_ai_trust NULL; all-blocked_cdn→3
  booleans false). Break `entity_clarity` to read score_of_10 → the independence test must FAIL. Restore.
- **local-ai-trust-scorer:** break the SaaS-null rule (compute for 'saas') → FAIL; break a weight → FAIL. Restore.
- **entity-home-auditor:** break @id-points-to-domain or the sameAs<3 gap → FAIL. Restore.
Report per test: real (behavioral) + re-break fires. If a test is a source-grep/typeof-smoke → REWRITE it behavioral
(like the S4/S5 cleanup), then prove re-break.

## STEP 3 — Fill any gaps
For any of the 6 that DON'T exist (or were smoke and got rewritten), write the real behavioral test per the §11 spec
above. Each must fail on re-break.

## STEP 4 — Run Section 1 + report
```bash
<repo test cmd> run tests/phase2/sprint6/   # or the section's files
```
- The 6 Backend Unit tests: which existed real / which were rewritten / which built new.
- The re-break proof fired for each (break→fail→restore→green) — especially citation-probability (bands' scorer),
  agent-readiness §8.4a (the SaaS/blocked_cdn/pricing/booking cases), and entity_clarity-independent-of-score_of_10.
- Section 1 green. Total test count.
STOP after Section 1 — do NOT start Section 2. Report, and we do Section 2 (Backend Integration) next.

## Constraints
- SECTION 1 ONLY (the 6 Backend Unit scorers). Do NOT build Sections 2-4 this pass.
- Inventory first — most likely exist (89 tests); verify + fill gaps, do NOT duplicate/rewrite passing real tests.
- Every test behavioral + fires on re-break. NO source-greps, NO typeof-smoke — if found, rewrite behavioral.
- The §8.4a task-fit cases are specific (pricing table/prose, booking path/auth-gated, SaaS task_score-not-null,
  all-blocked_cdn→false) — assert them explicitly; they're the under-specified logic v1.5 added.
- entity_clarity_score must be independent of score_of_10 — the re-break (point it at score_of_10) must fail.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §11 win.

## NOTE
Section 1 of 4 of the S6 §11 test track, built section-by-section. This is the Backend Unit scorers (visit-classifier,
citation-probability, content-format-advisor, agent-readiness +§8.4a, local-ai-trust, entity-home-auditor). Most exist
from the build — INVENTORY against §11, VERIFY each is behavioral + fires on re-break (don't trust "green"; break it,
confirm it fails), FILL gaps, REWRITE any source-grep/typeof-smoke to behavioral. Assert the §8.4a task-fit cases
explicitly and the entity_clarity-independent-of-score_of_10 rule. STOP after Section 1 and report — Sections 2 (Backend
Integration), 3 (the walk's regression guards), 4 (QA greps) follow one at a time.
