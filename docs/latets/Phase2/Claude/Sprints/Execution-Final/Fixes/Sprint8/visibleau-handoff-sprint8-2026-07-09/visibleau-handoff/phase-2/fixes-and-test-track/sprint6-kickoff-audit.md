# Claude Code — Sprint 6 KICKOFF: three-source check + build plan (Retrieval Intelligence + Agent Readiness, Layer 1)

Sprint 6 = Retrieval Intelligence + Agent Readiness (Layer 1). Before ANY code, do the standard three-source check
(S6 prompt v1.4 vs LLD v8.70 vs prototype RetrievalHub 2537), confirm the architecture, and report the build plan +
any conflicts. DIAGNOSE/PLAN ONLY this pass — no tables, no code yet. LLD v8.70 WINS on any conflict (the prompt says
"built against v8.68" — reconcile to v8.70).

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` + local prod `visibleau_prod` (migrations to BOTH when
we build). Never real prod. Canon at the usual location.

## STEP 1 — Confirm the LLD version + the 4 tables + the ALTER
```bash
grep -m1 "^# Version:" <the LLD file>          # confirm v8.70 (prompt says built against 8.68 — v8.70 wins)
# The 4 new tables (8-11) + brand_token ALTER — confirm the LLD specs match the prompt §5:
#   crawler_visit_logs (#8, LLD 5148), content_structure_audits (#9, LLD 5225 — incl entity-home cols),
#   llmstxt_versions (#10, LLD 5371), agent_readiness_scores (#11, LLD 5387), brands.brand_token ALTER (LLD 5662).
```
Report: does the LLD's table structure (columns, enums, indexes) match the prompt §5 for all 4 + the ALTER? Flag any
divergence (v8.70 wins).

## STEP 2 — Confirm the FIVE architectural decisions that must be right from the start
These are the S6-specific things a naive reading gets wrong (§13 anti-patterns). Confirm each against the LLD:

1. **The crawler is BUILT FOR REAL, not stubbed (§0.2 / §13).** The LLD labels `lib/crawler/index.ts` "Sprint 7
   infrastructure," BUT S6 needs a FULL working crawler (content-structure-audit §8.2 requires a real 20-page / 15s-per-
   page / 5min-total crawl). **S6 builds the full crawler; S7 reuses/extends it.** Confirm: is there ANY existing
   `lib/crawler/`? (There shouldn't be a second one — ONE canonical.) Confirm the §8.2 crawl budget (20/15s/5min). A stub
   here leaves content-structure-audit non-functional — the plan must build it real.

2. **The PUBLIC Visit API + brand_token auth (VA-01/BT-01/MW-01).** `app/api/visit/route.ts` is PUBLIC (authed by
   brand_token, NOT Better Auth session — a NEW security posture). Confirm from the LLD: (a) valid brandToken → 202 +
   emits visit/ingested; invalid → 401; rate-limited; (b) `/api/visit` MUST be in the middleware isPublic matcher (MW-01
   — else the session auth 401s customer browsers and tracking silently breaks); (c) always SELECT brand by brand_token
   FIRST → 401 if absent (BT-01). Confirm the brand_token is nanoid-generated (reuse Phase 1's nanoid) + backfilled.

3. **The APPEND-ONLY vs UPSERT write patterns (must NOT be conflated — §0.5/§13):**
   - crawler_visit_logs → APPEND-ONLY (INSERT per visit, no ON CONFLICT)
   - agent_readiness_scores → APPEND-ONLY (U-13; history powers the score-drop alert; latest via scored_at DESC — NOT an
     UPSERT)
   - content_structure_audits → UPSERT on UNIQUE(brand_id, page_url) (re-crawls update)
   - llmstxt_versions → one-current-per-brand via PARTIAL UNIQUE INDEX (the refresh transaction leaves exactly one
     is_current)
   Confirm each table's write pattern from the LLD. (This is the "three status spellings" discipline — write patterns are
   canon; conflating append-only with UPSERT is a §13 anti-pattern.)

4. **The 2 forward-slot wirings close the LAST S4 slots (§0.1-0.2) — AND the Bug-A trap applies.** S6 wires
   content_structure_audits → the S4 narrative-generator's `entity_home_status` slot, and agent_readiness_scores → its
   `agent_readiness` slot. After this, all 12 S4 sections are wired. **CRITICAL LESSON FROM S5:** in S5, sections were
   wired in the generator but DEAD on the default path because the default-report-template seed didn't include them (Bug
   A). So the plan MUST include: adding entity_home_status + agent_readiness to the default-report-template seed
   (include:true) + re-seeding existing orgs — NOT just wiring the generator. Confirm the generator has these 2 slots
   ready (from S4's framework) and that closing them requires the seed update too.

5. **The score-formula gotchas (§13):**
   - `entity_clarity_score` is /20, a DIFFERENT scale/table/meaning from `score_of_10` (/10) — agent-readiness must NEVER
     read score_of_10 for this dimension. Confirm the 5 agent-readiness dimensions + that entity_clarity is independent.
   - `local_ai_trust_score` is NULL for vertical='saas' (no GMB/local signals) — confirm the SaaS-null rule.
   Confirm the 5-dimension agent-readiness formula, citation-probability contributions (~0.85 ceiling), and the
   content-format advisor (FORMAT_BY_ENGINE, 3:1 listicle:how-to).

## STEP 3 — Confirm the deliverables inventory (§ from the prompt)
- 4 tables + brand_token ALTER (2 migrations: table migration FIRST, then brand_token ALTER).
- The PUBLIC Visit API route + the /api/visit middleware entry + the customer middleware snippet.
- lib modules: visit-classifier, citation-probability-scorer, content-format-advisor, agent-readiness (5-dim, incl MCP
  readiness GAP 3), local-ai-trust-scorer, entity-home-auditor, the full crawler.
- Inngest fns (crawler-log-ingest, content-structure-audit, llmstxt refresh, agent-readiness scoring) + serve()
  registration.
- The RetrievalHub UI (prototype 2537, Starter tier gate) + sub-screens.
- The audit-data-retention extension for crawler_visit_logs (§8.6).
- The 2 forward-slot wirings + the default-template seed update.
Report the full inventory + confirm which pieces exist from prior sprints to REUSE (nanoid, selectModel, the S4 slots,
setRlsContext, the explainability service).

## STEP 4 — Report the BUILD PLAN (ordered) + conflicts
Propose the build order (tables/migrations first, then lib modules, then Inngest, then Visit API, then UI, then the
S4-wiring + seed, then §11 tests + §12 greps). Flag:
- Any LLD-vs-prompt conflict (v8.70 wins).
- The crawler build-for-real decision confirmed (not a stub).
- The public-API security posture confirmed (token auth, isPublic, rate-limit).
- The Bug-A trap noted (seed update required for the 2 slots, not just generator wiring).
- Anything ambiguous that needs a decision before building.

## §11 tests to plan for (build alongside, same as S2-S5): visit-classifier, visit-route.integration,
citation-probability-scorer, content-format-advisor, agent-readiness, local-ai-trust-scorer, entity-home-auditor,
llmstxt-refresh, agent-readiness.append-only, s4-wiring.integration (the last-2-slots render), retrieval-rls (4 tables +
the Visit public exception). §12 greps in scripts/qa/sprint6-invariants.sh.

## Constraints
- PLAN/DIAGNOSE ONLY this pass — no tables, no code. Confirm the architecture, THEN we build in ordered steps.
- LLD v8.70 WINS (prompt built against v8.68 — reconcile).
- The 5 architectural decisions (STEP 2) must be confirmed before building — they're the S6-specific traps (§13).
- Migrations (when we build) go to BOTH dev + local prod (the S5 lesson).
- The 2 forward slots need the default-template seed update, not just generator wiring (the Bug-A lesson from S5).
- ONE canonical crawler, built for real (not a stub, not a second one).

## NOTE
S6 kickoff — three-source check before building. S6 is infrastructure-heavier than S5: a PUBLIC token-authed Visit API
(new security posture), a FULL working Playwright crawler (built for real in S6, reused by S7 — NOT a stub despite the
LLD's "Sprint 7" label), 4 tables with DISTINCT write patterns (append-only crawler-logs + agent-scores, UPSERT
content-audits, one-current-partial-unique llms.txt — don't conflate), and it closes the LAST 2 S4 forward slots
(entity_home_status + agent_readiness) — which, per the S5 Bug-A lesson, needs the default-report-template SEED updated,
not just the generator wired. Confirm all of this against LLD v8.70 (prompt says v8.68 — v8.70 wins), report the build
plan + conflicts, THEN we build in ordered steps.
