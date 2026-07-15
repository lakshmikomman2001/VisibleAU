# Claude Code — POST-BUILD AUDIT Sprint 6 (core v1.5 + CDN Shield v1.3) — before sign-off

S6 reports complete: 4 tables + brand_token ALTER, 11 lib modules, public Visit API, full crawler, 5 Inngest fns, 9
routes, 6 pages, S4 wiring; PLUS Phase B CDN Shield (detector + probe API + alert card). Build report said "76 tests
pass, zero TS errors." S5 reported "62 green" and had EIGHT real bugs (nav-orphan, migrations-not-applied, Bug-A
dead-on-default-path, badge contamination, missing alert, …) — NONE caught by its tests. So do NOT sign off on the
summary. This audit verifies the S6-specific traps the two prompts (§13) warn about + the things a passing unit suite
can't catch (real crawler, reachable public API, default-path rendering). DIAGNOSE + report; fix only what's confirmed
broken.

⚠️ **FIRST, a hard discrepancy to resolve:** the core prompt says **serve() running total after S6 = 23** (lines 458,
618; driver line 128). The build report claimed **38 functions**. That's a 15-fn gap. Resolve it in STEP 0.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev `visibleau` + local prod `visibleau_prod` (migrations to BOTH — the
S5 lesson). Never real prod. Canon: LLD v8.70 WINS (prompts built against v8.68 — reconcile).

## STEP 0 — Resolve the serve() count (23 expected vs 38 claimed)
```bash
grep -cE "createFunction|inngest.createFunction" inngest/ -r 2>/dev/null | tail -1   # total createFunction defs
# What's actually in the serve() array?
grep -n "serve(" app/api/inngest/route.ts app/api/webhooks/inngest/route.ts 2>/dev/null
sed -n '/serve(/,/})/p' app/api/webhooks/inngest/route.ts 2>/dev/null | grep -cE "Fn|Function|[a-z]" 
```
Report the ACTUAL count in serve() and reconcile with 23. If it's 38, explain why (are S1-S5 fns being double-counted?
is the "38" the total createFunction defs across all sprints, not the S6 running total?). The prompt's "23" is the
Phase-2 running total after S6 — confirm the real number matches the canon expectation, not a miscount.

## STEP 1 — THE CRAWLER: real or stub? (§13 anti-pattern #1 — the biggest one)
The prompt is explicit: ONE canonical `lib/crawler/index.ts`, FULL working (20-page budget, 15s/page, 5min total, §8.2)
— NOT a stub, NOT a second crawler. A stub passes unit tests (they mock it) while content-structure-audit is
non-functional.
```bash
ls lib/crawler/ ; wc -l lib/crawler/index.ts
grep -n "20\|15000\|15s\|5.*min\|300000\|maxPages\|timeout\|playwright\|chromium\|goto\|page\." lib/crawler/index.ts | head -20
# Is there a SECOND/parallel crawler anywhere? (there must not be)
find . -path ./node_modules -prune -o -name "*.ts" -print | xargs grep -l "crawlSite\|class.*Crawler\|playwright.*launch" 2>/dev/null | head
```
Report: does `lib/crawler/index.ts` actually implement the 20-page/15s/5min Playwright crawl, or is it a stub (returns
canned data / throws / TODO)? Is there exactly ONE crawler? **REAL-DATA smoke:** run content-structure-audit against
metropolitanplumbing.com.au (or trigger the Wed cron manually) → does it actually fetch + parse real pages, or produce
empty/stub output? If stub → content-structure-audit is dead; that's a critical finding.

## STEP 2 — THE PUBLIC VISIT API: reachable, or silently 401'd? (§13 #2/#3 — MW-01/BT-01)
The Visit API is PUBLIC (brand_token auth, not session). The specific trap: if `/api/visit` isn't in the middleware
isPublic matcher, the session middleware 401s every customer browser and tracking SILENTLY breaks — a route unit test
won't catch this (middleware runs before the handler).
```bash
grep -n "/api/visit\|isPublic\|publicRoutes\|matcher" middleware.ts
sed -n '1,60p' app/api/visit/route.ts
```
Report: (a) is `/api/visit` in the middleware isPublic list? (b) does the route SELECT brand by brand_token FIRST → 401
if absent (BT-01)? (c) rate-limited? (d) valid token → 202 + emits visit/ingested?
**REAL-REQUEST smoke (the actual test):** with a real brand's brand_token, `curl -X POST localhost:3000/api/visit`
with a valid token → expect 202; with a bogus token → expect 401; with NO token → 401. If a valid token 401s, the
middleware isn't letting it through (MW-01) — the whole feature is silently dead. Report the actual HTTP codes.

## STEP 3 — THE BUG-A TRAP: do the 2 forward slots render on the DEFAULT path? (§13 #12)
S6 closes the LAST 2 S4 slots: content_structure_audits → entity_home_status, agent_readiness_scores → agent_readiness.
**This is EXACTLY the S5 Bug-A trap** — S5's sections were "wired" in the generator but DEAD on the default path because
the default-report-template SEED didn't include them. The build report says "wired" — the same word.
```bash
# Are the 2 slots in the narrative-generator switch?
grep -n "entity_home_status\|agent_readiness" lib/communication/narrative-generator.ts | head
# CRITICAL: are they in the DEFAULT-template seed (include:true), or only the generator?
grep -n "entity_home_status\|agent_readiness\|include" db/seed/default-report-template.ts
```
Report: are entity_home_status + agent_readiness in the DEFAULT-template seed with include:true? **REAL-DATA smoke:**
seed content_structure_audits + agent_readiness_scores rows for Metropolitan → generate a report on the DEFAULT path
(no hand-inserted template) → do the 2 sections RENDER? If they're in the generator but NOT the seed → Bug A again,
dead for real customers, and the "all 12 S4 sections wired" claim is false on the default path. (Did existing orgs get
re-seeded?)

## STEP 4 — WRITE PATTERNS: append-only vs UPSERT (§12 greps + §13 #4)
```bash
grep -iE "\.onConflict\(|on conflict" db/schema/agent-readiness-scores.ts inngest/functions/score-agent-readiness.ts || echo "agent_readiness APPEND-ONLY OK"
grep -iE "\.onConflict\(|on conflict" inngest/functions/crawler-log-ingest.ts || echo "crawler_logs APPEND-ONLY OK"
grep -RiE "on conflict.*page_url|onConflict.*page" inngest/functions/content-structure-audit.ts   # content_structure UPSERT → ≥1
grep -cE "llmstxt_one_current_per_brand|crawler_logs_purpose_idx" db/migrations/*sprint6_retrieval.sql   # partial unique → 2
```
Report: agent_readiness + crawler_logs are APPEND-ONLY (no ON CONFLICT); content_structure UPSERTs on (brand_id,
page_url); llmstxt one-current partial-unique. Any conflation is a §13 anti-pattern.

## STEP 5 — SCORE-FORMULA GOTCHAS (§13 #5/#6)
```bash
# entity_clarity_score must NOT read score_of_10 (/20 vs /10, different table):
grep -iE "score_of_10\s*[:=)]|\.score_of_10\b" lib/retrieval/agent-readiness.ts || echo "no score_of_10 read OK"
# local_ai_trust_score NULL for SaaS:
grep -RnE "vertical.*saas|'saas'" lib/platform/local-ai-trust-scorer.ts
# §8.4a task-fit: SaaS → task_score computed (NOT null); all-pages blocked_cdn → 3 booleans false:
grep -n "task_score\|task_pricing_visible\|task_booking_accessible\|blocked_cdn\|vertical" lib/retrieval/agent-readiness.ts | head
```
Report: agent-readiness never reads score_of_10 for entity_clarity; local_ai_trust_score is NULL for SaaS but task_score
is computed; all-pages blocked_cdn → all 3 task booleans false (not defaulted true).

## STEP 6 — CDN SHIELD (Phase B, v1.3) — honest-block rule + tier gate + no schema drift
The enhancement's #1 rule (§2, the anti-Gemini-bug): `isBlockedByCDN=true` ONLY when a CDN fingerprint AND a 403/429/503
— a **200 behind a CDN is NOT blocked**.
```bash
test -f lib/crawler/cdn-shield-detector.ts && echo "OK location" ; test ! -f lib/platform/cdn-shield-detector.ts && echo "OK no platform collision"
grep -nE "403|429|503|BLOCK_CODES|isBlockedByCDN|200" lib/crawler/cdn-shield-detector.ts | head
grep -qE "CdnShieldDetector|analyzeHeaders" inngest/functions/content-structure-audit.ts && echo "OK wired into crawl"
grep -qE "blocked_cdn" inngest/functions/content-structure-audit.ts && echo "OK writes existing error_type col"
! grep -rqE "ADD COLUMN.*(firewall|cdn|remediation)" db/ && echo "OK no new columns" || echo "FAIL: firewall column added"
```
- **The critical test:** confirm `cdn-shield-detector.test.ts` has the **Cloudflare + 200 → isBlockedByCDN===false**
  assertion (proves it didn't replicate Gemini's "any CDN = blocked" bug). Run it; break the rule (make 200 return true)
  → the test must FAIL.
- **TIER GATE (the whole point of the v1.3 fixes):** the CdnBlockAlert card must follow the **passive crawler-logs tier
  (Starter+ class), NOT Growth+** (LLD 3170). Confirm the card gates to the same tier as the S6 crawler-logs view.
  **On-screen:** does a **Starter** brand see the CDN block alert? If it's Growth+-gated, that's the exact over-gating
  the v1.3 fixes existed to prevent.
- **No schema drift:** the enhancement adds ZERO tables/columns (writes the EXISTING crawler_visit_logs.error_type =
  'blocked_cdn'), ZERO new Inngest fns (serve() unchanged by Phase B).
Report: honest-block rule + the 200-not-blocked test (re-break), Starter-tier gate on screen, no schema drift, no new fn.

## STEP 7 — Are the 76 tests real, or source-greps? (S5 had fakes)
```bash
grep -rln "readFileSync\|toContain\|readFile" tests/phase2/sprint6/ 2>/dev/null
```
Spot-check the load-bearing ones with a re-break: break the citation-probability formula, the agent-readiness dimension
math, and the CDN 200-rule → the corresponding tests must FAIL. Report any source-grep/smoke tests + whether the
re-break fires on the real ones.

## STEP 8 — serve() registration + Inngest triggers (§13 #8)
```bash
grep -cE "crawlerLogIngest|contentStructureAudit|llmstxtRefresh|scoreAgentReadiness|auditEntityHome" app/api/webhooks/inngest/route.ts   # → 5 in serve()
```
Confirm all 5 S6 fns in serve() with correct triggers (crawler-log-ingest on visit/ingested; content-structure-audit
Wed cron; score-agent-readiness + audit-entity-home on technical-audit/complete SLASH; llmstxt-refresh 1st-of-month cron).

## VERDICT — report each with evidence:
- **serve() count** (23 vs 38 resolved — the real number).
- **Crawler** REAL (crawls 20 pages) or STUB (content-audit dead).
- **Visit API** reachable (valid token→202 via curl) or silently 401'd (MW-01 broken).
- **Bug-A** — 2 slots in the SEED + render on the DEFAULT path, or wired-but-dead.
- **Write patterns / score gotchas / triggers** correct.
- **CDN Shield** — honest-block rule (200-not-blocked re-break), Starter-tier gate on screen, no schema drift.
- **Tests** real-behavioral (re-break fires) or source-greps.
NO fixes this pass — report, then scope fixes for what's broken.

## Constraints
- DIAGNOSE + report only. The REAL-DATA/REAL-REQUEST smokes (crawler crawls, curl the Visit API, generate a default-path
  report, Starter sees the CDN alert) are the POINT — greps confirm wiring exists, the smoke confirms it WORKS.
- LLD v8.70 WINS (prompts say v8.68). Migrations to BOTH DBs. subscriptions.tier not organizations.tier.
- Bug-A is the highest-probability real bug (same "wired" language as S5) — the default-path report smoke is decisive.
- The crawler-is-real check is decisive for whether content-structure-audit works at all.
- LLD v8.70 / core §13 / CDN §2 / LLD 3170 (tier) win.

## NOTE
Same method that unearthed S5's eight bugs, applied to S6. The build report says "76 green" — but S5's "62 green" hid a
dead-on-default-path feature, a silently-unreachable state, and systemic UI bugs. The S6-specific decisive checks: (STEP
0) the serve() count is 23 per canon, not 38 — resolve the gap; (STEP 1) is the crawler REAL (20-page crawl) or a stub
that leaves content-audit dead; (STEP 2) is `/api/visit` actually reachable (curl a valid token → 202) or silently 401'd
by the middleware (MW-01); (STEP 3) THE BUG-A TRAP — the 2 forward slots must be in the default-template SEED and render
on the DEFAULT path (S5's exact bug; the report used the same "wired" word); (STEP 6) CDN Shield's honest-block rule (200
behind CDN → NOT blocked, re-break the test) + the Starter-tier gate on screen (the v1.3 fixes' whole point). Report all
with real-data/real-request evidence; then fix what's confirmed broken.
