# S05 — Business types: taxonomy, search picker, multiple and custom types, learning signals

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S05-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S04 pushed); say which hash. Read LLD **section 0** (v1.11 decisions and amendments) first, then sections 4, 7.3, 7A (0158), 8.5 (all), 11, 13, 20 (D5, D6, D7, D12) and appendix A; contract screens P06, P10 (types on confirm), P11, P15.

**UI contract:** build every screen named above from `docs/prototypes/vunnara-ui-config.ts` (its `screens` entries; canonical for layout, tokens, exact copy, states, accessibility, responsive rules and acceptance), following `docs/prototypes/PROTOTYPE-GUIDE.md` and mapping every token and component through `docs/prototypes/token-map.md`. `client-enhancements-v2.html` and `docs/prototypes/screens/*.png` are the visual reference. Interactive and tested nodes get `data-testid` from `testIdOf(node id)`. A screen part isn't done until all of its listed states exist.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only: related tests, new tests RED on the parent then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep 0), named guards. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production: the taxonomy is real reference data, reviewed by Sri before it goes into a migration. No `any`; FORCE RLS on org tables; global tables read-only for `visibleau_app` through the new named read-only list (Part 2, D-GT); no new `serviceDb`; no production writes (0158 as a run1–run4 set).
- Non-regression: LLD section 4 (N1–N15) must hold after every part; list the guards you ran for each part.
- Existing readers of `brands.vertical`, `brands.categories` and `brands.classification` keep working; `classification.category` is still written.
- Behind `business_taxonomy` (off). With it off, the wizard and confirm screen are as today.
- Decision defaults: D5 custom types Growth 5 / Agency 20 / Agency Pro unlimited; D6 ANZSIC 2006 mapping; D7 counts only from ≥ 3 workspaces; D12 aggregate-only SECURITY DEFINER function.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Taxonomy seed for review — then STOP
- Produce `db/seed/taxonomy/au-v1.json`: sectors, 180–250 types (appendix A minimum included, IT and technology services in full), each with plain name, aliases, default buyer, default reach (Local unless clearly remote/national; never auto-enabled), template family, 5–30 services with aliases, and an ANZSIC 2006 class **verified against the ABS class list** (cite the ABS source in the file header; leave `industry_code` null where no class fits rather than guessing).
- Mapping table from every current `CATEGORY_KEYS` value (28 keys in `lib/prompts/templates.ts`, none for IT services) to a type (none unmapped).
- Commit the JSON and a readable `docs/lld/taxonomy-au-v1-review.md` (sector → types → services, with codes).
- **Stop after this part** and report so Sri can review the taxonomy. Continue with Part 2 only when Sri says the seed is approved (he may edit the JSON).

## 2. Schema and seed (migration 0158)
First, the read-only list (D-GT): today every table is read-write for `visibleau_app` (prod-fix 0052 plus default privileges), and `tests/integration/app-role-grants.integration.test.ts` and the integration setup's `appRolePrivilegeDrift` treat a read-only table as drift. Add a named, documented read-only list to all three (one place in code); put the taxonomy tables and `directory_registry` on it; revoke INSERT/UPDATE/DELETE on those for `visibleau_app` in the run set (run3 proves the app role can SELECT but not write; the directory registry keeps working because nothing in the app writes it: prove that with a source scan). `search_demand_cache` joins the list in S08. Also put `ai_bot_registry` on the list if a source scan proves nothing in the app writes it: S00B's fetch guard trusts its `cidr_source_url` values as operator data (`lib/agent-analytics/ip-ranges.ts`). If something in the app writes it, report the writer with file:line and leave it read-write.
Tables per LLD 7.3, seeded from the approved JSON; `brand_business_types` legacy mapping (source 'legacy', main) for every brand; `refresh_taxonomy_signals()` SECURITY DEFINER aggregate-only (≥ 3 distinct workspaces; normalised names only), owned by the migration role, executable by an Inngest job's DB role only (VERIFY role setup; propose if missing). run3 checks: every brand has exactly one main type; no unmapped legacy key; grants; function returns nothing for keys seen in fewer than 3 workspaces (test with fixtures locally).

## 3. Taxonomy service and search (LLD 8.5.2, 13)
- `lib/taxonomy/`: versioned static JSON export (build step or route with long cache + version), search (name > alias > service, accent-insensitive, token/prefix), custom types merged first per workspace.
- Tests: "managed it" → Managed IT services provider first; "sparky" → Electrician; "MSP" → Managed IT; performance < 50 ms for 250 types in the browser test.

## 4. Wizard step 2 and brand settings picker (P06)
ARIA 1.2 combobox, results with sector and match reason, up to 5 types with one main (★), sector chips (old four cards become shortcuts), custom-type entry (locked below Growth). Brand settings "Kind of business" uses the same picker. Writes `brand_business_types` and keeps `classification.category`/`vertical` in step (mapped back). Tests: keyboard e2e, axe check, plan lock, legacy fields written.

## 5. Classifier uses the taxonomy (LLD 8.5.3)
`classify-brand.ts` gets a candidate list (sector-filtered, ≤ 150 entries) and must return slugs with confidence; zod-validate against the list; < 0.7 → confirm screen as today. Confirm screen shows detected types first (High/Medium/Low), grouped by sector, plus search. Every confirmation writes `classification_feedback`. Tests with recorded model outputs (no live calls): an invented IT-services home page shaped like TechCore IT's (amendment 66) → Managed IT services provider (not SaaS).

## 6. Custom types (LLD 8.5.4, P11)
Modal P11; `/settings/business-types` list (edit, archive); per-plan limits server-side (402); unique name per workspace (case-insensitive); question generation uses the parent type's template family plus the custom services/description. Tests incl. cross-org isolation and XSS payloads.

## 7. Learning signals and operator page (LLD 8.5.5, P15)
Nightly Inngest job calls `refresh_taxonomy_signals()`; `/admin/taxonomy` (operators only) shows signals and the accuracy metric (share of new brands in 30 days whose top detected type stayed main); "Propose" writes a change file under `db/taxonomy-changes/` plus a run1–run4 template (no live production edits). Tests: non-operator 403; k ≥ 3 enforced; no names/URLs in output.

## Report-back
- Part 1: stop with the review file path and counts (sectors, types, services, codes verified vs null).
- Later parts: file:line, changes, tests (RED/GREEN, by name), guards, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- UI: for each screen touched, the guide's per-screen block (nodes built of specified, states, acceptance pass/fail, screenshots in `.qa/screens/S05/` at 1240 and 390, deviations with the contract change you propose).
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0158 first; Inngest resync (yes: nightly job, classifier); safe while an audit runs; flag `business_taxonomy` off.

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
