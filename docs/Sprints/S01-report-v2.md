# S01 — Report v2 and report tiers: what to do next, Beyond AI answers, Basic / Standard / Enhanced, findings for low audits, ABN suggestion, portal reports

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/sprints/reports/S01-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S00 pushed); say which hash. Read LLD sections 3, 4 (N14, N15), 7.5, 7.6, 7A (0154), 8.1 (including 8.1.7 report tiers), 8.8.4–8.8.6, 11, 12, 20 (D1, D-RT1–D-RT4), appendices D and E, and `docs/lld/as-is-verification.md` (question 12 is about reports); contract screens P07, P08, P09, P13, P17, P18, P01 (ABN banner).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; claim only what the product does; no `any`; FORCE RLS on new org tables; no new `serviceDb` in request paths; no production writes (migration 0154 as a run1–run4 set).
- Non-regression N1–N15; N14 and N15 especially: for a Local-only brand, existing PDF pages keep their text and figures, and a **Basic** report is today's report with only the corrections LLD N15 allows (render tests on the Hero #54 and Omega #55 fixtures).
- Everything new behind `report_v2` / `abn_suggestion` (off by default). With the flag off, the PDF and audit page are exactly as today.
- Report tiers (LLD 8.1.7): **D-RT1 and D-RT2 are agreed** (Starter Basic; Growth Basic and Standard; Agency, Agency Pro, Enterprise all three, chosen per report). Defaults: D-RT3 (Agency and up rename tiers; cover name Agency and up only), D-RT4 (Enhanced refresh windows: identity 30 days, crawler access 7, YouTube 7, technical 30; 5-minute cap). D1 updated: "What to do next" is in Standard and Enhanced PDFs; every plan that can generate them gets all measured actions; curation is Agency and up. The audit page's Recommended actions and the Action Center stay on every plan. If Sri changed any of these, follow his choice.
- A Basic or Standard PDF never mentions another tier, a price or a plan. Upgrade prompts live in the app only.
- This sprint is long. If your context is getting full after Part 7, stop after committing it and report; Sri will start a new session with this prompt from Part 8.
- If the LLD contradicts the code, the code wins: report with file:line and continue only with independent parts.

## 1. Verify the Beyond-AI sources are real (no code changes unless a stub is found)
For identity (ABN, .au, Wikipedia), YouTube, robots/AI crawler access, crawler visits, the technical score and the brand's directory links (for the PDF's "Your directory profiles" tile): confirm each produces real measurements in production paths (re-check S00's report), what "not checked" looks like in data, and the latest-result query for each. Confirm the ABR JSON Name Lookup method (`MatchingNames.aspx`) with the existing GUID and record the ABR terms of use for automated lookups in a code comment with the link. Anything still stubbed is listed and shown as "Not measured yet" (never described as checked).

## 2. Data (migration 0154)
`report_brand_preferences` (with `default_tier`, without `include_beyond_ai`), `report_action_choices`, `agency_actions`, `generated_reports.contents_snapshot` and `report_tier` (default `basic`), `report_tier_names` on the report-branding row S00 found (validation check per LLD 7.5), the schedule's `report_tier` if S00 found scheduled reports, and `brands.abn_suggestion`, exactly as LLD 7.5/7.7 (FORCE RLS, policies, grants, indexes). Write the run1–run4 set; run3 proves every existing `generated_reports` row is `basic`. Add the new tables to the RLS guard list and to the brand-deletion cascade and retention tests.

## 3. Findings f–i and their actions (LLD 8.1.5, T5)
- `report-findings.ts`: add rules f (others named instead, from cited business domains via `directory_registry`), g (couldn't find the business; appendix C1 phrase list; quote the sentence ≤ 200 chars with engine and question), h (directories over the registry), i (identity not verified). Remove the "No finding rule matched this audit" output: a low audit always yields f or g when the data supports it; otherwise the page says what was checked.
- The same rules create Action Center items (dimensions frequency/source only, never context/sentiment) so the audit page's Recommended actions isn't empty for low audits.
- Tests: TechCore IT #52 fixture → f, g, h, i with the exact evidence; Hero #54 and Omega #55 → existing findings unchanged plus any new rule only if its condition holds; rule g never fires on answers to everyday questions.

## 4. General advice backed by evidence (LLD 8.8.5, T7)
`evidence_kind` on general-advice items: research (verified citation), audit (platform cited ≥ 3 times in this audit), or none → not shown. Tests: Medium hidden unless medium.com cited; LinkedIn shown on TechCore #52 with "LinkedIn was cited in N of 40 answers".

## 5. "What to do next" and the report contents panel (LLD 8.1.3, P08)
- Data builder in `lib/reports/report-data.ts`: measured actions for the basis audit (existing priority), agency actions, done since the last generated report, general advice when enabled. Reads the same functions as the audit page (no second calculation).
- Panel UI (P08) on the brand's Reports page: toggles, reorder (drag + ↑/↓ buttons), notes, agency actions, the two section toggles (no Beyond AI answers toggle: the tier decides, C-23), live outline; saves preferences; "Generate report" passes `{basisAuditId, contents}` to the existing render job. Growth sees it read-only with the Agency lock. The tier picker is added in Part 8.
- API: `GET/PUT /api/brands/:id/report-preferences`, `POST/PATCH/DELETE /api/brands/:id/agency-actions` (editor role, brand access, zod validation, length limits, 402 for plan, RLS context).
- Tests: route tests (auth, 402, validation, XSS payload stored as text), component tests, e2e on the panel.

## 6. "Beyond AI answers" (LLD 8.1.4, P07, P09)
- One server function `getBeyondAiAnswers(brandId, asOf)` returning the four tiles with status, check date and details (plus the directory profiles block the Enhanced PDF adds), used by the audit page card, the PDF page and the portal.
- Stale rule (> 30 days) and "Not checked" states with the action link; footer sentence; never in the headline.
- Tests: each tile in measured / not checked / stale / failed states; asOf respects report generation time.

## 7. PDF changes and snapshot (LLD 8.1.2, appendix D, P09)
- `report-document.tsx`, by page set (Part 8 wires the tier; until then render the Enhanced set behind the flag): "Diagnosis" → "Why, and what to do next" (findings, then groups); new "Beyond AI answers" page after it with five tiles (the fifth, "Your directory profiles", from the basis audit's directory citations and the brand's directory links, P09); trend page loses the prioritised list; method page gains the question mix line and "Checks outside AI answers" row. The Basic set keeps today's Diagnosis page (findings a–i, titled "Why your score is what it is"), today's Over time page and general advice (evidence-backed). Keep fonts, branding and the contrast rule (≥ 4.5:1; agency violet #5B21B6 on #EDE9FE).
- `render-report-pdf` writes `contents_snapshot`; "Try again" re-renders from the snapshot. Old reports without a snapshot render as before.
- Tests: render tests for Hero #54 (only additions), TechCore #52 (findings f–i, non-empty actions), snapshot immutability after editing an action, old report re-render unchanged.

## 8. Report tiers: plans, page sets, picker, server enforcement (LLD 8.1.7, P08, P09)
- `tiers.ts`: `maxReportTier` per plan (D-RT1) and `reportTierNames` (Agency and up). One helper `reportTierAllowed(plan, tier)` used by every server path.
- Generate route accepts `tier`; refuses a tier above the plan with 402 `report_tier_not_in_plan`; derives the page set from the tier on the server (`pagesForTier(tier)`), dropping any contents the tier excludes. Snapshot stores `tier`, `tierName`, the page set (appendix D). Re-render uses the snapshot's tier. Scheduled reports (if S00 found them) store a tier and are capped at the plan's tier when they run, with an operator log line.
- P08 tier picker (Segmented `cards`) with descriptions from the contract, locks with plan name and Upgrade link, default from `report_brand_preferences.default_tier` else the plan's highest tier, Basic note, outline per tier, button "Generate {tierName} report", 402 fallback state.
- Pricing page "Reports" row through `tiers.ts`, setting-aware (only while `report_v2` is on), with the appendix E footnote. No tier prices.
- Tests: route tests per plan (Starter 402 for Standard/Enhanced, Growth 402 for Enhanced, Agency all three); `pagesForTier` unit tests; Basic render test against today's page text for Hero #54 and Omega #55 (N15); snapshot carries tier; old reports re-render unchanged; component tests for the picker (locks, default, keyboard radiogroup); plan-claim guard for the pricing row; a test that Basic and Standard PDF text never contains another tier's name, "upgrade" or a plan name.

## 9. Enhanced checks before rendering (LLD 8.1.7 D-RT4, P08 checks list, P17 statuses)
- A refresh step in the render job for Enhanced only: per check, compare the latest result's date with its window (identity 30 days, AI crawler access 7, YouTube 7 when a channel is linked, technical 30); re-run stale ones through their existing functions; directory profiles come from the basis audit; crawler visits are never fetched. Inngest concurrency key `brand_id`; whole step capped at 5 minutes; a failed or timed-out check prints "Couldn't check on {date}: {reason}" and the report still renders. Record refresh calls in the existing cost log (operator-only).
- P08 checks list (age, reuse or run again) reads the same window logic; P17 shows "Running checks…" then "Generating…".
- Tests with a fixed clock: only stale checks re-run; timeout path renders with the failure line; concurrency (two Enhanced requests for one brand run one refresh); no refresh for Basic or Standard; costs never reach customer responses (cost-visibility guard).

## 10. Reports list, report names, cover name (P17, P18, P09 cover)
- P17: Report column (neutral pill with the tier name; old rows Basic), statuses Ready / Running checks… / Generating… / Failed + Try again, Generate opens P08. Keep the existing page's other columns.
- P18: "Report names" card on the existing report branding page: three inputs, live cover preview, Save / Reset, "What each report contains" table; zod validation (1–24 chars after trim, no control characters, unique ignoring case); 402 below Agency; plan-locked view below Agency.
- Cover: tier name line above the existing title for Agency and up only (P09.cover); names come from the snapshot so later renames never change old PDFs.
- Tests: route tests (402, 422, XSS payload stored and rendered as text), component tests, render test for the cover line (Agency shows it, Growth doesn't), snapshot name immutability.

## 11. ABN suggestion (LLD 8.8.6, P01)
`searchAbnByName(name, postcode?)` using `MatchingNames`, filter by postcode/state in code, confirm with `AbnDetails` (Active). Shown on brand creation and in brand settings when `abn` is empty and a confident match exists; Confirm writes `abn` and queues the entity check; Not mine stores the dismissal. Australian market only. Tests use recorded ABR responses (no live calls in tests). Flag `abn_suggestion`.

## 12. Client portal reports (LLD 8.1.6, P13)
List generated reports with stored PDFs for the portal's brands, with the Report column (tier name from the snapshot); downloads via short-lived signed URLs (existing storage pattern). Tests: portal sees only its brands' reports; cross-org e2e (05) extended.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 1: the status of every Beyond-AI source and the ABR terms note.
- Rendered PDF page images for Hero #54 and TechCore #52 in **all three tiers** (paths) for Sri to compare with P09, plus the N15 diff result for Basic.
- The pricing page "Reports" row as rendered (screenshot path) with the flag on and off.
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S01/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0154 first; Inngest resync (yes: render job and the Enhanced refresh step changed); safe while an audit runs; flags `report_v2`, `abn_suggestion` off (with `report_v2` off every report is today's report).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
