# Claude Code — TIGHTEN 4B: make it guard the awaitingReport race bridge (the actual bug 9), then prove by re-break

Your check found 4B tests poll MECHANICS (poll picks up DB changes → flip; poll stops after Ready) but NOT the
`awaitingReport` RACE BRIDGE — which IS bug 9. 4B seeds a row with `pdfUrl: null`, so a generating row already exists
when the test starts, skipping the race entirely. The real bug: POST returns 202 BEFORE Inngest creates the row → at
click time there are ZERO generating rows → without `awaitingReport` the poll never starts. Rewrite 4B so it exercises
that window and FAILS when `awaitingReport` is dropped.

Env: Windows repo `C:\startup\VisibleAU\src\`. Playwright + Chromium. DEV DB `visibleau`, LLM_MODE=mock,
STORAGE_DRIVER=local — NEVER prod (Section 4 footgun). Confirm the dev server is on dev DB before running.

## STEP 1 — Read the current 4B + how the test controls report rows
```bash
find . -name "auto-refresh*.spec.ts" -o -name "*reports*e2e*.spec.ts" 2>/dev/null | grep -v node_modules
sed -n '1,120p' <4B spec file>
# How does the test currently seed/insert a report row + simulate Inngest? (need to insert a row mid-test)
grep -n "pdfUrl\|pdf_url\|insert\|seed\|generate\|POST\|request\|GET.*reports\|waitForTimeout\|expect" <4B spec file>
```
Report: the current 4B structure, how it seeds rows, and whether the test can INSERT a generated_reports row mid-test
(directly via db, or via a test helper). The tightened test needs to: click Generate, THEN insert the row after a beat,
THEN set pdfUrl — simulating the Inngest race.

## STEP 2 — Rewrite 4B to exercise the awaitingReport window (COUNT-based, not time-based, to avoid flakiness)
The decisive assertion: after clicking Generate with ZERO generating rows, polling must START (GET /reports fires while
the reports array is still empty) — that's what `awaitingReport` enables and what fails when it's dropped. Use a
count-of-requests-while-empty proof, NOT a fixed delay (a delay-based race the test itself creates would be flaky —
exactly the flakiness we just eliminated).
```ts
test('awaitingReport keeps polling alive in the race window (POST 202 before Inngest row exists)', async ({ page }) => {
  // 1) Start with NO reports for this brand (empty list — the race precondition):
  await seedBrandWithNoReports(brandId);              // ensure zero generated_reports rows
  await page.goto(`/brands/${brandId}/reports`);
  await expect(page.getByText(/no reports yet/i)).toBeVisible();   // confirm empty state

  // 2) Capture GET /reports polls:
  const polls: number[] = [];
  page.on('request', r => {
    if (r.url().includes(`/api/brands/${brandId}/reports`) && r.method() === 'GET') polls.push(Date.now());
  });

  // 3) Click Generate → sets awaitingReport=true. The API returns 202; NO row exists yet (mock the generate route to
  //    NOT immediately insert, OR intercept so the row is absent — simulate the real 202-before-Inngest race):
  const pollsBeforeClick = polls.length;
  await page.getByRole('button', { name: /generate report/i }).click();

  // 4) DECISIVE: polling must START even though the list is still EMPTY (0 generating rows).
  //    This is what awaitingReport enables; with it dropped, shouldPollReports([],false)=false → no poll → this fails.
  await expect.poll(() => polls.length, { timeout: 8000, message: 'poll must fire while list is empty (awaitingReport)' })
    .toBeGreaterThan(pollsBeforeClick);
  // (optional stronger form: assert ≥2 polls while the DOM still shows the empty/generating state and no card exists)

  // 5) NOW simulate Inngest: insert the report row (pdfUrl null), then a beat later set pdfUrl (render complete):
  await insertReportRow(brandId, { pdfUrl: null });   // Inngest inserted the row
  const card = page.locator('[data-report-card]').first();  // adapt selector
  await expect(card.getByText(/generating/i)).toBeVisible();
  await setReportPdfUrl(brandId, `reports/${brandId}/r.pdf`);  // render complete

  // 6) Badge flips WITHOUT reload, then polling STOPS:
  await expect(card.getByText(/ready/i)).toBeVisible({ timeout: 10000 });   // NO page.reload()
  const countAtReady = polls.length;
  await page.waitForTimeout(8000);
  expect(polls.length).toBe(countAtReady);            // polling ceased
});
```
- Adapt `seedBrandWithNoReports` / `insertReportRow` / `setReportPdfUrl` to the repo's actual test helpers (STEP 1). The
  KEY is step 4: **poll fires while the list is empty** — that's the awaitingReport bridge.
- Keep the existing 4B mechanics test too (poll-picks-up-changes + poll-stops) as a SEPARATE test — it's still valuable.
  This new test ADDS the race-bridge coverage; don't delete the mechanics one.
- Use `expect.poll` / count-based assertions, NOT `waitForTimeout` as the proof — timing-based race assertions are
  flaky. The "poll fired while empty" is observable by request count, deterministically.
- If the generate route ALWAYS inserts the row synchronously (no true 202-before-row gap in mock), intercept/mock the
  route so the row is genuinely absent at click time — that's what reproduces the real race. Report how you simulated it.

## STEP 3 — PROVE the tightened 4B catches the regression (re-break)
```bash
# Break: in lib/communication/should-poll-reports.ts drop the awaitingReport term:
#   return reports.some(r => !r.pdfUrl);         // (remove "|| awaitingReport")
# Restart dev server if the running server doesn't hot-reload the change.
npx playwright test <4B spec> --project=chromium 2>&1 | tail -20
```
- The NEW race-bridge test MUST now FAIL — specifically on step 4 ("poll must fire while list is empty"): with
  awaitingReport dropped, `shouldPollReports([], false)` → false → no poll fires → the expect.poll times out.
- Report: did the tightened 4B fail on the empty-list poll assertion? (If it stayed green, the test still isn't hitting
  the race — report why.)

## STEP 4 — RESTORE + confirm green
```bash
# Revert should-poll-reports.ts: return reports.some(r => !r.pdfUrl) || awaitingReport;
# Restart dev server; re-run:
npx playwright test <4B spec> --project=chromium 2>&1 | tail -10
```
- Tightened 4B GREEN on restore. Full Playwright suite green. Full vitest suite still 121/1848.
- Report the final Playwright count (was 18; +1 if you added the race test as a new spec).

## VERDICT
- **AIRTIGHT:** tightened 4B FAILS on the break (empty-list poll assertion) and passes on restore → bug 9's
  awaitingReport race bridge is now guarded END-TO-END. Convergence #7 fully airtight. Track completely closed.
- **STILL NOT HITTING IT:** if the tightened test stays green on the break → the row is being inserted synchronously so
  the list is never actually empty at poll time → report how the generate route behaves and mock it so the row is
  genuinely absent at click. Do NOT weaken the assertion to force a pass.

## Constraints
- DEV DB / mock / local storage — never prod. Confirm before running.
- COUNT-based poll assertions (expect.poll on request count), not fixed-delay races — no new flakiness.
- Keep the existing poll-mechanics 4B test; ADD the race-bridge test (don't replace and lose coverage).
- Do NOT call page.reload() in the flip assertion — auto-refresh is the thing under test.
- The break-and-restore is temporary — leave should-poll-reports.ts CORRECT (STEP 4). Confirm restore.
- If it won't hit the race, report the reason + how you simulated 202-before-row — don't paper over with a weaker assert.

## NOTE
The gap your check found: 4B tested poll mechanics but not the awaitingReport race (it pre-seeded a generating row,
skipping the window). The real bug 9 is the empty-list-at-click race: POST 202 before Inngest creates the row →
awaitingReport must keep the poll alive until the row appears. The tightened test starts EMPTY, clicks Generate, and
asserts (count-based) that polling FIRES WHILE THE LIST IS STILL EMPTY — the exact behavior awaitingReport enables and
the exact thing that fails when it's dropped. The re-break proof (step 4 assertion fails without awaitingReport) is what
makes it a real regression guard, not a green that skips the seam — the same standard that caught this. Restore when done.
