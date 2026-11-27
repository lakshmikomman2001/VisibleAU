# S04B — Perplexity on the Agent API, provider limits, reach views, and S04's follow-ups

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S04B-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S04 pushed: `be10c849`, 28 Nov 2026; 0157 applied; Inngest resynced; live check passed; `visibility_reach` off everywhere); say which hash. Read LLD **section 0** (v1.14 decisions and amendments, especially 98–110) first, then sections 8.1.5 (rule b), 8.2.1, 8.4.4, 8.4.6, 8.4.7, 12 and 15; contract screens P01 (reach card copy), P02 (edit mode by reach), P03 (area), P07 (reach filter, Responses by reach, Google place line).

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, with the runbook's memory rules and shard counts (responsive-shell 16, s9-autopilot 4); one run per call, never chained. Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production; no `any`; FORCE RLS; no new `serviceDb`; no production writes. No migration is expected; if Part 2 finds `engine_call_failures.error_class` constrained, the new value comes as migration 0158 with a run1–run4 set (runbook section 5), and S05's migration becomes 0159: say so at the top of the report.
- **What changes for everyone on the push:** Part 1 (Perplexity's request path; the same answers-and-sources contract), Part 2 (quota handling; customers still see only "a problem on our side"), Part 3 (the results write and `audit.complete`; nothing a customer sees), and Part 5's rule b wording and Google place line (N15 allows both). **Behind `visibility_reach`:** Part 4. Agency-only changes stay behind `agency_questions`.
- Headline figures and trends for existing audits don't change (N1–N3). An audit with every engine answering gives the same figures as before the push.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Perplexity on the Agent API (amendment 99; first)
Perplexity announced that its Sonar Chat Completions endpoint retires on 27 Sep 2026 and pointed developers to the Agent API's Responses endpoint. Ours still answered on 28 Nov 2026, but can stop without notice.
- Read Perplexity's current documentation before writing code: the Agent API Responses endpoint, its web search tool or preset, the model naming, the response's text, citations and search results, usage and errors, and the price per request. Quote each item in a code comment with its link (as `lib/llm/reach-location-params.ts` does) and in the report's table with the date you read it.
- Move the adapter to the Agent API with web search on. Keep its contract exactly: answer text, cited URLs, search results (with titles where given), usage for cost, the same timeouts and retries, cache recording and mock mode. Use the same tier of model as today: name today's Sonar model and what it maps to.
- If the Agent API's web search takes a user location, wire it per reach like ChatGPT (Local: city, region and country as today's `buildEngineLocation`; State: region and country; Country: country; Worldwide: none) and update `reach-location-params.ts` and LLD 8.4.4's row in your report. If it doesn't, Perplexity keeps no location, as today.
- Cache: say whether answers cached before the move still replay (if the key includes the model or endpoint, they don't; that's fine) and that a Local key for the other engines is unchanged.
- Map Perplexity's errors onto the existing classes, and its quota or billing refusals onto Part 2's `provider_quota`.
- Tests, RED on the parent: the request body through the real HTTP layer (endpoint, model or preset, web search on, location when supported); parsing a recorded Agent API response (invented content, no client data) into the same answer, URLs and search results; mock mode unchanged; error mapping.
- Report: the documentation table; today's price per answer and the new one, from the docs and from usage on the mock fixtures; what the Methodology page and the PDF's method page say (they keep "Perplexity").

## 2. Provider spend and quota limits (amendment 100)
Live audit #57 (28 Nov 2026): Anthropic refused 10 of Claude's 13 calls with HTTP 400 "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.", and it was filed as `error_class` 'other'.
- Classify as `provider_quota`: Anthropic's 400 `invalid_request_error` whose message starts "You have reached your specified API usage limits" or "You have reached your specified workspace API usage limits", and its 429 whose `error.details.error_code` is `enforced_spend_limit_reached`; OpenAI's `insufficient_quota`; Gemini's and Perplexity's quota or billing refusals as their docs name them (quote the docs). An ordinary rate limit stays a rate limit.
- After the first `provider_quota` refusal in an audit, send no more calls to that engine in that audit: record each remaining call as failed with the same class and no request. Both runners. The per-engine panel and the PDF count them as today ("{n} failed — not counted"); customers see only "a problem on our side".
- Tell the operator: the admin settings page's Provider errors section lists engine refusals as well as Google's (engine, class, the provider's own message, first and last seen, audits affected), newest first. The platform admins get one in-app notification and one email per provider per day while refusals continue, through the existing notification and email paths: "{Engine} refused calls: its spend or quota limit is reached. {provider message}. Raise the limit in the provider's console." Operators only.
- Tests: each refusal shape above classifies as `provider_quota`; a rate limit doesn't; the stop after the first refusal (both runners); one notification and one email per provider per day; the customer-facing reason unchanged (the customer-reasons guard).

## 3. The results write and `audit.complete` (amendments 104, 105)
- `writeAuditReachResults`: delete and insert in one `serviceDb` transaction; on failure one structured log line (event `reach_results_not_stored`, audit id, SQLSTATE; no SQL or parameters); 0 everyday answers stores 0 of 0 with `ci_low` and `ci_high` null. Still non-fatal, still called where S04 calls it.
- The audit page's "oldest cached answer" passes each question's reach to the cache key (Part 4 of S04 added the scope), so questions beyond Local show their time.
- `run-audit`'s finalize step: when its UPDATE matches no row because the audit is already complete (its first run committed and the response was lost), send `audit.complete` anyway, with the audit id as the event id (the normal send uses the same id), so Inngest drops a repeat and the email, report and follow-ups happen exactly once. Don't rename or add step ids.
- Tests, RED on the parent: a failed re-write keeps the earlier rows; the log line's shape; 0 answers stores nulls; the cached time for a State question; finalize run twice sends `audit.complete` once (by event id); the inline runner unchanged.
- Say whether this part needs an Inngest resync.

## 4. Reach views (amendment 102; behind `visibility_reach`)
- **P02 edit mode by reach:** the edit view keeps view mode's sections; rows drag within a section; the row menu's "Move to another area" moves a row between enabled reaches (hidden with one reach); each section has "+ Add question" at its foot, opening P03 with that reach preselected. The draft bar counts moves. With the flag off, edit mode is exactly S04's.
- **P07 Responses by reach:** one section per reach, in reach order with the Questions tab's labels; the names-your-business questions last, as today; one reach: no section headers.
- **P07 reach filter** (`P07.reachFilter`): "All areas · {reaches}" above the per-engine table, hidden with one reach; the same choice filters Competitor context; both recompute from this audit's answers in that reach with one grouped read (no query per reach). "All areas" equals today's page.
- Screenshots in `.qa/screens/S04B/`: P02 edit mode by reach and P07 with the filter, at 1240 and 390, light and dark. responsive-shell's Questions test runs with the flag on too.
- Tests: component tests per node; an e2e on an invented 3-reach brand (move a row to NSW, add a question in Australia, apply; the audit's Responses sections and the filter's figures add up to the headline). N1–N3 with the flag off.

## 5. Small fixes
- **Free and regeneration** (amendment 101): a Free brand's set follows amendment 74 even after the confirm step; Starter and up keep amendment 84. Test both, on the plan at regeneration time.
- **P01 copy** (amendment 103): "{planName}: up to 1 area" for one; "(small sample)" for any reach under 5 questions, Local included.
- **Rule b with one directory** (amendment 106; live for everyone): "This is the directory it cited most in them." Test both forms; the four seeds' page counts unchanged (N15).
- **The audit page's Google place line** (amendment 110; live for everyone): `P07.googlePlace`, the PDF's "{suburb} {STATE} {postcode} · {device} · {date}" when the postcode is the brand's own. Test with an invented brand.
- **Reach refusals** (amendment 98): nothing to change; name the tests that pin 403 `plan_required` and 402 `question_limit`.

## 6. Run sets and test hygiene (amendments 107, 108)
- Replace `db/prod-fixes/0157-s04-run2-apply.sql` with the reviewed copy in this pack (`prod-fixes/0157-s04-run2-apply.sql`: the RLS-bypass check and `nullif` in the Wilson interval). The run-set test checks, for every run2 from 0157 on that inserts into a table with FORCE RLS, that it starts with the bypass check and that its divisions are guarded.
- sprint3 FE-2.1: an exact-text locator for "Run an audit" (it also matched "Run an audit with competitors…").
- `prompt-trend` and `avatar-color`: explicit timeouts for cold starts in the guard batches. `dead-link-guard`: its own temporary folder.
- If any script holds Playwright shard counts, set responsive-shell to 16 and s9-autopilot to 4 (the runbook already says so).

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright per the runbook, or "not needed (no UI change)".
- Part 1's documentation table with links and dates, the prices, and the cache answer.
- Part 2: the refusal shapes per provider with their doc links; what the operator sees (a screenshot of the admin section with an invented refusal).
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration (none expected; 0158 only if Part 2 needed it); Inngest resync (say yes or no, from Parts 1–3); what changes for everyone (Parts 1, 2, 3 and Part 5's rule b and Google line) and behind `visibility_reach` (Part 4); and the live check you'd suggest (one audit: Perplexity answers through the Agent API; the stored Local row equals the page).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
