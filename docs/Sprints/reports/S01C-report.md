# S01C report: fixes from the real reports

Sprint S01C of the Vunnara client enhancements · 25–26 Nov 2026 · built on `origin/main` = `69eb1fcd` (S01B, pushed; checked with `git fetch origin`) plus the v1.14 docs commit `b3622f1d` · nothing pushed.

## Read first

1. **Parts 1–6 are done and committed.** No migration. No Inngest resync needed. Flags unchanged.
2. **One stop point was hit and reported (Part 3d).**
   - Waratah, the new seed shaped like the real audit #54, has an Enhanced report of 8 pages. It was 9, with page 8 holding only the chart, as the real one did.
   - Three Standard reports still have an Over time page standing alone (33–49% full). Method and notes, kept whole by amendment 52, doesn't fit after it, and the page before is full.
   - The options are in Part 3d.
3. **The PDFs for review:** `.qa/screens/S01C/pdf-final/` holds 16 PDFs (four seeds × report_v2 off, Basic, Standard, Enhanced), every page as a PNG, `page-counts.json` and the page maps. There's one contact sheet per tier: `.qa/screens/S01C/pdf-final-{today,basic,standard,enhanced}-sheet.png`.
4. **Playwright: 18 of the 27 mapped specs ran and passed, 118 tests.**
   - Every spec on a screen this sprint changed is among them: P08's panel, P07's Beyond card, the portal (two specs), the reports page, the Data Residency page, the running audit, ABN and brand settings, and the audit results.
   - The run was stopped by Claude Code for low memory while it was on the 19th spec (`section5`, on its last test). The other 9 specs and shards didn't run: "not run: memory", listed under Playwright.
   - `section5`'s cleanup may not have run, so its two spec accounts may still be in `visibleau_e2e`.
5. **Two production-only behaviours to know:**
   - **Report downloads (Part 5a):** Supabase Storage writes the download header in production. Its ASCII fallback uses "_" for "–", and browsers show the real name.
   - **Old reports:** reports generated before the push keep their old words on "Try again", because snapshots never change.
6. **`.qa/scripts/` was not tidied.** None of its five files converts a PDF, so I couldn't tell which two the update step meant. They're listed under the update step.


## Update step and pre-flight

- **Update step (v1.14):**
  - pack found (`README.md`: "v1.14");
  - `git fetch origin`: `origin/main` = local `main` = `69eb1fcd`; the tree was clean apart from Sri's three untracked items;
  - **`.qa/scripts/` left as it is.** None of its five files converts a PDF, so I couldn't tell which two the step meant. Its files (25 Nov 2026, Sydney time):
    - `abr-retention-count.mts` 14:22 (S01B part 5's push-note count);
    - `drop-integration-db.mts` 14:15 (S01B part 6h);
    - `report-html.mts` 15:02 and `report-page.mts` 15:04: these two turn `docs/Sprints/reports/S01B-report.md` into a "shareable" HTML page. They're probably the two meant;
    - `responsive-leftovers.mts` 13:43.
  - copied the LLD (v1.10), the runbook (v1.9), the contract (v1.6) and its HTML, the guide (unchanged), the seven P07/P08/P09 images and `sprints/*.md` (`S01C-real-report-fixes.md` new);
  - contract typecheck: exit 0;
  - committed `b3622f1d` (the step's only commit).
- **Gate:** the kickoff line is Sri's confirmation: S01B pushed, `report_v2` on for Splice only, the real reports reviewed with Claude (chat), amendments 58–66 and contract v1.6.
- **Migration:** none (latest 0154; S02 owns 0155). **Flags:** none added.
- **Read:** the runbook; as-is verification (amendments and the reports section); the token map's summary; the S01B report in full; LLD section 0 (amendments 43–66), 4, 8.1.2–8.1.8, 12, 15 and 17; the contract v1.6 diff (P07.beyond, P08.outline, P09) and the P07 and P09 images; the whole sprint file.
- **Baseline on the untouched tree (`b3622f1d`):**
  - typecheck clean (temporary tsconfig excluding `.next`, `next-env.d.ts` and `.qa`);
  - the 91 source-scan guard files: 1,611 of 1,612 passed. The one failure was `tests/unit/brands/avatar-color.test.tsx` "a brand row's colour doesn't depend on where it sits", a 5 s timeout on its cold import under the run's load; alone it passes 8 of 8. It timed out the same way in every guard run this sprint and passed alone each time;
  - `report-pdf-seeds`: 69 of 69;
  - `tests/known-failures.txt`: 0 test entries.
- **Memory:** 6.59 GB free of 15.43 GB, 0 node processes.

## Part 1. Plain reasons for customers (amendment 58) — `6ebd0dbb`

**The one mapper:** `lib/audit/customer-reasons.ts`.
- `customerEngineReason` maps every operator reason key (`lib/audit/engine-failure.ts:49-66`) to "a problem on our side". Every engine runs on our own accounts, so every cause is on our side.
- It's a `Record` over the keys, so a new reason can't reach a customer without plain words being chosen for it.
- Google's existing "…because of a problem on our side…" sentence (`lib/audit/google-surfaces/reasons.ts`, the operator page's rule) is now built from the same words. Its text is unchanged.
- No engine reason describes the customer's own setup. The reasons that do (an unconfirmed business type, the workspace's daily audit limit) stop a whole audit and keep their words.

**Where an engine's reason reached a customer** (at `b3622f1d`), and what each now shows:

| Surface | file:line | Showed | Now |
|---|---|---|---|
| PDF, over-time note (every tier, `report_v2` off) | `lib/reports/report-format.ts:135-139`, data `lib/reports/report-data.ts:928-931` | "Audit #47 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared." | "…(Claude didn't answer: a problem on our side)…" |
| PDF summary page | `lib/reports/pdf/report-document.tsx:924`, `:1052` | "Claude returned an error for all 13 questions (provider spend limit reached)" | "(a problem on our side)" |
| PDF engines page | `report-document.tsx:1247` | the full label "Provider spend limit reached (a monthly limit set in the provider's console)" | "Didn't answer: a problem on our side" |
| PDF cover coverage line | `report-format.ts:76-81` | "3 of 4 engines · Claude: Provider spend limit reached (…)" | "3 of 4 engines · Claude didn't answer: a problem on our side" |
| PDF finding c (and the audit page's) | `lib/reports/report-findings.ts:280-308` | "failed for a provider reason"; evidence "· provider spend limit reached ·" | "failed because of a problem on our side"; "· a problem on our side ·" |
| Coverage note: client portal, audit PDF export, narrative data, audit-complete email | `lib/audit/engine-coverage.ts:46-54`; portal `app/client-portal/[inviteToken]/page.tsx:373-380`; export `app/api/audits/[auditId]/export/route.ts:241-243` | "Based on 3 of 4 engines. Claude returned an error for every question: Provider spend limit reached (…)." | "…: a problem on our side." |
| Audit-complete email | `inngest/functions/send-audit-complete-email.ts:66`, `lib/email/templates/audit-complete.ts:67` | "What to check: Raise the monthly spend limit in the provider's console…" | that paragraph is gone |
| Audit page banner | `components/domain/audit/engine-failure-banner.tsx:69-83` | the label, and "What to check" with the operator's steps | "Why: a problem on our side. Drift alerts and the weekly trend leave this audit out." |
| Running audit (poll data and page) | `app/api/audits/[auditId]/route.ts:90` → `components/domain/audit/audit-running.tsx:1123-1129` | "Provider error: account/credit issue" | "A problem on our side" |
| Whole-engine failure email, org copy (owners and admins) | `lib/email/templates/alerts/engine-total-failure.ts:34-41`, `lib/audit/engine-total-failure-alert.ts:102-122` | the label and the operator's steps | "A problem on our side", no steps |
| A failed audit's stored error (audit page, JSON export, `/api/audits/:id`, `/full`) | `lib/costs/customer-safe.ts:44-51` | the question generator's failure ends with the model call's message, e.g. "(HTTP 400 … specified API usage limits …)" | "Could not refresh this brand's questions before running the audit (a problem on our side)." |

**Checked, nothing to change:**
- the dashboard's provider line: "Claude unavailable since 22:30 — audits use 3 engines", no reason (`lib/platform/provider-status.ts:252-274`);
- the trend cells and the brand page's history legend: counts only;
- the `audit.completed` webhook: counts and engine ids only (`inngest/functions/fanout-webhooks.ts:110-114`);
- the narrative summary: "couldn't be measured this time" (`lib/reports/report-narrative.ts:196`, `:227`);
- the scheduled-report and weekly-digest emails.

**Operator detail kept:**
- The operator copy of the whole-engine failure email still has the label, error class, HTTP status and the steps.
- No operator page shows a single audit's engine failures. The audit page banner, which every viewer sees, is now plain for platform admins too; the operator email carries the detail.

**Left as is, for Sri:**
- The report-PDF-failed alert's org copy (a render failure, not an engine).
- Google's customer reason for the daily cap: "Today's spending limit was reached, so Google was skipped…" (`lib/audit/google-surfaces/reasons.ts:62`).
- Whole-audit errors other than the question generator's still pass through as stored, e.g. "Budget exceeded" or an unexpected exception's message.
- Reports generated before the push keep their snapshot's words on "Try again". Generated reports never change, and every new report uses the plain reason.

**Tests:**
- `tests/integration/customer-engine-reasons.integration.test.tsx` and `tests/unit/audit/customer-reasons.test.ts`. The seeds: Bluegum with an earlier #47 in which Claude refused every call on the spend-limit message, and Ironstone, whose basis audit Claude failed. Checked:
  - the PDF in every tier and with `report_v2` off;
  - the audit page and its running-audit data;
  - the portal;
  - the audit-complete email and both copies of the whole-engine failure email;
  - the JSON export.
- The banned list is the prompt's ("spend limit", "quota", "credit", "billing", "rate limit", "API key"), plus "API usage limits" and HTTP status codes as a failure carries them ("HTTP 400", "400 invalid_request_error"). A bare number isn't counted: the PDF keeps "the first 500 characters" of an answer, and an email's CSS has "font-weight:400".
- RED on the parent: 14 failed, 23 held. GREEN: 37 of 37.
- **Existing tests changed** (amendment 58 quoted in each): 24 tests in 11 files.
  - `engine-coverage` unit, and `report-pdf-design` with its hand-composed fixture: report data now holds the plain reason;
  - `engine-coverage-client-surfaces`, `audit-running-page-honest-numbers`, `engine-total-failure`, `engine-total-failure-recipients` (the operator copy is now checked for the detail), `out-of-quota-not-retried`, `rate-limit-label`, `report-followups-2nov`, `report-pdf-content`;
  - the `google-surfaces-off-parity` golden, regenerated on purpose. Its only differences are the reason text and the dropped "What to check".
- **Runs:**
  - related (14 sources): 257 files, 2,604 passed, 24 failed (all the expectations above);
  - then the 13 files: 117 of 117;
  - guards and the unit tests naming the paths: 1,893 of 1,894 (`avatar-color`, as in the baseline);
  - integration tests naming the paths: 335 of 335;
  - tsc clean; Biome: 0 new.
- **Playwright:** the mapper lists none. The audit page's `running-to-finished.spec.ts` checks the banner is there; it ran in the end-of-sprint batch.

## Part 2. Findings and actions say only what we measured (amendments 59–61) — `5ea93c3e`

**a. Directories** (amendment 59; every report, `report_v2` off included):
- **Rule i** (`lib/reports/low-visibility-findings.ts`):
  - title: "AI also cites directories where we can't see your listings yet";
  - action: "Add your {A}, {B} and {C} profile links in brand settings, or create the profiles if you don't have them";
  - Recommended next: "Link or create your {A}, {B} and {C} profiles", with "{A} and {B} were each cited in 5 of 40 answers and {C} in 4; none of them is linked yet."
- **Today's directory finding** (`lib/reports/report-findings.ts`, rule a):
  - the same action (shared: `linkOrCreateProfilesAction`, `lib/directories/cited-in-answers.ts`);
  - its scope: "They cited 9 of the usual directories for your type of business 58 times. Localsearch is linked: 2 of its 8 citations were your own profile. 8 of them aren't linked yet, so we can't tell for those."
  - numerals throughout.
- The summary's own sentence is unchanged. It counts every cited directory (13, 73 times) in numerals already.
- **One style for Recommended next bodies** (`wasCitedInAnswers`): "Yellow Pages was cited in 17, hipages in 7 and Airtasker in 5 of 40 answers". Directories cited equally often are named together.

**b. An engine that never mentions the business** (amendment 60):
- The directory counts gain a per-engine split. `lib/directories/citation-counts.ts` adds `citedByEngine` (optional; it sums to `citedCount`), carried into the report's directory rows (optional too, so older snapshots render).
- Evidence adds "Gemini cited most → hipages (7), Airtasker (5), Word of Mouth (5)".
- One action, as the finding's action line and as Recommended next's title: "Make sure your profiles on hipages, Airtasker and Word of Mouth, the directories Gemini cites most, are complete and linked in brand settings". The body sentence is kept.
- If the engine cited no directory, the finding is marked `noAction`. It then has:
  - no action line;
  - no Recommended next item, no item in the audit page's actions or in What to do next;
  - no g–j Action Center item.
- "Review your Google Business Profile" is gone. Recommended next keeps each item's own finding number. A filtered list would have shifted the numbers, and the design test caught it.
- I used a `noAction` flag rather than a nullable `recommendation`, because nullable broke the types of 8 existing test files.

**c. Other actions** (amendment 61):
- **The Wikipedia check's item** (`lib/recommendations/entity-profiles.ts`; triggered at `lib/recommendations/triggers.ts:434-482`): "Get covered in local press or on community sites", with the amendment's text (no dashes). The couldn't-check path keeps its "Check:" prefix, with "We couldn't check Wikipedia this audit. …".
- Its audit-page line no longer says what AI can read: "No Wikipedia article for your business (Wikipedia searched {date}), so local press and community sites are the next step".
- The PDF now prints the Action Center's own words for it (`what-to-do-next.ts` uses `displayRecommendationAction`).
  - Stored entity-profiles items were already shown with the current text (`lib/recommendations/confidence-labels.ts:129-151`).
  - So existing items read the new words in the app and in new PDFs. No stored row is rewritten.
- **Rule j's title by cause:**
  - no ABN: "Add your ABN" (plus " and link your Google Business Profile" when that's missing too);
  - ABN verified, no profile: "Link your Google Business Profile";
  - otherwise: "Verify your ABN".
- **"Notes and actions from {agency} are labelled."** prints only with an agency action, or a note on an included item.

**Tests:**
- `tests/integration/measured-wording.integration.test.tsx`, on three seeds in every tier and `report_v2` off:
  - Bluegum with Gemini's answers citing directories;
  - Bluegum as seeded, where Gemini cited none;
  - Kurrajong with no ABN.
- It checks that the prompt's phrases never print, the engine action is identical in both places, the Action Center's g–j items say what the PDF says, and the audit page lists what Basic's Recommended next lists.
- RED on the parent: 24 failed, 2 held. GREEN: 26 of 26.
- **Existing tests changed** (amendments 59–61 quoted): 33 tests in 13 files.
  - directory copy: `audit42-copy`, `linked-state-copy`, `recommendation-reasons`, `report-pdf-seeds` (rule i's body);
  - rule b's left-out item: `recommendation-always-has-reason`, `report-pdf-design`, `audit-actions-evidence`;
  - the Wikipedia item: `action-center-display-labels` (unit and integration), `evidence-driven-rules`, and `entity-profiles-advice`, rewritten because its step list is gone;
  - rule i and rule j titles: `low-visibility-findings`, `what-to-do-next`;
  - the golden, regenerated: "is cited" became "was cited", and the per-engine counts are added.
- **Runs:**
  - related (13 sources): 189 files, 2,265 passed, 33 failed (the expectations above);
  - re-run: 268 of 268;
  - guards and unit tests naming the paths: 1,911 of 1,912 (`avatar-color`);
  - integration tests naming the paths: 445 of 445;
  - tsc clean; Biome: 0 new.

## Part 3. A seed shaped like the real report, and the PDF layout (amendments 61, 62, 64) — `0b9a1ecf`

**a. Waratah Home Services** (`tests/helpers/report-seeds.ts`), invented. General trades in Lidcombe NSW 2141, its own postcode.
- **Directories:** 13 cited 73 times.
  - The 9 usual ones for its type, 58 times. Localsearch is linked, with 2 own-profile citations.
  - 4 others: Local Business Guide 5, Whereis 5, Birdeye 4, StartLocal 1. Each prints its type on its own line.
  - Google Business Profile is one of the usual ones for general trades in the registry. The real brand listed it among the others, presumably because of a different business type.
- **Engines:** 4. Gemini is at 0 of 10, while its answers cite hipages, Airtasker and Word of Mouth.
- **Google:** 13 questions on both surfaces.
- **Other actions:** 2, rule j (no ABN, no profile) and the Wikipedia item.
  - The seeds always gave the recommendation step a `scoreFrequency` of null, which it reads as 100, so no seed ever had the Wikipedia item.
  - Waratah stores 15.00, as the runner would.
- **Trend:** 7 audits.
  - #46 asked the earlier questions (one replaced at #47);
  - #47: Claude refused every call (the spend limit);
  - #49 excluded from trends;
  - the chart plots 6.
- **Checks:** no ABN (checked, as the technical audit stores a check with none), no YouTube; crawlers and technical checked. Technical is 40 of 74, structured data weakest at 4 of 16.
- Built through the same real path. It's in `REPORT_SEEDS`, so `report-pdf-seeds` (N14, N15, cross-page consistency) covers it: 85 of 85.

**b. Other actions:** the sentence in Inter, only the " · audit #{n}" tag in mono. Ordered High, Medium, Low, then newest first: items gain an optional `createdAt`, the item's own.

**c. Section order** in Standard and Enhanced: Why, and what to do next; Over time; Beyond AI answers (Enhanced); Method and notes.
- Changed in the PDF's numbering, its flowing pages, `pagesForTier` and P08's outline.
- Over time is 06 in both tiers for Waratah (with its Google section). Beyond is 07 in Enhanced.
- Beyond's rows were already unbreakable, with the heading held with the first row. A test checks this on all four seeds.

**d. Page fill.** Measured from the rendered PDFs with `scripts/qa/pdf-page-map.ts` (new):
- poppler's `pdftotext -bbox` gives each page's lowest body-text line, as a share of the content area (42 to 788 pt);
- the sections on each page come from their eyebrows;
- before/after maps are in `.qa/screens/S01C/page-maps-{before,after}.{json,txt}`.

Page counts per seed and tier (physical pages; `.qa/screens/S01C/pdf-final/page-counts.json`):

| Seed | report_v2 off | Basic | Standard | Enhanced |
|---|---|---|---|---|
| Bluegum Home Services | 7 | 7 | 7 | 7 |
| Ironstone Property Services | 7 | 7 | 7 | 7 |
| Kurrajong IT Solutions | 7 | 7 | 7 | 7 |
| Waratah Home Services (new, like the real #54) | 8 | 8 | 8 | **8 (was 9)** |

**Targets met:** Waratah's Enhanced is 8 pages, and Standard and Basic are 8. The "before" Waratah Enhanced reproduced the real report's problem: 9 pages, page 8 holding only Over time (36% full).

**Page maps, Standard and Enhanced, from page 4.** Pages 1–3 (cover, summary, engines) are unchanged and 64–85% full. "+" marks a section continued from the page before.

| Report | Before Part 3 | After (final) |
|---|---|---|
| Bluegum Standard | 4: Where AI looks 61% · 5: Why 92% · 6: Over time 49% · 7: Method 69% | the same |
| Bluegum Enhanced | … 6: Beyond; Over time 96% · 7: Method 74% | … 6: Over time; Beyond 95% · 7: Method 74% |
| Ironstone Standard | … 5: Why 92% · 6: Over time 35% · 7: Method 72% | the same |
| Ironstone Enhanced | … 6: Beyond; Over time 85% · 7: Method 77% | … 6: Over time; Beyond 84% · 7: Method 77% |
| Kurrajong Standard | … 5: Why 83% · 6: Over time 33% · 7: Method 69% | the same |
| Kurrajong Enhanced | … 6: Beyond; Over time 79% · 7: Method 74% | … 6: Over time; Beyond 78% · 7: Method 74% |
| Waratah Standard | 4: Google; Where AI looks 96% · 5: Where AI looks+ 59% · 6: Why 93% · 7: Over time 58% · 8: Method 71% | 4: 96% · 5: 61% · 6: 93% · 7: Over time 58% · 8: Method 71% |
| Waratah Enhanced | … 6: Why 93% · 7: Beyond 70% · 8: Over time 36% · 9: Method 76% | … 6: Why 93% · 7: Over time; Beyond 90% · 8: (Beyond's directory tile); Method 94% |

The full maps, every version included, are in `.qa/screens/S01C/page-maps-after.txt` and `page-maps-before.txt`.

**3d stop point: the page-fill goal isn't met for three Standard reports.**
- Bluegum, Ironstone and Kurrajong's Standard Over time pages stand alone at 49%, 35% and 33%. This is S01B's leftover.
- **Why it can't be fixed within the rules:** Method and notes is kept whole (amendment 52) and needs about 70% of a page. Over time plus Method is 102–118% of a page. The page before is 83–92% full, so Over time can't start there either (a section starts only when a third of the page is left).
- Waratah Standard's page 7 is 58%. Enhanced has no near-empty page.
- **Options for Sri:**
  1. Accept it. The reports are 7 pages, and the half-empty page is the over-time chart.
  2. Let Method split, at its two columns or after "What was asked". This changes amendment 52.
  3. Tighten Method's spacing (its two columns and the glossary) so it fits after a short Over time. Ironstone and Kurrajong Standard would become 6 pages. Basic's Method page is the same content, so its spacing would change too, though N15's text wouldn't.
  4. Put Method before Over time in Standard only. That contradicts amendment 62's order.

**e. Every report, `report_v2` off included** (amendment 64):
- **Google section place line:** "Lidcombe NSW 2141 · desktop · 21 Nov 2026" when Google was asked at the brand's own postcode (`googlePlaceLine`, `lib/reports/report-format.ts`). Unchanged for an operator's postcode, a suburb or city location, no postcode, or an older snapshot. The Google block and the report's brand gain optional `location`, `suburb` and `postcode`.
- **Section 04's table:**
  - The header row is a `fixed` child of the table's own View. react-pdf copies a fixed child into both halves of a split View (`@react-pdf/layout` `splitNodes`), so the header repeats on a continued page and nowhere else. Checked in the rendered PDF: Waratah's page 5 starts with the header.
  - The name column is 105 pt. The widest registry name, "Google Business Profile", is 99 pt in Inter 600 at the table's size; a test measures every name with the PDF's own font.
  - A type suffix ("general directory", "maps", "review site") is its own muted line.
- **Over-time chart:** each point says why it isn't compared: "○ 3 of 4 engines", "○ questions changed", "○ earlier detection", "○ other models", "○ another model answered". A compared point says "4 of 4 engines".

**Tests:**
- `tests/integration/report-layout-s01c.integration.test.tsx`: the four seeds, every tier and `report_v2` off.
  - section order and numbering;
  - Beyond's rows on one page with the heading (page markers);
  - OTHER ACTIONS' fonts (each run's font, walked through the document) and order;
  - page counts;
  - the place line, and its rule's cases;
  - the table continuing with its header;
  - type suffixes on their own line;
  - the chart's labels;
  - every registry name fitting the column.
- RED on the parent: 18 failed, 8 held. GREEN: 26 of 26.
- **Existing tests changed:** `report-tiers` and `report-snapshot` (the section order, amendment 62); `directory-kind` (the suffix on its own line, amendment 64); the golden (only `brand.suburb` added).
- **Runs:**
  - related (8 sources): 188 files, 2,153 passed, 5 failed (the expectations above; `brand-feature-locks` timed out under load and passes alone);
  - re-run: 90 of 90;
  - guards and unit tests naming the paths: 1,837 of 1,838 (`avatar-color`);
  - integration tests naming the paths: 370 of 370;
  - tsc clean; Biome: 0 new.

## Part 4. "Beyond AI answers" copy (amendment 63) — `484092f0`

**What the technical score counts:** points. Under v4 scoring the maximum, 74, is the sum of the six scored areas' maxima: robots.txt 18, schema 16, meta tags 14, content 12, brand and entity 8, signals 6 (`lib/technical-audit/scoring-version.ts:44-48`, summed at `:86`). llms.txt and AI Discovery are checked but score 0 since v4.

**Changes** (in `lib/reports/beyond-ai.ts`, so the PDF and the audit page card stay identical):
- PDF heading: "What else we checked about your business". The audit page card keeps "Beyond AI answers".
- AI crawlers: "4 of 4 AI search crawlers allowed · checked 21 Nov 2026".
- Website technical:
  - "40 of 74 points";
  - "checked 21 Nov 2026";
  - "Weakest: structured data, 4 of 16 points", in plain words: AI crawler access, structured data, page titles and descriptions, page content, business details, trust signals.
  - The scoring version moves to Method's line: "technical 21 Nov 2026, v4 scoring".
- Your directory profiles:
  - "Linked 1 of 13 directories AI cites for your questions.";
  - the top 6 as "Yellow Pages · cited in 17 of 40 answers · not linked yet" / "· linked";
  - then "+ 7 more in section 04".
- **"+ k more" on the audit page and the portal: no place for it.** The audit page card has four tiles and no directory tile (LLD 8.1.4: "Your directory profiles (PDF only)"), and the client portal shows no Beyond card at all.

**Tests:**
- `tests/integration/beyond-copy-s01c.integration.test.tsx` (Waratah's and Bluegum's Enhanced reports).
- `tests/unit/components/beyond-ai-card-copy.test.tsx`: the P07 card's technical tile measured, with no area scores, never run and unscored; its crawler tile measured and with one blocked.
- RED on the parent: 9 failed, 3 held. GREEN: 12 of 12.
- **Existing tests changed** (amendment 63 quoted):
  - `beyond-ai` unit (crawlers, technical, directory lines, plus a test for "+ k more");
  - `beyond-ai-card` (the technical tile's label);
  - `audit-page-beyond-ai` ("of 74 points");
  - `report-pdf-seeds` (the version is on Method's line);
  - the e2e spec `13-s01-beyond-ai` ("3 of 4 AI search crawlers allowed · checked", "38 of 74 points").
- **Runs:**
  - related: 73 files, 908 passed, 2 failed (the expectations above);
  - re-run: 132 of 132;
  - guards and unit tests naming the paths: 1,709 of 1,710 (`avatar-color`);
  - integration tests naming the paths: 218 of 218;
  - tsc clean; Biome: 0 new.

## Part 5. File names and carried items (amendments 64, 65) — `90b5d57f`

**a. Report file names.** The name is "Waratah Home Services – AI Visibility Report (Enhanced) – Week 47 2026.pdf". A report made with `report_v2` off (no snapshot tier name) has no tier. A monthly report names its month (lib/communication/report-file-name.ts).

Where a report PDF leaves the app (at `484092f0`):

| Place | file:line | Was | Now |
|---|---|---|---|
| Reports page download (list and detail) | `app/api/brands/[brandId]/reports/route.ts:69-70`, `.../[reportId]/route.ts:59`, through `lib/communication/report-view.ts:47` | a signed link, saved as the storage id | the link carries the name |
| Local storage driver's file route (dev, tests) | `app/api/reports/file/[...path]/route.ts:49-54` | `inline; filename="<id>.pdf"` | `attachment; filename="<ASCII>"; filename*=UTF-8''<name>` |
| Client portal download | `lib/client-portal/portal-reports.ts:72` (page `app/client-portal/[inviteToken]/page.tsx:243`) | signed for 10 minutes | the same, with the name |
| Scheduled-report email (a link, not an attachment) | `inngest/functions/send-scheduled-reports.ts:103-106` | signed link | with the name |
| Supabase signed links (production) | `lib/storage/supabase-adapter.ts:28-32` | `createSignedUrl(path, expiry)` | `createSignedUrl(path, expiry, { download: name })` |

- **Production's header is written by Supabase Storage, not our code.** Its renderer's `handleDownload` (github.com/supabase/storage, `src/storage/renderer/renderer.ts`, read on master) sends `attachment; filename=<its ASCII fallback>; filename*=UTF-8''<the name>`.
- Its fallback replaces each non-ASCII character with "_", not a hyphen: "Waratah Home Services _ AI Visibility Report …". Every current browser reads `filename*`, so people see the real name.
- Our hyphenated fallback exists only on the local driver's route. Changing production's would need our own download route; for the portal that means signed links of our own, which is a new secret.
- The scheduled email links, it doesn't attach, so the name rides on the link.

**b. "Not mine" lasts:**
- When the weekly job clears an `abn_suggestion` answered "Not mine", it leaves the dateless `{"status":"dismissed"}` with no ABR data (`lib/retention/audit-retention.ts`, `ABN_SUGGESTION_DISMISSED`).
- Brand settings' GET then offers nothing and searches nothing (`app/api/brands/[brandId]/abn-suggestion/route.ts`).
- Changing the brand's name clears the marker (`app/api/brands/[brandId]/route.ts`, PATCH).
- No column needed. A dismissed suggestion still inside its 12 months isn't cleared by a rename; the amendment names only the marker.

**c. The Data Residency page lists the ABR:**
- A paragraph with `ABR_LOOKUP`, after DataForSEO's.
- A residency row, `ABR_RESIDENCY_ENTRY` in `lib/governance/residency-config.ts`, under its own "Business identity" heading. It's worded from `AUDIT_DATA_RETENTION_MONTHS`, which `ABR_LOOKUP` uses too. `data-facts.ts` imports that file, so the row can't import `ABR_LOOKUP` back.
- The residency list now has 14 rows. `data_residency_log` has no CHECK on its type or provider, so no migration is needed.
- Biome also sorted the page's existing import block, which I was editing anyway.

**d. Action Center dates:** `lib/recommendations/triggers.ts` writes "(checked 20 Oct 2026)" and "You told us on 15 Oct 2026 …" with `formatCheckDate`, for new and refreshed items. Stored items keep their words.

**Tests:**
- `tests/integration/report-file-names.integration.test.ts` (6): list, detail, the file route's header, portal, the email's link, the Supabase signed link;
- `tests/unit/communication/report-file-name.test.ts` (7);
- `tests/integration/abr-retention.integration.test.ts`: 3 new tests (the marker, edits that keep it, a rename that clears it);
- `tests/unit/legal/abr-residency.test.tsx` (3);
- `tests/unit/recommendations/directory-item-dates.test.ts` (2);
- RED on the parent: 14 failed, 4 held (the existing retention tests). GREEN.
- **Existing tests changed** (amendment 65 quoted):
  - the residency row count, 13 → 14: `residency-config`, `s8-governance-db`, `public-copy-and-comparability`;
  - the 12-month rows: `retention-claims` and `pdf-retention-claim`. The ABR row's 12 months are enforced by the weekly job (amendment 54, S01B part 5).
- **Runs:**
  - related: 388 files, 4,274 passed, 7 failed (6 are the expectations above; `brand-feature-locks` timed out under load);
  - re-run: 123 of 123;
  - guards and unit tests naming the paths: 2,019 of 2,020 (`avatar-color`);
  - integration tests naming the paths: 708 of 708;
  - tsc clean; Biome: 0 new (the portal page's `noImgElement` warning is pre-existing).

## Part 6. PDFs for review

In `.qa/screens/S01C/`:
- `pdf-final/`: the four seeds in Basic, Standard, Enhanced and with `report_v2` off (16 PDFs), every page as a 1240 px PNG (116), and `page-counts.json`;
- the contact sheets `pdf-final-{today,basic,standard,enhanced}-sheet.png`, one row per seed;
- the page maps `page-maps-after.{json,txt}`;
- the "before" PDFs: `pdf-before/` (the same seeds rendered by Part 2's code) and `page-maps-before.{json,txt}`.
- What to look at:
  - Waratah's pages 4–5 (Google, then the directory table continuing with its header);
  - pages 6–7 (the findings; OTHER ACTIONS in Inter; Over time then Beyond with the new copy);
  - page 8 (the directory tile with "+ 7 more in section 04", then Method with "technical …, v4 scoring").

## Today's report (`report_v2` off): every change, and the amendment that allows it

N15 allows each of these (amendments 58–60 and 64). The Basic-vs-today N15 test passes on all four seeds.
- **Amendment 58:** the plain reason replaces the operator's: the summary sentence, the engines page ("Didn't answer: a problem on our side"), the cover's coverage line, finding c, and the over-time note.
- **Amendment 59:** today's directory finding: its scope and numerals ("They cited 9 of the usual directories for your type of business 58 times … 8 of them aren't linked yet"), the action ("Add your … profile links in brand settings, or create the profiles if you don't have them"), and Recommended next's one style ("was cited in 17, … in 5 of 40 answers").
- **Amendment 60:**
  - the engine finding gains "{Engine} cited most → …" and the action "Make sure your profiles on …, the directories {Engine} cites most, are complete and linked in brand settings", as its Recommended next title too;
  - with no directory cited, there's no action and no Recommended next item;
  - "Review your Google Business Profile" is gone.
- **Amendment 64:** the Google place line ("{suburb} {STATE} {postcode} · desktop · {date}"), the directory table's repeated header and the suffix's own line, and the over-time chart's "○ {reason}" labels.
- **No other wording changes.** Rules g–j, OTHER ACTIONS, the section order and the Beyond copy are Standard and Enhanced only (behind `report_v2`).

## Playwright

**Not run: memory** (listed here first, as the runbook asks). Claude Code stopped the run for low memory, and I didn't restart it. They must pass before the next flag switch:
- `tests/e2e/section5/section5-aa-e2e.spec.ts`: stopped on its last test (4 of 4); its `afterAll` may not have run;
- `tests/e2e/session/session-states.spec.ts`;
- `tests/e2e/sprint6/sprint6-retrieval.spec.ts`;
- `tests/qa/sprint6/features/f01-schema/f01-schema.spec.ts`;
- `tests/qa/sprint6/features/f03-anti-patterns/f03-anti-patterns.spec.ts`;
- `tests/e2e/sprint2/sprint2-workflow.spec.ts` (2 shards);
- `tests/e2e/sprint3/sprint3-visibility.spec.ts` (2 shards);
- `tests/e2e/sprint9/s9-autopilot-e2e.spec.ts` (2 shards);
- `tests/e2e/responsive/responsive-shell.spec.ts` (8 shards).

These map to the sprint's files by naming a changed route or importing a changed module, not by showing a changed screen.

**How it ran:**
- One batch at the end, on the final code (`90b5d57f`), rather than after each part. Each spec needs its own fresh server, and parts 1–5 change overlapping files.
- The specs came from `scripts/qa/e2e-specs-for.ts` over every file the sprint changed: 27 specs.
- One at a time, one worker, a fresh server each.
- At least 6 GB free at each start (7.25–7.46 GB in practice), with a safety stop under 1.2 GB that never triggered.
- After each run: 0 leftover repo processes, port 3000 free.
- The specs on the changed screens ran first.

| Spec | Result | Lowest free memory |
|---|---|---|
| `12-s01-report-contents-panel` (P08 outline order) | 5 passed | 3.07 GB |
| `13-s01-beyond-ai` (P07 copy; expectation updated) | 2 passed | 3.59 GB |
| `15-s01-pricing-and-portal` (portal downloads) | 2 passed | 4.82 GB |
| `tests/qa/sprint9/.../f07-client-portal-e2e` | 3 passed | 5.17 GB |
| `sprint4/sprint4-reports` (reports page downloads) | 19 passed | 2.72 GB |
| `sprint8/s8-governance-e2e` (Data Residency page) | 13 passed | 2.64 GB |
| `audit-running/running-to-finished` (the banner) | 4 passed | 4.17 GB |
| `14-s01-abn` | 2 passed | 3.78 GB |
| `04-brand-detail` | 9 passed | 3.38 GB |
| `tests/qa/sprint4/.../f04-audit-results` | 2 passed | 4.24 GB |
| `02-brands-list` | 8 passed | 3.35 GB |
| `03-brand-create` | 10 passed | 3.10 GB |
| `05-cross-org-isolation` | 9 passed | 3.20 GB |
| `06-region-and-pricing` | 11 passed | 5.48 GB |
| `07-acceptance` | 5 passed | 3.38 GB |
| `09-google-surfaces` (with `PLATFORM_ADMIN_EMAILS`) | 5 passed | 4.30 GB |
| `10-not-found-and-errors` | 4 passed | 3.24 GB |
| `11-s01-part0-carryovers` | 5 passed | 3.55 GB |

**Afterwards:**
- The queue's own shell outlived the stop (as my notes warned). I stopped it and its 5 node process trees.
- Then: 0 repo node processes, port 3000 free, 7.09 GB free.

**Screens** (PROTOTYPE-GUIDE format; screenshots taken by specs 12 and 13, copied to `.qa/screens/S01C/screens/`):

```
P07 · Audit page → Beyond AI answers card (S01C copy)
Nodes: crawlers and technical tiles changed; the card's title kept
States: technical measured ✓ / no area scores ✓ / not checked ✓ / failed ✓; crawlers measured ✓ / blocked ✓ (beyond-ai-card-copy test)
Acceptance: ✓ "{allowed} of {total} AI search crawlers allowed · checked {date}"; ✓ "{score} of {max} points", "checked {date}", "Weakest: structured data, 2 of 16 points"
Screenshots: .qa/screens/S01C/screens/P07-1240-{light,dark}.png, P07-390-{light,dark}.png
Deviations: none (the "+ k more" link has no directory tile to sit on: see the proposals)

P08 · Report contents panel → outline
Nodes: P08.outline order: … Why, and what to do next · Over time · Beyond AI answers · Method and notes
Screenshots: .qa/screens/S01C/screens/P08-1240-{light,dark}.png, P08-390-{light,dark}.png
Deviations: none
```

The Data Residency page (5c) and the report downloads (5a) were covered by `s8-governance-e2e`, `sprint4-reports` and the two portal specs. No new screenshots were taken of them.

## Memory and processes

- Start: 6.59 GB free, 0 node processes.
- No build, no dev server outside Playwright, and no test run alongside Playwright.
- End: 7.09 GB free, 0 repo node processes, port 3000 free.
- The temporary `tsconfig.s01c.json` (typecheck excluding `.next`) was removed.

## Tests skipped by the testing-scope rules

- Full suites: not run (not asked). No `next build`.
- Playwright: the 9 specs/shards above, "not run: memory".

## Commits

```
90b5d57f feat(reports): S01C part 5 -- report file names and carried items (LLD amendments 64, 65)
484092f0 feat(reports): S01C part 4 -- "Beyond AI answers" copy (LLD amendment 63; contract v1.6 P07, P09)
0b9a1ecf feat(reports): S01C part 3 -- a seed shaped like the real report, and the PDF layout (LLD amendments 61, 62, 64)
5ea93c3e feat(reports): S01C part 2 -- findings and actions say only what we measured (LLD amendments 59-61)
6ebd0dbb feat(reports): S01C part 1 -- plain reasons for customers (LLD amendment 58)
b3622f1d docs: client-enhancements pack v1.14 (real-report review, sprint S01C)
```

`git log origin/main..main --oneline` holds these six, plus this report's commit. Nothing is pushed.

## Push notes

1. **Migration: none.**
2. **Inngest resync: no.**
   - No function or step was added, renamed or removed. `send-scheduled-reports`, `send-audit-complete-email`, `notify-engine-total-failure` and the retention job changed only inside existing steps (N13's id test passes).
   - One memoized-step case is handled: the whole-engine failure alert's "find" step returns its alert to the "send" step. A run that crosses the push gets the plain words through a fallback (`customerReason` is optional).
3. **Push only when no report is generating** (the usual routine). A generation in flight finishes under the same step ids.
4. **Safe while an audit runs: yes.** The changes are wording, layout and links. The retention change runs in the weekly job, and a rename clears only the "Not mine" marker.
5. **Flags unchanged:** `report_v2` on for Splice only, `abn_suggestion` off.
6. **Live on push for every customer:**
   - **Part 1:** plain engine reasons on every customer surface (PDF in every tier and `report_v2` off, audit page, running audit, portal, emails, exports). The question generator's failure reads "(a problem on our side)".
   - **Parts 2a–b:** today's directory finding, the engine finding with its "cited most" line and one action, Recommended next's one style. The Wikipedia item's new title and words are live everywhere (app and Action Center); its PDF list is Standard/Enhanced only.
   - **Part 3e:** the Google place line, the directory table's header and suffix lines, the over-time chart's labels.
   - **Part 5a:** report PDFs download as "{Brand} – AI Visibility Report … – Week {w} {yyyy}.pdf". In production the ASCII fallback is Supabase's (`_` for non-ASCII), and browsers show the real name.
   - **Part 5c:** the Data Residency page's ABR paragraph and row.
   - **Part 5d:** Action Center directory dates as "20 Oct 2026", for new and refreshed items.
   - **Part 5b (retention):** the next Sunday run onward. Production has no 12-month-old suggestions yet, so it changes nothing for months.
7. **Only for Splice (`report_v2`):**
   - rules g–j's new words (rule i, rule j's titles);
   - OTHER ACTIONS in Inter and by priority;
   - the section order (Over time before Beyond) and P08's outline;
   - the Beyond copy;
   - the agency sentence only when there's a note or agency action.
8. **Before S02 (the runbook's gate):** regenerate the real Basic, Standard and Enhanced reports for Splice and check them with Claude (chat). The reports generated before the push keep their words on "Try again" (snapshots never change).

## Proposed changes to the documents (for Sri and Claude chat)

- **Amendment 62 / 3d:** Standard's Over time page stands alone at 33–49% in three seeds, because Method is kept whole. Choose among the options in Part 3d.
- **Amendment 61 / 3b:** OTHER ACTIONS' order (priority, then newest) overrides any order the agency saved in the panel for that group. Say whether the agency's order should win within a priority.
- **Amendment 64 / 5a:** production's ASCII fallback is Supabase Storage's ("_" for "–"). If the hyphenated fallback matters, report downloads need our own route, and for the portal a signed link of our own: a new secret.
- **Amendment 63 / Part 4:** "+ {k} more" linking to the audit's directory list on the audit page and the portal has no tile to sit on (the directory tile is PDF only, LLD 8.1.4). Drop it from the amendment, or add the tile to P07 (a contract change).
- **Amendment 58, further (not changed):**
  - the report-PDF-failed alert's org copy (a render failure);
  - Google's daily-cap customer reason ("Today's spending limit was reached, so Google was skipped …", `lib/audit/google-surfaces/reasons.ts:62`);
  - whole-audit errors other than the question generator's (e.g. "Budget exceeded", an unexpected exception's message) still pass through `customerAuditError` as stored.
- **Amendment 60:** the audit page banner is plain for everyone now, platform admins included. If operators want the provider detail on the audit page, show it to platform admins only (the operator email has it).
- **Amendment 65 / 5b:** a rename clears only the "Not mine" marker, not a dismissed suggestion still inside its 12 months. Say whether it should clear both.
- **Backlog:**
  - `namedCitedInAnswersList` (`lib/directories/cited-in-answers.ts`) is now used only by tests;
  - `entityProfilesAction`'s and `displayRecommendationAction`'s directories parameter is no longer read. Its callers still look the directories up (the Action Center detail page, the audit export, the latest-audit route): remove the lookups in S02 Part 0.
