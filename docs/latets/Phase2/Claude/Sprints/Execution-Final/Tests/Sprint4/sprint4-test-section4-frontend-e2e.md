# Claude Code — Sprint 4 Automated Test Track · SECTION 4 of 5: FRONTEND E2E (Playwright)

Mirror Sprint 3's Section 4 (16 Playwright + Chromium tests, seeded data, green). Real browser, real Next dev server,
real DEV DB, LLM_MODE=mock. This is where Sprint 4's report UI is tested WIRED end-to-end — catching
integration/routing/render-in-context bugs unit tests structurally can't, and CLOSING bug 9 (auto-refresh) end-to-end.

Env: Windows repo `C:\startup\VisibleAU\src\`. Match S3's Playwright config/dir.

## ⚠️ STEP 0 — THE DEV-DB FOOTGUN (do this FIRST, non-negotiable)
Sprint 2's FE E2E track hit this: the dev server defaults to `visibleau_prod` via `.env.local`, but tests seed into
`visibleau` (dev) → mismatch, AND E2E tests SEED/DELETE data which must NEVER touch prod.
```bash
# 1. Confirm which DB the running dev server points at:
grep -nE "DATABASE_URL|visibleau_prod|visibleau\b|LLM_MODE|STORAGE_DRIVER" .env.local
# 2. RESTART the dev server explicitly on the DEV DB + mock LLM + local storage BEFORE any test:
#    DATABASE_URL=...visibleau (NOT _prod), LLM_MODE=mock, STORAGE_DRIVER=local
# 3. Playwright must target the running dev server (baseURL http://localhost:3000) — confirm playwright.config.
grep -nE "baseURL|webServer|use:|DATABASE_URL" playwright.config.* tests/e2e/**/*.config.* 2>/dev/null
```
Report: the dev server is confirmed on `visibleau` (dev), NOT `visibleau_prod`; LLM_MODE=mock; STORAGE_DRIVER=local.
**Do NOT run a single E2E test until this is confirmed — seeding/deleting against prod is the footgun.** If the config
can't be confirmed dev, STOP and report.

## STEP 1 — Match S3 Playwright convention + seed/auth setup
```bash
find . -path "*sprint3*" -name "*.spec.ts" -not -path "*/node_modules/*" | head
sed -n '1,60p' playwright.config.*
# How does S3 seed + authenticate (Better Auth session, storageState, seed helper)?
grep -rn "storageState\|seed\|beforeAll\|Better Auth\|login\|test.use\|globalSetup" tests/e2e/ | head
```
Report the auth/seed pattern (Better Auth session via storageState, seed helper for org/brand/reports). Reuse it — seed
an Agency-tier org + a brand + some generated_reports rows for the list tests; a separate Growth and Starter org for
tier-gate tests. Selectors: the prototype uses ROLE/TEXT (e.g. the "Generate report" button, status-badge text), NOT
data-testid — target by role/name/text. Add data-testid ONLY where a selector is genuinely ambiguous (and note it).

## The Section 4 spec files (real browser flows — §6U.2–6U.5)

### 4A — reports-list.spec.ts  [§6U.2 — the list renders wired]
- navigate to `/brands/{seededBrandId}/reports` (Agency org) → the Reports list renders with LayerBadge "reports",
  seeded report cards showing headline / period / derived status badge.
- a card whose seeded row has pdf_url set → status "Ready" + Download action ENABLED; a row with pdf_url null → status
  "Generating" + Download DISABLED.
- empty state: a brand with no reports → EmptyState "No reports yet — Generate your first".
- responsive: at md the cards are grid-cols-2, at <sm actions stack (assert layout class or bounding box).

### 4B — auto-refresh.spec.ts  [★ BUG 9 END-TO-END — the decisive close; this is why Section 4 exists]
The full behavioral proof the unit test (3B, condition only) can't give:
```ts
test('generating a report auto-flips Generating→Ready WITHOUT reload, then polling STOPS', async ({ page }) => {
  await page.goto(`/brands/${brandId}/reports`);
  // capture GET /reports poll requests to prove polling starts AND stops:
  const pollHits: number[] = [];
  page.on('request', r => { if (r.url().includes(`/api/brands/${brandId}/reports`) && r.method()==='GET') pollHits.push(Date.now()); });

  await page.getByRole('button', { name: /generate report/i }).click();
  // the new row appears as Generating (mock LLM + local storage make render fast but the row is inserted first):
  const newCard = page.locator('[data-report-card]').first();   // adapt selector
  // 1) it flips to Ready WITHOUT a manual reload:
  await expect(newCard.getByText(/ready/i)).toBeVisible({ timeout: 15000 });   // NO page.reload() anywhere
  // 2) Download becomes enabled:
  await expect(newCard.getByRole('link', { name: /download/i })).toBeEnabled();
  // 3) polling STOPS after Ready (the failure mode that bit us): no new GET /reports for ~8s:
  const countAtReady = pollHits.length;
  await page.waitForTimeout(8000);
  expect(pollHits.length).toBe(countAtReady);   // ← polling ceased; NOT an endless 4s loop
});
```
- The THREE assertions are the point: (a) flips without reload, (b) download enables, (c) **polling STOPS** — assert no
  further GET /reports after Ready. The "polling never stops" endless-loop is the failure the earlier manual rounds
  hit; this test catches it. Do NOT call page.reload() anywhere in this test — the whole point is it updates on its own.
- If mock generation is so fast the "Generating" state never renders a frame (direct-to-Ready — which is CORRECT
  behavior), still assert the row reaches Ready without reload + polling stops. Optionally slow the mock/render slightly
  to observe the Generating frame, but the binding assertions are flip-without-reload + polling-stops.

### 4C — reports-tier-gate.spec.ts  [§6U.2 gate — Growth+]
- Agency org → Reports list accessible.
- Growth org → accessible.
- Starter org → the LOCKED teaser (upgrade prompt), NOT the list (Reports = Growth+, LLD 607/610). Assert the upgrade
  CTA visible + the report cards NOT rendered.

### 4D — report-detail.spec.ts  [§6U.3]
- click a Ready report card → detail page renders narrative_text + section summaries (prose, NOT raw JSON — the 10a
  regression) + the PDF download (pre-signed URL link present).
- a report whose row is still generating (pdf_url null) → "Your report is being generated…" state (the detail poll).

### 4E — template-editor.spec.ts  [§6U.4 — org-scoped, was orphaned; confirm reachable + works]
- navigate to `/organizations/{orgId}/report-templates` → section-toggle-list shows 12 section types; the 5 core are
  ON, 7 OFF; the seeded default template has the is_default badge.
- toggle a section off → saving updates the template (assert persistence via reload or a success state).
- tone-selector present (professional/plain_english/executive).
- a11y: sections reorder via KEYBOARD (not pointer-only) — assert keyboard reorder works (§6U.4 requires it).

### 4F — delivery-schedule-form.spec.ts  [§6U.5 — org-scoped, Agency+ gate + Zod parity]
- navigate to `/organizations/{orgId}/delivery-schedules` (Agency org) → schedule form renders.
- frequency=weekly → day_of_week field shows, day_of_month hidden; frequency=monthly → the reverse (the §0.5 mutual
  exclusivity, client-side matching the server Zod refine).
- submit weekly WITHOUT day_of_week → inline validation error matching the Zod message (client parity with server).
- Starter/Growth org → Agency+ gate blocks (schedules = Agency+).

## STEP 2 — Run + confirm the bug-9 E2E actually catches the regression
```bash
# with the dev server confirmed on DEV DB + mock:
npx playwright test <section4 dir> --project=chromium
```
Re-introduce bug 9 and confirm 4B fails, then revert:
- change `shouldPollReports` back to `reports.some(r => !r.pdfUrl)` only (drop awaitingReport) → 4B's flip-without-
  reload assertion should FAIL (badge stays Generating because the poll never started for the just-created row).
- (optional) make the poll never stop (condition always true) → 4B's "polling STOPS" assertion fails.
Report: the 16-ish Section 4 specs green in Chromium; the re-introduce made 4B fail as expected.

## STEP 3 — Report
- Section 4 spec count + all green (Chromium), matching S3's ~16.
- STEP 0 confirmation: dev server was on `visibleau` (dev), mock LLM, local storage — NOT prod.
- 4B bug-9 proof: flip-without-reload + polling-stops both asserted; re-introduce failed 4B.
- Any orphaned-nav finding: were the template-editor (4E) and delivery-schedule (4F) org-scoped pages actually
  REACHABLE via UI nav, or only by direct URL? (They were flagged as nav-orphaned earlier — E2E navigating by URL still
  works, but report whether a nav path exists. If not, that's a real finding, not a test failure.)
- Full unfiltered vitest suite still green (121/1849) — Playwright is separate; confirm both suites' status.

## Constraints
- **DEV DB ONLY** — E2E seeds/deletes; confirm `visibleau` not `visibleau_prod` before running (STEP 0). This is the
  footgun; do not skip.
- LLM_MODE=mock, STORAGE_DRIVER=local — deterministic, no real spend, no Supabase dependency for the browser run.
- Real browser flows — assert rendered UI (role/text), navigation, and the poll BEHAVIOR (not just presence).
- 4B must NOT call page.reload() — the auto-refresh is the thing under test.
- Selectors by role/name/text (prototype convention); add data-testid only where ambiguous, and note it.
- Do NOT mask a real orphaned-nav finding as a passing test — if a page is only reachable by direct URL, report it.

## NOTE
Section 4 is the real-browser layer — it catches the render-in-context / routing / orphaned-nav bugs the manual Sprint
4 pass found (orphaned screens, a nav fix that crashed a page, JSON-instead-of-prose) that unit/integration can't. The
keystone is 4B: bug 9 (auto-refresh) closed END-TO-END — badge flips Generating→Ready with NO reload AND polling STOPS.
Section 3's shouldPollReports proved the CONDITION; 4B proves the BEHAVIOR wired in a real browser, including the
"polling never stops" endless-loop failure the manual rounds hit. STEP 0 (dev-DB confirmation) is non-negotiable — E2E
seeds/deletes and must never touch prod. Report reachability of the org-scoped editor/schedule pages honestly (they were
nav-orphaned). Then Section 5 (QA) is the last.
