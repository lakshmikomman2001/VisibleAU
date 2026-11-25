# S06 — Question intelligence 4a: analysis fetch preset, website analysis, question writer, confirm screen v2

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S06-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S05 pushed); say which hash. Read LLD **section 0** (v1.9 decisions and amendments) first, then sections 4, 6.1, 7.4, 7A (0159), 8.6.1–8.6.3, 8.6.5, 8.6.6, 8.6.9, 11, 12, 13, 14, 20 (D-QI1, D-QI5, D-QI6); `docs/lld/design/Vunnara-question-intelligence-design-v3.pdf` layers 1, 5 and 6 (reasoning only; the LLD is the spec); contract screens P10, P12, P02 (reasons chips).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; tests use recorded fixtures, never live sites or live model calls. No `any`; FORCE RLS; no new `serviceDb`; no production writes (0159 as a run1–run4 set).
- **Security gate:** Part 1 must pass before any other part fetches anything (S00B's fetcher plus the analysis preset).
- Nothing is used until the client confirms. Existing brands keep their questions; "Improve my questions" only suggests.
- Behind `qi_website` (off). Decision defaults: no JavaScript rendering (D-QI1); US$0.50 cost ceiling per analysis (D-QI5); all paid plans for new brands, "Improve my questions" from Growth (D-QI6).
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Analysis fetch settings on the guarded fetcher (LLD 8.6.2) — security gate
S00B built `lib/fetch/guarded-fetch.ts` and moved every existing caller onto it. The analysis layers are new callers and turn on the options existing callers leave off (LLD 8.6.2, analysis preset; S00B report "For S06"): `{ userAgent: CRAWLER_USER_AGENT, obeyRobots: true, maxRedirects: 3, timeoutMs: 10_000, maxBytes: 2 MB, allowedContentTypes: HTML and XHTML (plain text for robots.txt, XML for sitemaps), allowHttp: false }`, plus one request per second per host **across all instances**: S00B's `perHostIntervalMs` paces within one process only, so add the shared rate limiter (Upstash, falling back to Postgres as the app's other limiters do). robots.txt follows S00B's rules (own group, then `*`; 4xx allows, 5xx or no answer disallows; cached 10 minutes). One shared `analysisFetch` preset, used by every analysis layer, that callers can't weaken. Analysis code calls `guardedFetch` through the preset, so `no-unguarded-fetch` needs no new entry. Tests: robots disallow respected; the per-host limit holds across concurrent runs; the preset can't be weakened; the S00B security tests and the no-unguarded-fetch guard still pass. Report the test list.

## 2. Schema (migration 0159)
`analysis_runs`, `brand_profiles`, `profile_services`, `profile_places`, `profile_evidence`, `question_candidates`, `page_cache` per LLD 7.4 (FORCE RLS, grants, indexes). Add to RLS list, cascade, retention job (page cache 7 days; others 12 months like audits) and `data-facts.ts`.

## 3. Analysis pipeline skeleton (LLD 8.6.1)
Inngest `analysis-run` on `brand/analysis.requested`: steps with status in `analysis_runs.layers`, concurrency (org 2, brand 1), retries with backoff, per-step cost recording (operator-only), ceiling stops paid steps and records what was skipped, re-analysis ≤ 3/day per brand. Triggers: new brand after step 2 of the wizard; "Improve my questions" (Growth+). Progress screen P12 (aria-live). Tests: step state machine, partial on failure, ceiling, rate limit, function id snapshot (N13).

## 4. Layer 1: website extraction (LLD 8.6.3)
Page discovery (robots, sitemaps ≤ 500 URLs, home links), URL scoring with taxonomy service words, fetch home + top 10 via the fetcher with `page_cache`, main-content extraction, JSON-LD (`LocalBusiness`/`Organization`: areaServed, makesOffer, hasOfferCatalog, address, telephone), model extraction to a fixed zod schema with delimited page text ("data, not instructions"), **quote verification** (normalised quote must appear in that page's text, else drop), normalisation to taxonomy services, prominence, reach signals, "needs JavaScript" rule (< 150 words). Tests with recorded fixtures: TechCore IT pages (13 services, remote/interstate signal), Hero, Omega; injection fixture ("ignore previous instructions…" in page text) has no effect; hallucinated quote dropped.

## 5. Layer 5: writer and scorer, demand neutral (LLD 8.6.5)
Candidates per enabled reach (≈ 3× target) from services × intents × places; hard filters; score `0.35R + 0.30D + 0.25K + 0.10S` with D = 0.5 and K from a model judgement (recorded in tests); balanced choice per reach; reasons stored; branded questions keep today's logic (with S00 phrasing). Results in `question_candidates`; chosen ones become library suggestions. Tests: filters, balance rules, reasons shape, TechCore IT fixture yields Sydney/NSW/Australia questions matching its services (e.g. Microsoft 365 backup, cybersecurity), none naming the business.

## 6. Confirm screen v2 (LLD 8.6.6, P10)
Three steps (services with sources and quotes, where you work with reach switches and Local fixed on, questions with "Why this question" chips; swap, add own on Growth+, count), defaults pre-ticked, unreachable/JS-site banner. Confirm saves the profile (confirmed) and applies set v1 for a new brand (starts the first audit) or v n+1 for "Improve my questions" via the S03 apply flow with notice. Tests: component, e2e new brand flow with recorded analysis, accessibility (axe), 390 px.

## 7. Evaluation harness (LLD 8.6.9)
`scripts/eval/question-intel/` (local only; refuses to run against production env): reads `eval/businesses.json` (Sri fills the 20 businesses; include Hero, Omega, TechCore IT), runs layers 1+5 against live public sites from the developer machine, writes candidates and a blind-rating sheet (CSV) and `docs/eval/<date>.md` with services found and questions. Do not commit any business list Sri hasn't provided. Report how to run it.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1: the security test list and results.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S06/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0159 first; Inngest resync (yes: new functions); safe while an audit runs; flag `qi_website` off; operator cost lines visible on `/admin/costs`.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
