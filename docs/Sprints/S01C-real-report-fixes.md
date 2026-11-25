# S01C — Fixes from the real reports (after `report_v2` was switched on for Splice)

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S01C-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S01B pushed: `69eb1fcd`, 25 Nov 2026; no migration; Inngest resynced, 50 functions); say which hash. Read LLD **section 0** (v1.10: amendments 58–66 are new) first, then sections 4 (N14, N15), 8.1 (8.1.2–8.1.7), 12, 15; `docs/Sprints/reports/S01B-report.md` in full; contract v1.6 screens P09, P07 (`P07.beyond.*`) and P08 (`P08.outline`).

**Why this sprint:** on 25 Nov 2026 Sri switched `report_v2` on for Splice only and generated Basic, Standard and Enhanced reports for a real brand from its audit #54, and Claude (chat) reviewed them. Every figure agreed across pages and tiers. What needs fixing:
- an operator-only reason printed for the client;
- findings and actions that claim more than the audit measured;
- the font and order of "Other actions";
- a near-empty page in Enhanced;
- unclear copy on the "Beyond AI answers" tiles;
- a download named by a UUID.

Some of these fixes also correct today's report, with `report_v2` off. Amendments 58–60 and 64 say which, and N15's allowed differences gain them. Everything else stays behind `report_v2`, as before.

**Rules (every part):**
- One commit per numbered part. Don't amend. Commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- **Never publish or share anything:** no web pages, artifacts, gists, pastes or uploads. Reports and PDFs stay in the repo and `.qa/`.
- Targeted tests (runbook section 5): related tests, new tests RED on the parent then GREEN, typecheck, lint per changed file, and **every source-scan guard file**.
- Playwright only in parts that change a screen: the specs `scripts/qa/e2e-specs-for.ts` maps to the changed files, one at a time, with the runbook's memory rules.
- ⛔ No production writes.
- **No migration in this sprint.** If a part seems to need one, stop that part and report (S02 owns 0155).
- Action Center text already stored in production isn't rewritten. New wording applies to items created or refreshed after the push.
- No mock data in production, no `any`, no new `serviceDb`, no network from tests.
- **Report fixtures** (amendments 51, 57, 66): use invented businesses seeded as real audits and rendered through the real path. No client data. The real brand's PDFs are not in the repo; the wording quoted below is all you need from them.
- N13: the Inngest app id and function ids stay unchanged.
- N14 and N15 must pass after every part, with the allowed differences in amendments 53, 58–60 and 64.
- If the LLD contradicts the code, the code wins: report it with file:line, and continue only with the independent parts.

## 1. Plain reasons for customers (amendment 58)
The real Basic, Standard and Enhanced PDFs all printed, under the over-time chart: "Audit #47 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared." That tells the client our provider account ran out. The operator settings page's own rule is that customers see only a plain reason (for example "a problem on our side").
- **Find every place** an engine's failure, stop or skip reason can reach a customer. List each with file:line and the text it shows:
  - the PDF (today's report and v2);
  - the audit page;
  - the dashboard and trend;
  - the client portal;
  - emails (scheduled reports, audit complete);
  - exports.
  Operator pages are out of scope.
- **One mapper** for customer-facing reasons. Reuse the one behind the operator page's provider-errors panel if it exists.
  - Anything on our side becomes "a problem on our side": spend limit, quota, credit, billing, keys, rate limits, provider outages, timeouts and model errors.
  - Keep any existing plain reason that describes the customer's own setup.
  - Every place in the list uses the mapper. Operator pages keep the detail.
- **The PDF note** reads: "Audit #47 used 3 of 4 engines (Claude didn't answer: a problem on our side), so it's shown but not compared."
- **Tests:**
  - Seed a trend audit whose Claude answers failed with the spend-limit reason.
  - None of these ever contain the internal wording: the PDF (every tier, and with `report_v2` off), the audit page data, the portal data and the email text. The test holds the list: "spend limit", "quota", "credit", "billing", "rate limit", "API key" and HTTP status codes.
  - The operator page still shows the detail.
  - This is live on push for every report.

## 2. Findings and actions say only what we measured (amendments 59–61)
Quoted from the real reports (audit #54; directory and engine names as printed).

- **a. Directories** (today's directory finding and rule i; amendment 59).
  - **Rule i** printed "AI cites directories you're not on yet", with the action "Create or claim your Local Business Guide, Whereis and Birdeye profiles, then link them in brand settings". Today's "Recommended next" printed "Get listed on Local Business Guide, Whereis and Birdeye". We only know those profiles aren't linked. New wording:
    - title: "AI also cites directories where we can't see your listings yet";
    - action: "Add your {A}, {B} and {C} profile links in brand settings, or create the profiles if you don't have them";
    - Recommended next title: "Link or create your {A}, {B} and {C} profiles";
    - Recommended next body, in item 1's style: "{A} and {B} were each cited in 5 of 40 answers and {C} in 4; none of them is linked yet".
  - **Today's directory finding's action**, "Add your Yellow Pages / hipages / Airtasker profile links in Vunnara, then claim or complete them", takes rule i's form: "Add your {A}, {B} and {C} profile links in brand settings, or create the profiles if you don't have them".
  - **Today's directory finding** said "They cited nine directories 58 times … 8 directories aren't linked yet", while page 2 said 13 directories, 73 times, 12 not linked. Both are right: the 9 usual directories for the business type, plus 4 others. The finding must say its scope: "They cited {n} of the usual directories for your type of business {k} times. … {m} of them aren't linked yet, so we can't tell for those." Counts are numerals everywhere.
  - **Recommended next bodies** use one style: "{A} was cited in 17, {B} in 7 and {C} in 5 of 40 answers; …". Item 3 repeated "was cited in … of 40 answers" three times.

- **b. An engine that never mentions the business** (today's finding and today's Recommended next; amendment 60).
  - **What the real reports said:**
    - The finding's action said "Review your Google Business Profile: categories, services, hours and recent reviews". That claims what Gemini reads (amendment 56).
    - Recommended next said "We can see the pages Gemini cited, but not what it searched, so we can't say why", under the title "Gemini didn't name you in any of 10 answers". That title is the problem, not an action.
  - **Evidence:** keep the per-engine counts and add one line: "{Engine} cited most → {directory} ({n}), {directory} ({n}), {directory} ({n})". These are the directories (registry entries) that engine cited most in these answers.
  - **Action,** the same in the finding and in Recommended next: "Make sure your profiles on {A}, {B} and {C}, the directories {Engine} cites most, are complete and linked in brand settings".
  - **Recommended next** keeps its body sentence and uses the action as its title.
  - **If the engine cited no directory:** no action line, and Recommended next leaves the item out.

- **c. Other actions** (Standard and Enhanced; amendment 61).
  - **The Wikipedia check's item** (find its source, file:line) printed a seven-line paragraph that repeated findings 1–3: Google Business Profile, the same nine directories, "claim or complete". New wording:
    - title: "Get covered in local press or on community sites";
    - text: "We checked: there's no Wikipedia article for your business. That's normal for a local business: Wikipedia needs significant coverage in independent sources, so we don't recommend writing one yet. Coverage in local press or on community sites is the step that helps."
    - No dashes used as punctuation.
  - **Rule j's action title follows its cause.** The real report showed "Verify your ABN" for a brand with no ABN.
    - No ABN: "Add your ABN", plus " and link your Google Business Profile" when that's missing too.
    - ABN verified, no profile: "Link your Google Business Profile".
    - Other causes keep their title.
  - **"Notes and actions from {agency} are labelled."** is printed only when the report has at least one note or action from the agency.

- **The same text everywhere:** the audit page and the Action Center show the same text as the PDF (same source).
- **Tests on the seeds,** RED on the parent then GREEN:
  - none of these is printed: "you're not on", "Get listed on", "Create or claim", "claim or complete them", "Review your Google Business Profile" (in the engine finding), "Verify your ABN" (with no ABN);
  - the engine finding's action is identical in both places;
  - Action Center items match the PDF.
- **Today's report** (`report_v2` off) changes for a and b, as N15 allows (amendments 59–60).

## 3. A seed shaped like the real report, and the PDF layout (amendments 61, 62, 64)
- **a. A fourth seed** in `tests/helpers/report-seeds.ts`: "Waratah Home Services", invented, a general trades business in a NSW suburb with its own postcode. Shape it like the real audit #54 report:
  - **directories:** 13 cited 73 times: 9 usual for its type, and 4 others, including two with a type suffix and "Google Business Profile". One is linked, with 2 own-profile citations;
  - **engines:** 4, one of them at 0 of 10 that still cited directories;
  - **Google section:** 13 questions;
  - **other actions:** 2 (rule j with no ABN and no profile, and the Wikipedia item);
  - **trend:** 6 audits, with one 3-of-4 audit (failed for an internal reason, as in Part 1), one question change and one excluded audit;
  - **checks:** no ABN, no YouTube; crawlers and technical checked.

  Build it through the same real code path as the other seeds, and include it in the cross-page consistency test.
- **b. Other actions:** text in Inter; only the "· audit #{n}" tag stays in mono. Order them High, Medium, Low, then newest first. The real reports printed them in JetBrains Mono, with LOW before MEDIUM.
- **c. Section order** in Standard and Enhanced:
  1. … Why, and what to do next;
  2. Over time;
  3. Beyond AI answers (Enhanced);
  4. Method and notes.

  Over time is section 06 in both tiers. Beyond AI answers keeps its tiles together by row: a row never splits, the heading stays with its first row, and the directory-profiles tile may start the next page. P08's outline follows the same order.
- **d. No near-empty pages** in Standard and Enhanced.
  - The rule: no page other than the last is less than half full, where the content allows it. The real Enhanced report had 9 pages, and page 8 held only the over-time chart.
  - Measure each page's lowest text line from the rendered PDF (say how).
  - Report a page map (page → sections, fill %) for every seed and tier, before and after.
  - Target for the new seed: Enhanced at most 8 pages; Standard and Basic no more than 8.
  - If a target can't be met without breaking a rule in c or in amendment 52, stop this item and report the page map with the options.
- **e. Every report, `report_v2` off included** (amendment 64; N15 allows these):
  - **The Google section's place line:** "{suburb} {STATE} {postcode} · {device} · {date}" when the postcode is the brand's own. The real report printed "2161 NSW · desktop · 21 Nov 2026". Unchanged when an operator set the postcode or there is none.
  - **Section 04's directory table** repeats its header row on a continued page. Directory names don't wrap: a type suffix ("general directory", "maps", "review site") goes on its own muted line.
  - **The over-time chart** says why a point isn't compared, under its audit: "○ 3 of 4 engines" or "○ questions changed". The real report put "○ 4 of 4 engines", in the warning colour, under the audit whose questions changed.
- **Tests:** render tests on all four seeds; the page maps; N14; N15 with the new allowed differences.
- **Playwright:** the P08 panel spec (`tests/e2e/12-s01-report-contents-panel.spec.ts`), for the outline order.

## 4. "Beyond AI answers" copy (amendment 63; contract v1.6 P07, P09)
These changes apply to the same tiles on the PDF page, the audit page card and the portal.
- **PDF heading:** "What else we checked about your business". It was "What AI can read about you elsewhere", a mild version of the claim amendment 56 removed. The audit page card keeps its title, "Beyond AI answers".
- **AI crawlers:** "{allowed} of {total} AI search crawlers allowed · checked {date}". It was "4 of 4 · checked 21 Nov 2026".
- **Website technical:** the real tile printed "40 of 74 · checked 21 Nov 2026 · v4 scoring".
  - Find what the 74 counts (file:line). The prototype suggests points across areas, such as Schema 16 and Signals 6.
  - Say it on the tile: "{score} of {max} points" (or the true unit), "checked {date}", and "Weakest: {area in plain words}, {a} of {b} points".
  - The scoring version moves to Method's "Checks outside AI answers" line: "technical 21 Nov 2026, v4 scoring".
- **Your directory profiles:** the real tile mixed "linked · cited in 15 answers" with "not linked (cited in 17 answers)", and listed 6 of 13 without saying so. New layout:
  - first line: "Linked {linked} of {cited} directories AI cites for your questions.";
  - then the top 6, one line each: "{directory} · cited in {n} of {total} answers · linked" or "· not linked yet";
  - when there are more: "+ {k} more in section {nn}" (PDF), or "+ {k} more" linking to the audit's directory list (audit page, portal).
- **Tests:** render and component tests, and the P07 card's states.
- **Playwright:** the specs mapped to the card and the portal (`13-s01-beyond-ai` among them), one at a time.

## 5. File names and carried items (amendments 64, 65)
- **a. Report file names.** The real Basic downloaded as `5573cd17-….pdf`.
  - Name the file the same way wherever a report PDF leaves the app: download, portal download, and scheduled-report email attachment. List each with file:line.
  - The name: "{Brand} – AI Visibility Report ({Tier name}) – Week {w} {yyyy}.pdf". With `report_v2` off: "{Brand} – AI Visibility Report – Week {w} {yyyy}.pdf".
  - Send it through `Content-Disposition`, with an ASCII fallback (`filename=`, hyphens, no accents) and `filename*=UTF-8''…`.
  - Tests for each place.
- **b. "Not mine" lasts** (amendment 65).
  - When the retention job clears an `abn_suggestion` the customer answered "Not mine", it leaves a dateless dismissed marker with no ABR data (no ABN, entity, status or place). Brand settings then doesn't offer a suggestion again.
  - Changing the brand's name clears the marker.
  - Tests go in `tests/integration/abr-retention.integration.test.ts`. If this needs a column, stop this item and report.
- **c. The signed-in Data Residency page** lists the ABR wherever it lists DataForSEO. Build the entry from `ABR_LOOKUP` in `lib/legal/data-facts.ts`, or from a short form derived from it, so the 12 months can't drift. Playwright: the mapped spec.
- **d. Action Center dates:** `lib/recommendations/triggers.ts:239` writes "(checked 20 Oct 2026)" with `formatCheckDate`, not an ISO date. This applies to new and refreshed items only.
- **Tests** for each item, RED on the parent then GREEN.

## 6. PDFs for review
- Render all four seeds in all three tiers, and with `report_v2` off, as PDF files in `.qa/screens/S01C/pdf-final/`.
- Add `page-counts.json`, the page maps from Part 3 and one contact sheet per tier.

## Report-back
- **Per part:** file:line, changes, tests (RED/GREEN, by name), guards, and Playwright (or "not needed (no UI change)").
- **The lists:** Part 1's customer-facing reason sites; Part 5a's places a PDF leaves; Part 4's answer on what the technical score counts.
- **Pages:** page maps before and after (Part 3), and page counts per seed and tier.
- **Today's report:** every change to it (`report_v2` off), each with the amendment that allows it.
- **Commits:** the hashes and `git log origin/main..main --oneline`.
- **Push notes:**
  - migration: none;
  - Inngest resync: yes or no, and why;
  - push only when no report is generating;
  - safe while an audit runs;
  - flags unchanged (`report_v2` on for Splice only, `abn_suggestion` off);
  - what is live on push for every customer (Parts 1, 2a–b, 3e, 5a, 5c, 5d) and what only for Splice (`report_v2`).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
