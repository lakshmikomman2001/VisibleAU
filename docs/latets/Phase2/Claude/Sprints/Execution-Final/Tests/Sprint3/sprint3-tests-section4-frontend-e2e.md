# Claude Code — Sprint 3 automated tests · SECTION 4 of 5: FRONTEND E2E (Playwright, real browser + real data)

Section 4 of the Sprint 3 test track. Sections 1 (Backend Unit 80) + 2 (Backend E2E 263, acceptance MET) + 3
(Frontend Unit 65) are green (328 total). Section 4 = **real-browser, real-data** Playwright E2E of the Sprint 3
screens, worked **FE-1 → FE-4**, matching the Sprint 2 FE-E2E pattern.

## ⚠️ DATABASE — handle this yourself, do NOT ask (the recurring footgun)
These E2E tests drive the real app against a real DB and **CREATE/TEAR DOWN test data → DEV/test DB ONLY, NEVER
prod.** Last time, the dev server was running on **`visibleau_prod`** via `.env.local` while tests seeded into
`visibleau` (dev) — a guaranteed mismatch, and worse, seeding/deleting in prod tables.
- Determine which DB the app/test run will use (the `DATABASE_URL` the app loads when Playwright starts it, and the
  `webServer` config in the Sprint 3 `playwright.config.ts`).
- If it points at **prod**, run the E2E against the **dev** DB (`visibleau`) for the test run only — restart the
  dev server with `DATABASE_URL=<dev>` + `LLM_MODE=mock` (do NOT change prod, do NOT leave the app on prod).
- If no dev/test DB exists, **STOP and report** — do NOT run data-mutating E2E against prod.
- **Confirm in the report which DB the E2E run actually used** + which role.

## ⚠️ APP + INNGEST running (the visibility data depends on events)
Sprint 3's screens show data produced by the 5 Inngest functions firing on **`audit.complete`**. So to see real
data end-to-end:
- The Next.js app must be running (Playwright `webServer` or separately), against the **dev** DB, `LLM_MODE=mock`.
- **Inngest reachable in DEV mode** (the client keys dev/cloud off `isDev`/`NODE_ENV` — the fix from this session).
  For flows that need the visibility tables populated, either (a) run with Inngest up and **run an audit → the 5
  functions fire → tables populate**, then assert the screens, OR (b) **seed the visibility tables directly** with
  deterministic test rows and assert the screens render them. Do NOT silently pass when data never got produced —
  if an event-dependent step can't run, poll-with-timeout or seed directly; never green on empty.
- **Mock-mode caveat:** in `LLM_MODE=mock` the SoV/fan-out values are canned (Bondi-shaped). So assert
  **STRUCTURAL** facts ("a bar for the brand renders with a % and the 'you' chip"; "fan-out shows a real suburb, no
  literal {location}"; "the archetype card renders"), **NOT** specific numbers/text (don't assert "50%" or exact
  sub-query strings — that tests the mock).

## Safety rule (report-first)
- **FE-1, FE-2, FE-3:** write E2E tests, run them, **REPORT failures for review** — do NOT auto-edit source. A
  failure may be a real app bug OR flaky/wrong test; decide before any source change.
- **FE-4 (run all + fix):** ONLY this pass may change source to green — post-review.
- A pass is "Done" only when its tests actually ran. Never invent results. "Done - errors fixed" / "Blocked - <reason>".
- Playwright resilient: proper waits/locators, **no arbitrary sleeps** (avoid flake).

## ✅ THREE-SOURCE ANCHOR (LLD v8.70 + Sprint 3 prompt §6U + prototype FIX17)
- **§6U flows:** VisibilityHub (6U.2), CitationFailureDiagnosis (6U.3), CompetitiveBenchmark panel (6U.4), dashboard
  SoV strip (6U.5) — each screen's on-screen behaviour + STATES.
- **Enhancement reality:** SoV = **ranked BARS** (not donut); brand highlighted by **IS-BRAND** (not rank), visible
  at 0%; competitors muted. Citation-failure + competitive-benchmark **CPR-01 degrade gracefully** (S5/S7 absent).
- **The manual-pass bugs (assert they're fixed on screen):** visibility hub **reachable via the nav card** (was
  orphaned); citation-failure **reachable from the hub** (was orphaned); routes **200 not 500** (unmigrated-tables
  bug); dashboard strip **renders independent of tasks** (was hidden behind the task guard); fan-out
  **{location} substituted** (was literal).

---

## THE PASSES

### FE-1 — WRITE (Playwright E2E for the Sprint 3 screens, real seeded data). REPORT.
Cover the visibility user journeys on a seeded test brand (a Bondi-equivalent in the dev DB, with an audit run so
the visibility tables have data — or seeded rows):
1. **Nav to the Visibility hub via the CARD** (brand detail → the "Visibility" card → `/brands/[brandId]/visibility`)
   — assert reachable WITHOUT typing the URL (the orphaned-nav fix). The card is tier-gated (locked teaser for a
   free-tier brand; active for Growth+).
2. **SoV renders as BARS** — assert a horizontal bar for the brand with a **"you" chip** + a `%` (tabular), the
   **brand bar highlighted** (layer-visibility) and competitor bars muted; bars **sorted by share DESC**; **no SVG
   donut/circle**. (Structural — don't assert specific percentages.)
3. **Mention-Source 2×2** renders the archetype (active quadrant lit); a **NULL ratio shows 'N/A'** on screen (if a
   seeded null-ratio case is available).
4. **Fan-out tree** renders sub-queries with a **real suburb (no literal `{location}`)**; above-threshold rows
   visibly distinguished.
5. **Topical gaps** render sorted; the **"HIGH LEVERAGE … improves N prompts" badge** shows for a ≥2 seeded gap.
6. **Citation Failure Diagnosis reachable from the hub** (the link added this session) → the page renders; with
   S5/S7 empty it shows the **CPR-01 graceful state** ("No citation gaps found" positive empty + the muted "deeper
   diagnosis available after trust + comparison data" note) — **not a 500/error**.
7. **Competitive Benchmark panel:** with comparison_prompt_results empty → the **"Coming soon" card (NOT an error)**;
   **tier states** — Starter sees the **locked teaser**, Growth/Agency see the unlocked panel.
8. **Dashboard SoV strip** (Overview) renders the bars for the brand — and **renders with 0 workflow tasks** (the
   guard-placement fix; assert it shows even when the brand has no tasks).
REPORT results.

### FE-2 — DEEPEN + FILL GAPS. REPORT.
Edge/empty/error states on screen:
- **Empty (no audits):** the hub shows "Run an audit to see visibility intelligence" (not an error/blank).
- **Insufficient-data:** a metric shows with a ConfidenceBadge "Insufficient data" — **shown, not hidden**.
- **Loading:** skeletons render (aria-busy) before data.
- **Tier gating on screen:** the Visibility card locked for a free-tier brand; competitive-benchmark locked teaser
  for Starter; Growth 1 / Agency 3 competitor scope.
- **Error boundary:** a route error surfaces a boundary, not a raw crash.
Add tests (real seeded data). REPORT failures.

### FE-3 — CROSS-SPRINT GAPS (S1→S3, on screen). REPORT.
- **Full flow:** brand (S1) → run audit (earlier) → the 5 S3 functions fire on `audit.complete` → the hub shows
  populated visibility data (bars, fan-out, gaps). (Inngest up, or seed then assert.)
- **Brand isolation at the UI level:** a user in org B cannot reach org A's visibility hub / sees 404, not data
  (the tenant-isolation contract, on screen).
- **Wins/dashboard:** the dashboard reflects S3 data (SoV strip) alongside the S2 Work-Completed card (both present,
  not one clobbering the other).
REPORT failures.

### FE-4 — RUN ALL + FIX. (May change source — post-review only.)
Run ALL Sprint 3 Playwright E2E. For each FE-1..3 failure reviewed as a genuine app bug, fix it (note file + why);
for a flaky/wrong test, fix the test (note why). Report final green + every source change.

## ASSERTIONS THAT MUST BE CORRECT (current post-enhancement behaviour)
1. **SoV renders BARS, not a donut** — a test expecting an SVG donut is wrong; assert the bars.
2. **Brand bar highlighted by IS-BRAND, not rank** — if the seed has a competitor with higher share, the **brand**
   bar is still the highlighted one; brand bar **visible at 0%**.
3. **Visibility hub reachable via the card**; **citation-failure reachable from the hub** (no URL typing).
4. **CPR-01 graceful on screen** — citation-failure + competitive-benchmark show their "coming soon"/positive-empty
   states when S5/S7 empty, **never a 500/error**.
5. **Dashboard SoV strip renders with 0 tasks** (independent of the workflow-task guard).
6. **Fan-out shows a real suburb**, no literal `{location}`.
7. Tier gating: Visibility card + competitive-benchmark gate by **`subscriptions.tier`** (Starter locked / Growth 1
   / Agency 3), never organizations.tier.
(A test that "passes" against a pre-fix contract — donut, rank-highlight, task-gated strip, literal {location}, a
500 on empty S5/S7 — is WRONG. Assert the fixed behaviour.)

## INVARIANTS
- **DEV/test DB only — never prod.** Confirm which DB the E2E run used.
- Inngest dev mode for event-dependent data (or seed directly / poll-with-timeout — never silent-pass on empty).
- Mock mode → **structural assertions, not specific numbers/text** (the canned mock values aren't the contract).
- Report-first: FE-1..3 report failures (app-bug vs flaky/wrong-test each); only FE-4 changes source, post-review.
- Test CURRENT (post-enhancement) behaviour — bars, is-brand highlight, reachable nav, CPR-01 graceful,
  task-independent strip, {location} substituted, subscriptions.tier gating.
- Resilient locators/waits, no arbitrary sleeps. Tear down seeded data. Don't regress the 328 existing tests.

## REPORT
- **Which DB the E2E run used** (confirm DEV/test, not prod) + role + how Inngest/event-dependent data + mock mode
  were handled (seeded vs audit-run).
- Per pass (FE-1..FE-4): tests written/added, run results, **failures reported** (app-bug-vs-flaky/wrong-test each;
  not auto-fixed except FE-4 post-review).
- Confirm the post-enhancement assertions on screen: bars not donut; is-brand highlight + brand visible at 0%; hub
  + citation-failure reachable via nav; CPR-01 graceful (no 500); dashboard strip independent of tasks; fan-out
  suburb substituted; tier gating by subscriptions.tier.
- Final Section 4 status: FE-1..FE-4 green (or blocked rows with reasons). Total E2E test count + overall suite count.

## NOTE
E2E is the flakiest section (real browser, timing, async events) — FE-1 may surface flake-vs-real-bug judgment
calls; the report-first rule is built for exactly that. Section 4 of 5. After green: **Section 5 (QA — batch-script
run)** is the last — run each feature's batch script, confirm it closes & relaunches BOTH backend + frontend,
exercises the feature with real test data end-to-end. This prompt covers Frontend E2E only.
