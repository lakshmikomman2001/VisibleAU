# Claude Code — S6 track PHASE 4 (Frontend E2E) — STEP 0: is the Playwright harness set up? (scoping check BEFORE writing E2E tests)

Phase 4 = Frontend E2E (Playwright) — the browser-level tests that mirror the manual screen pass (the phase skipped in
S5, and most aligned with S6's rendered-screen bugs). BUT: Playwright browser tests need real infrastructure (a config, a
browser install, an AUTH fixture for the (auth) routes, seeded data, a running server) — and "Playwright" in the S6
prompt refers to the CRAWLER (lib/crawler), NOT a test harness. So before writing any E2E tests, CHECK whether the
Playwright TEST harness exists. Report what's there vs what needs building — do NOT write the 5-screen tests yet.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. Never prod.

## STEP 1 — Does a Playwright TEST harness exist? (distinct from the crawler's Playwright use)
```bash
# Playwright test framework installed? (NOT playwright-core for the crawler — the @playwright/test runner)
grep -E "@playwright/test|playwright" package.json
# A Playwright config?
ls playwright.config.* e2e/ tests/e2e/ 2>/dev/null
find . -path ./node_modules -prune -o -name "*.spec.ts" -print 2>/dev/null | grep -iE "e2e|playwright" | head
# Any existing E2E/browser tests (S4's "18+1 Playwright" — do they exist in the repo)?
find . -path ./node_modules -prune -o -name "*.spec.ts" -print 2>/dev/null | head
grep -rln "test.*page.goto\|@playwright/test\|expect.*page\)" tests/ e2e/ 2>/dev/null | head
```
Report: (a) is @playwright/test installed? (b) is there a playwright.config? (c) do ANY Playwright browser tests exist in
the repo (S4's supposed ones)? This tells us if we're ADDING to a harness or BUILDING one.

## STEP 2 — The AUTH story for (auth)-group routes (the hard part of E2E)
The 5 retrieval screens are `(auth)`-group — Better Auth session required. Playwright needs to authenticate. Check what
exists:
```bash
# An auth fixture / storageState / test-login helper for E2E?
grep -rln "storageState\|test.use.*storageState\|login.*fixture\|authenticat" e2e/ tests/e2e/ playwright.config.* 2>/dev/null
# Is there a test-login route or a way to seed a session? (Better Auth)
grep -rln "better-auth\|createSession\|test.*login\|seedSession" tests/ e2e/ lib/auth* 2>/dev/null | head
```
Report: is there an auth fixture for E2E (a way to get a logged-in session in Playwright), or would it need building? This
is usually the biggest E2E setup cost.

## STEP 3 — Seed + server story
- **Seed:** the 5 screens need Metropolitan's data (agent_readiness_scores + content_structure_audits w/ entity-home cols
  + the default-template) — which we've been seeding all session. Confirm a seed script exists that Playwright could run
  (or point to the seeds we've used).
- **Server:** Playwright needs a running dev server (playwright.config `webServer` can auto-start `next dev`, OR it runs
  against an already-running one). Report which pattern the repo uses (if any).

## STEP 4 — Report the scoping verdict (do NOT write tests yet)
Based on 1-3, report ONE of:
- **A) Harness EXISTS** (config + auth fixture + seed) → Phase 4 is just ADDING the 5-screen specs. Report what's there;
  we write the E2E tests next (small).
- **B) Harness PARTIAL** (e.g. Playwright installed but no auth fixture) → report exactly what's missing (usually the
  auth fixture) — that's the build cost before the screen tests.
- **C) Harness DOESN'T EXIST** (no @playwright/test, no config) → Phase 4 = build the harness from scratch (install,
  config, auth fixture, seed hook) THEN the screen tests. This is a meaningfully bigger task than the other phases —
  report it honestly so Sri can decide: build the harness now, or defer Frontend E2E (as S5 did) and note it as the
  carried gap.

## Constraints
- STEP 0/scoping ONLY — do NOT write the 5-screen Playwright tests this pass. First establish whether the harness exists.
- Distinguish the CRAWLER's Playwright use (lib/crawler — exists) from a Playwright TEST harness (may not).
- The auth fixture for (auth) routes is the usual blocker — report its status specifically.
- Be honest about scope: if it's option C (build from scratch), say so — don't understate it. Frontend E2E was skipped
  in S5; if the harness doesn't exist, deferring again (with a logged carried-gap) is a legitimate choice vs building it.
- Never prod.

## NOTE
Phase 4 opener — scoping check, NOT the tests. Playwright browser E2E needs infra the vitest phases didn't: a config, an
AUTH fixture for the (auth)-group retrieval routes (the usual biggest cost), seeded data, a running server. And
"Playwright" in the S6 prompt is the CRAWLER, not a test harness — so it's unconfirmed a test harness even exists (S4's
"18+1 Playwright" is unverified in-repo). CHECK: is @playwright/test installed, is there a config, do any browser tests
exist, and — critically — is there an auth fixture to log in for the (auth) routes? Report A (harness exists → just add
the 5-screen specs), B (partial → what's missing), or C (build from scratch → a bigger task; Sri decides build-now vs
defer-as-S5-did). Do NOT write the screen tests until the harness status is known.
