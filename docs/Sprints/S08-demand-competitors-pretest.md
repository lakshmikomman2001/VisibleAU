# S08 — Question intelligence 4c and 4d: local search demand, competitors, pre-test

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S08-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S07 pushed); say which hash. Read LLD **section 0** (v1.13 decisions and amendments) first, then sections 7.4 (`search_demand_cache`), 7A (0160), 8.6.5, 8.6.7, 12, 13, 14, 20 (D-QI3, D-QI4); contract screens P10 (demand pills, competitor suggestions), P12.

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; recorded fixtures in tests; no live provider calls in tests. No `any`; FORCE RLS on org tables; global cache written only through `upsert_search_demand()`; no new `serviceDb`; no production writes (0160 as a run1–run4 set).
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Demand data is public market data: seed phrases are service × place, never the business's name.
- Pre-test answers never count toward any score and are never shown as audit results.
- Behind `qi_demand`, `qi_competitors`, `qi_pretest` (off). Decision defaults: demand spend yes with the 30-day global cache (D-QI3); pre-test on Starter's low-cost engine, ≤ 15 answers per run (D-QI4).
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Confirm the DataForSEO products and costs (no product change)
From DataForSEO's documentation and pricing: Google Ads search volume (live) endpoint, limits (1,000 keywords/request, 12 requests/min per account) and per-request price; organic SERP with `people_also_ask` and `local_pack` items and the click-depth option; Google autocomplete; Australian location names/codes for city, state and country. Quote each with its link in code comments and give Sri a per-analysis cost estimate table (operator-only figures; never shown to customers).

## 2. Global demand cache (migration 0160)
`search_demand_cache` (global, on S05's read-only list for `visibleau_app`, D-GT) and `upsert_search_demand()` SECURITY DEFINER (validates phrase shape: no brand names from `brands`/aliases, length limits). run3 grants and a test that the app role can't write the table directly.

## 3. Layer 3: demand (LLD 8.6.7)
Seeds from confirmed services × each enabled reach's place; one volume request per run (global queue honouring 12/min across workspaces via Upstash), autocomplete + People also ask for the top 3 services; relative High/Medium/Low within the brand; phrasings and question forms feed the writer; label "Google search estimates (DataForSEO), region level". Tests: seed builder never includes the name or aliases; queue; cache hit avoids paid calls; demand labels.

## 4. Writer uses demand
D in the score now comes from layer 3; reasons gain demand and phrasing sources. Weights version bumps to `v2` only if the evaluation shows improvement; otherwise keep `v1` and report. Tests updated.

## 5. Layer 4: competitors (LLD 8.6.7)
Up to 3 confirmed competitors with websites; home + 3 service pages each via the fetcher (workspace page cache); services offered by ≥ 2 competitors but missing → "Do you also offer…?" on P10 step 1; never added without yes; head-to-head questions use shared services. Tests with fixtures.

## 6. Pre-test (LLD 8.6.5 step 5)
Chosen + 5 spares, once each, on the Starter low-cost engine with the reach's location settings; pass = ≥ 2 local businesses named or a directory cited (business names from cited domains via the registry rule, consistent with finding rule f); failures swapped for the best spare; results in `question_candidates.pretest` and reasons; cost recorded; ≤ 15 answers per run. Tests: pass/fail rules, swap, cap, never written to `citations`.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1's product/cost table.
- Evaluation: business-naming rate of new vs current questions on the 20 businesses (target: higher on most), and measured cost per run vs the ceiling.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S08/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0160 first; Inngest resync (yes); safe while an audit runs; flags off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
