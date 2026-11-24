# S01B — Report polish and hardening (before `report_v2` is switched on)

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S01B-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S01 pushed: `bb5248d5`, migration 0154 applied, live checks passed on 24 Nov 2026); say which hash. Read LLD **section 0** (v1.8: amendments 43–55 are new) first, then sections 4 (N13–N15), 8.1 (8.1.2, 8.1.3, 8.1.7), 11, 15; `docs/Sprints/reports/S01-report.md` in full (its deviations section especially); contract screens P09 (v1.4), P07 (`P07.beyond.*`), P08 (`P08.checks`).

**Why this sprint:** S01 is live with `report_v2` off. Sri reviewed the PDFs it produced and Claude (chat) reviewed S01's report. Before `report_v2` is switched on, even for Splice, the PDFs need their layout fixed and three hardening items done. **With `report_v2` off nothing a customer sees changes**, except the privacy wording in Part 5.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests (runbook section 5): related tests, new tests RED on the parent then GREEN, typecheck, lint per changed file, **every source-scan guard file**. Playwright only where a part changes a screen (Part 5 only).
- ⛔ No production writes. **No migration in this sprint**: if a part seems to need one, stop that part and report (S02 owns 0155). No mock data in production; no `any`; no new `serviceDb`; no live network from tests (Part 3 makes that a rule).
- N13: Inngest app id and existing function ids unchanged; Part 1 adds one function. N14 and N15 must still pass after every part.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Enhanced checks in their own function (LLD amendment 49)
Today the refresh is a step inside `generate-narrative-report`, which runs in `POST_AUDIT_POOL` (account-wide limit 1), so one Enhanced report can hold every workspace's post-audit jobs for up to 5 minutes.
- Move the refresh into a new Inngest function `refresh-enhanced-checks` with concurrency **one per brand** (key `brand_id`) and at most **2 account-wide**, not in `POST_AUDIT_POOL`. The generator writes the report row ("Running checks…") and sends the event; the refresh runs the stale checks (same window logic and runners as S01 Part 9, same 5-minute cap); then the snapshot step and `report/generated` follow as today. Choose the event names; never rename existing ones.
- A report generation that started before this change must still finish: keep the existing step ids readable for runs already in flight, or show why none can be in flight after the push routine (Sri pushes only when no report is generating). Say which.
- Tests: two Enhanced reports for one brand still run one refresh; an Enhanced report for brand A doesn't wait for brand B's refresh; while a refresh runs, a post-audit job in `POST_AUDIT_POOL` starts without waiting; the timeout and failure paths still print every tile; the function-id snapshot (N13) gains `refresh-enhanced-checks` only. Inngest resync: yes.

## 2. Technical audits that don't belong to an audit (LLD amendment 49)
S01's refresh writes `technical_audits` rows with `audit_id` null (`runTechnicalAuditInline(null, …)`).
- List every reader of `technical_audits` (the `READERS` list in `tests/unit/technical-audit/score-surfaces.test.ts` plus any it misses) with file:line: what it shows, and what it does with a row whose `audit_id` is null (latest technical score, trend charts, the technical audit page and its history, links to an audit, exports, admin pages, retention job, brand deletion).
- Fix every reader that breaks, mislabels, links nowhere, or double-counts such a row. A refresh row is a legitimate latest technical check for the brand; it never claims to belong to an audit.
- Tests: with a refresh row present, each fixed reader shows the right thing; brand deletion and the retention job remove refresh rows like the others.

## 3. No live network from tests (LLD amendment 50)
In S01 Part 9 a test reached the internet once (a crawl through the guarded fetcher and a Wikipedia search).
- In the unit and integration test setups, refuse every outbound connection except localhost and the test database host: Node's global `fetch` dispatcher, `node:http(s)`, `net`/`tls` connects and DNS lookups of non-local names. The error names the host and says "tests must not reach the network; record a fixture".
- A guard test proves it (a real outbound `fetch` and a DNS lookup fail fast with that message) and that S00B's guarded-fetcher tests still reach their local server.
- Run the whole unit and integration projects once with the guard on (explicitly allowed for this part only) and list every test that tried to reach the network, with file:line and what it tried. Fix each with a recorded fixture or a stub. Playwright is out of scope (its server is local).

## 4. PDF layout and consistency (LLD amendments 51–53; contract v1.4 P09)
Sri reviewed `hero54-enhanced.pdf` and the contact sheets. Fix, for Standard and Enhanced unless stated:
- **a. One coherent fixture.** The report images and render tests mixed data from different sources: the same PDF said hipages was cited in 8 of 40 answers (page 4) and 9 of 40 (pages 5 and 7); the summary tile and "Where AI looks" said profiles were "Not checked" while "Beyond AI answers" said Yellow Pages was linked; an Omega-named fixture showed another business's ABR entity. Build the fixtures by seeding one audit per fixture in the integration database and running the real code path (`buildReportData` → `buildReportV2` → snapshot → render), never hand-composed render input. Name each fixture after what it renders (the "Hero #54 stand-in" printed "Omega Services"). Keep no client data in the repo: the seeds are invented businesses shaped like the real ones.
- **b. Cross-page consistency test.** For each fixture and tier, every figure that appears on more than one page is identical everywhere it appears: each directory's cited count and its linked status (summary tile, "Where AI looks", findings evidence, actions, "Your directory profiles"), the Visibility figure, and each engine's figure.
- **c. Each finding once.** "Why, and what to do next" showed each finding as a card and then again as a measured action. Each finding now appears once: its card carries its Action Center item's priority and status pills and the agency's note when there is one. The group after the findings is **OTHER ACTIONS FROM THIS AUDIT** and lists only measured items not already shown as a finding. Then RECOMMENDED BY {AGENCY}, DONE SINCE THE LAST REPORT and GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT, as today. The P08 panel keeps working on the same items.
- **d. Today's findings limit (every tier, Basic included).** At most 3 problem findings and 1 strength, as today's `report-findings.ts` rule: rank by impact (high before medium), then rule order. Findings beyond that appear only as actions in Standard and Enhanced, and in the Action Center. (TechCore's Basic PDF had five problem cards, the fifth alone on an otherwise empty page.)
- **e. Pages flow.** From "Why, and what to do next" onwards, sections flow instead of each starting a new page: a section starts on the current page when at least a third of the page is left, otherwise on the next. A group or section heading always stays with its first item (page 5 ended with "RECOMMENDED BY SPLICE MARKETING" and its card was on page 6). A card is never split across pages. Basic keeps today's page breaks (N15). Expected for the Enhanced fixture: about 7 pages instead of 9, with no page apart from the last less than about a third full.
- **f. Words, not symbols, in mono text.** The identity tile printed ".au domain" with a blank where "✓" should be: the PDF's mono font has no such glyph. Use words (".au domain: yes" / "no"). Add a test that every string the PDF prints in each registered font has a glyph in that font (fontkit's `hasGlyphForCodePoint`).
- **g. The crawlers tile** printed "upload server logs" twice. Show "Visits: not measured" and the single "Next step: Upload server logs" line.
- Tests: render tests for each fix; N14 and N15 still pass (N15's allowed differences now include the cover's report name on Agency plans, amendment 53); page counts before and after for every fixture and tier.

## 5. Privacy wording for ABR lookups (LLD amendment 54)
Find where the public FAQ ("Is my data safe?"), the privacy page or draft and any data-facts list live (S01 found no `data-facts.ts`; say what you find, file:line). Add the wording in amendment 54 exactly, where the app describes the other third parties it sends data to. Public pages change only here. Playwright: the specs `scripts/qa/e2e-specs-for.ts` maps to the changed public pages.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright ("not needed" except Part 5).
- Part 2's reader table. Part 3's list of tests that tried to reach the network and how each was fixed.
- **The PDFs:** for each fixture (the Hero-like, Omega-like and TechCore-like seeds), all three tiers, as PDF files in `.qa/screens/S01B/pdf/` plus one contact sheet per tier; a table of page counts before and after. Sri will attach the PDFs to Claude (chat).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration none; **Inngest resync: yes** (new function); push only when no report is generating; safe while an audit runs; flags unchanged (`report_v2` still off); the privacy wording is live on push.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
