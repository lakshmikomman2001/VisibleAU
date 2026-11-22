# S00 report: verify the LLD, quick wins, feature flags

Sprint S00 of the Vunnara client enhancements · 22 Nov 2026 · started from `15f287b` (`main` = `origin/main`, checked with `git fetch origin`) · nothing pushed.

## Read first

1. **Playwright specs: not run: memory.** Free memory stayed between 3.4 and 6.4 GB through the sprint, and every e2e server here needs 3–5 GB on top of it. D-UI1 (control borders, Part 0b) is **not behind a flag**: its before/after screenshots **were taken** (8 files in `.qa/screens/S00/`), but the specs listed at the end must pass before you push. The kickoff message for that session is in section 10 of the runbook.
2. **Migration 0153 first**, as one run set: `db/prod-fixes/0153-s00-run1-precheck.sql` → `run2-apply` → `run3-post-check`, before the push (three sections: flag keys, brand aliases, directory registry). The pushed code reads `brands.aliases` and `brands.name_suggestion` with every brand row, so without run2 every brand page and audit fails.
3. **Part 1 is the gate for S01**: `docs/lld/as-is-verification.md`, 27 proposed LLD amendments at the top. Several change S01's plan (reports start at Growth, not Starter; branding is `agency_brand_assets`; scheduled reports exist; finding rules are a–f so the new ones are g–j; the generate route takes no basis audit; no ABN field anywhere in the app).
4. Inngest resync: **no** (no function added or renamed). Safe while an audit runs: **yes** (an audit reads its brand row at its start; new columns have defaults; the directory registry falls back to the same rows in code). Flags: **all 13 off** (no rows written).

## Pre-flight

- Branch `main`, `main` = `origin/main` = `15f287b5`. Untracked before the sprint and left alone: `GoogleAI/`, `db/prod-fixes/0131-run1b-is-active-nullable-check.sql`, `prod-fixes/` (Sri's files from Aug–Oct; START-HERE step 4's "nothing else" taken as "nothing else from the copy").
- Pack v1.5 found; copied; `docs/latets/` added to `.git/info/exclude`; `docs/prototypes/client-enhancements-v1.html` didn't exist.
- `docs/sprints/` is tracked as `docs/Sprints/` (capital S); on Windows the copies landed there, so the prompts and this report are under `docs/Sprints/`. On Linux checkouts the runbook's `docs/sprints/...` paths need the capital. Proposed: rename the folder in one commit, or amend the runbook.
- Migration number 0153 free (latest 0152). Design files present.
- Baseline on the untouched tree: typecheck clean (`tsc` with `.next` excluded: the stale `.next/types/validator.ts` fails plain `tsc`, as before); whole-repo `biome check .` already 339 errors, 277 warnings, 251 infos, so lint is judged per changed file (0 new diagnostics in every part, compared with the parent). `tests/known-failures.txt` 0 entries, still 0.
- Memory at the start: 6.04 GB free, 0 node processes.

## Part 0. Commit the design files — `0124f30a`

- 62 files exactly as copied: LLD, runbook, 2 design PDFs, the contract, prototype v2, guide, 43 screenshots, 12 sprint prompts.
- **Contract typecheck:** the prescribed command `npx tsc --noEmit --strict --target es2022 --lib es2022 docs/prototypes/vunnara-ui-config.ts` **fails, but not on the contract**: 5 errors, all in `node_modules/@types` (node, react, react-dom: `Cannot find module 'undici-types'`, `'csstype'`, `ReferrerPolicy`). Without a tsconfig, tsc pulls in every `@types` package under classic resolution with no DOM lib. The contract itself has 0 errors: checked with a temp tsconfig (`types: []`, same flags) and with `--module esnext --moduleResolution bundler --skipLibCheck`. Proposed: change the command in the contract header and S00 to add `--types` none (a tsconfig with `"types": []`) or `--skipLibCheck --moduleResolution bundler --module esnext`. Not a stop: the contract compiles.
- `docs/` is outside `tsconfig.json`'s `include` (excluded) and biome's `files.includes`; no guard walks the repo root or `docs/`. No glob change.
- Tests: none (docs only). Playwright: not needed (no UI change).

## Part 0b. Token map, the four new tokens, D-UI1 — `ac570a4b`

- `docs/prototypes/token-map.md`. Summary:
  - **Colours:** 27 tokens. 1 match, 20 different (the app's value wins), 2 missing (`--accent-strong`, `--primary-btn-hover`), 4 new added.
  - **Type:** 23 roles, all different except kbd. The app uses a 10–14 px scale and 600-weight titles, with line height 1.5 inherited.
  - **Components:** 41. 6 exist, 28 partial, 7 missing (Stepper, QuestionRow, ReachHeader, DraftBar, Kbd, Combobox, Toast).
  - **Platform:** Tailwind defaults (640/768/1024); the shell switches only at 1024; lucide 1.17.0. No toast is mounted, and none of the 10 Radix packages is imported.
- **The four new tokens**, light and dark, with the contract's values (`app/globals.css`, both theme blocks):
  - `--border-control`, `--agency`, `--agency-soft` and `--warning-fg`.
  - Two are renamed (T-01, T-02). The app names a tint `-soft` and text on a colour `-fg`, and `tests/unit/design/token-contrast.test.ts` classifies tokens by those suffixes. The contract's `--agency-tint` (#F5F3FF) would fail it as a text colour at 1.0:1.
  - `--success-fg` and `--danger-fg` already have `--on-status`'s values, so only `--warning-fg` was missing.
  - Proposed contract amendment: use these names.
- **Contrast, by script with the app's values:** every pair passes. `accent-strong/accent-tint` can't be measured, because the app has no `--accent-strong` (T-04).
- **Conflicts:** T-01…T-07 (colours), TT-01…TT-43 (type, platform, layout), TC-01…TC-68 (components). The app wins by default. Section 7 of the token map lists six decisions for Sri:
  - web fonts: none is loaded, so Inter shows only where it's installed;
  - line heights for new components;
  - the score band at the rounding edge (9.6 shows "10%" in the Low colour);
  - toast vs inline feedback;
  - Upgrade link destination (`/pricing` vs `/settings/billing`);
  - an "unverified" EngineDots state.
- **D-UI1, app-wide** (no instruction otherwise). Text inputs, textareas and selects set their border inline, per screen (87 controls in 33 files, no shared Input). So the change is one rule in `app/globals.css`: on the control itself, `--border-default`, `--border-strong` and `--border-subtle` resolve to `--border-control`.
  - The two switches' off tracks (both under 3:1) use `--border-control`: `app/(auth)/settings/notifications/page.tsx:47` and `components/domain/communication/schedule-form.tsx:332`.
  - Checkboxes and radios keep the browser's own border, which is already above 3:1.
  - It's a visual change only, and not behind a flag.
- `.qa/` is in `.gitignore`.
- **Tests:**
  - `tests/unit/design/control-boundary.test.ts` (new): RED on the parent (11 of 12 fail; the 12th is a forward check), then GREEN.
  - `vitest related` (globals.css and the two switch files): 5 files, 69 passed.
  - Theme and colour guards (token-contrast, defined-tokens, no-hex-in-components, brand-mark, avatar-color, cookie-banner-offset, role-decisions-ui, no-page-fails-silently): 8 files, 126 passed.
  - Typecheck clean; lint 0 new.
- **D-UI1 screenshots:** taken: `.qa/screens/S00/brand-settings-1240-{light,dark}-{before,after}.png` and `add-brand-wizard-1240-{light,dark}-{before,after}.png` (1240 px), by a temporary Playwright spec on the e2e server (deleted, never committed; 2 runs, 0 node processes left after each). "Before" is the same page with D-UI1's rule undone by an injected style, which is the page as it was (D-UI1 changes only CSS on these two pages). Input, select and textarea borders go from barely visible to clearly visible in both themes. No visual snapshot tests exist to update.
- **Playwright:** `tests/qa/sprint9/features/f09-db-notif-prefs/f09-notifications-e2e.spec.ts`: **not run: memory**.

## Part 1. As-is verification — `5ea31481`

`docs/lld/as-is-verification.md`, the gate for S01.
- **Sections 3, 5 and line 211:** 97 confirmed, 18 different, 1 missing (`isBrandedPackPrompt`, deleted).
- The twelve questions are answered with file:line, and 27 proposed LLD amendments sit at the top. The ones that shape S01:
  1. Reports start at **Growth**: Free and Starter have none (and the Starter card lists "Email reports"). "Starter: Basic" would be a new entitlement, your decision.
  2. Branding is `agency_brand_assets`.
  3. Scheduled reports exist (`report_delivery_schedules`), but generation never reads the schedule row.
  4. The generate route takes only `{ periodLabel?, periodType }`; re-render rebuilds from live data.
  5. Finding rules are **a–f**, so the new ones should be **g–j**.
  6. The event is `audit.complete`.
  7. `action_items` has no status history (use `done_at`).
  8. There's no ABN field in the wizard or in brand settings.
  9. CDN Shield writes no visits.
  10. YouTube's "videos cited" has no source.
- Others:
  - Packs carry 3–5 branded questions, not up to 3.
  - `prompt_pack` is jsonb.
  - `CATEGORY_KEYS` has 28 keys.
  - Engine location parameters live in `openai-impl.ts` and `anthropic-impl.ts`.
  - About eight places fetch customer sites with no SSRF guard (S06 has more to migrate).
  - `max_prompts_per_audit` is never read.
  - Global tables can't be SELECT-only for `visibleau_app` (production grants and the drift guard require DML).
- Tests: none (docs). Playwright: not needed.

## Part 2. Feature-flag scaffold — `b99168cb`

- **`lib/flags/flags.ts`:** `FLAG_NAMES` (LLD §17's thirteen, equal to the contract's `FlagName`; a test holds both) and `isEnabled(flag, orgId)`.
  - Order: the workspace override, else the global value, else off.
  - Read once per request (`React.cache`). A read that fails is off, and logged.
  - Overrides are read under `withRlsContext`. No new `serviceDb`.
- **The store** (as-is 1.4): `feature_settings` (global), `org_feature_flags` (workspace, FORCE RLS) and `feature_setting_changes` (the Changes log).
  - `feature_settings` and `feature_setting_changes` are reached only through `lib/governance/google-surfaces.ts`, because `tests/unit/google-surfaces/switch-readers.test.ts` holds it as their one reader. Three new functions there refuse any Google key, so a flag can never change what Google AI does.
  - **Migration 0153 (flag keys):** widens the six-key CHECK to six plus thirteen. No rows.
- **`/api/admin/feature-flags`** (GET view, POST global or workspace): operators only, 403 otherwise, every access logged by user id.
  - A save of the value already in force is "unchanged" and writes nothing.
  - An override is also an Audit Trail entry in that workspace, in the same transaction ("{product} team").
  - Closed and sample workspaces are refused.
- **The Feature flags card on `/admin/settings`** (above Changes) loads its own view through `useLoad`: loading, "Couldn't load" with Try again, or the table.
  - It can't load server-side: the existing `tests/unit/api/admin-settings.test.tsx` renders the page with only the Google loaders mocked, and unit tests may not open a database.
  - Without the card, the page is as before.
- **Tests:** RED on the parent, then GREEN:
  - `tests/unit/flags/flags.test.ts`;
  - `tests/unit/admin/feature-flags-admin.test.tsx`;
  - `tests/integration/feature-flags.integration.test.ts`, as `visibleau_app`: defaults off, override wins both ways, expired override, Changes log and Audit Trail rows, no-op saves, RLS between workspaces, 403 reading and writing.
- **Related and guards:**
  - `vitest related`: 132 files, 1,463 passed. One 5 s timeout under load (`methodology-facts-and-sources`): 18 of 18 alone.
  - Guards naming the changed files, and cost visibility: 12 files, 727 passed.
  - RLS and grants (app-role-grants, s8-governance-db, db-role-check): 33 passed.
  - Google switches integration: passed (its "feature_settings is empty" precondition holds after the new test).
  - Typecheck clean; lint 0 new.
- **Playwright:** `tests/e2e/09-google-surfaces.spec.ts` (needs `PLATFORM_ADMIN_EMAILS=google-surfaces-operator@example.test` in its server's env) and `tests/qa/sprint1/features/f09-feature-flags/f09-feature-flags.spec.ts` (/pricing only): **not run: memory**.

## Part 3. Question phrasing — `adb68ce6`

- **`lib/prompts/phrasing.ts`:**
  - `toServicePhrase` uses LLD 8.8.1's acronym list.
  - `withArticle` puts no article before a plural or uncountable service, and "an" by sound ("an IT consultant", "an SEO agency", "a SaaS platform").
  - Two checks were added to `validateGeneratedQuestion`: a lower-case acronym, and "a/an + plural". IT is checked only in an IT-service context, never the pronoun ("is it worth it", "does it support…"). The checks look past the brand, its competitors and the place ("Seo Plumbing" is a name).
  - Doubled spaces were already refused.
- **Applied in `lib/prompts/build-prompt-pack.ts`**, where templates are filled (`templates.ts` only holds the text): `{service}`, intent signals, and the "good choice" question.
  - Brand names are trimmed in the branded questions and in `lib/verticals/expand-prompt.ts`.
  - The shuffle seed keeps the raw name, so which everyday questions are chosen doesn't change.
- **N1:** stored packs aren't rewritten, and the generator version isn't bumped. `tests/unit/audit/stored-pack-verbatim.test.ts` proves `getAuditPrompts` returns a stored pack with T3's old wording byte for byte. It passes on the parent too, by design.
- **Tests (`tests/unit/prompts/phrasing.test.ts`, RED on the parent):**
  - "managed it services" → "managed IT services"; "a good choice for a managed it services" → refused; the corrected text passes.
  - HVAC, NDIS, CCTV and SEO cases.
  - TechCore's pack rebuilt the way #52's was ("Is TechCore IT a good choice for managed IT services in Riverstone, NSW?"). The #52 texts themselves are production data: the local `visibleau_prod` copy is never-touch.
  - Every category template, vertical-pack template and service phrase passes both new checks: no question asked today is dropped for a new reason.
- **Related and guards:**
  - `vitest related`: 99 files, 1,643 passed. One timeout under load (`avatar-color`): 8 of 8 alone.
  - The 37 files that name the changed paths: 1,013 passed.
  - Placeholder, plan-claim (`pricing-claims`) and copy guards: 30 passed.
  - Typecheck clean; lint 0 new.
- **Playwright:** not needed (no UI change).

## Part 4. Brand display name and aliases — `70909f77`

- **Migration 0153 (brand aliases):** `brands.aliases text[] not null default '{}'` (at most 10) and `brands.name_suggestion text` (the wizard's suggestion, for the contract's C-21 help-line rule; the LLD's 7.7 didn't list it).
- **The name the wizard suggests:** `og:site_name`, then the title segment that matches the domain, then JSON-LD `name`, then the domain's words (`lib/brands/name-suggestion.ts`).
  - Served by `GET /api/brands/name-suggestion`: manage_brands only, 30 per user per 10 minutes, a plain host name only (no IP address, port, path or local name). It returns the name and aliases, never the page.
  - It reads the home page through the same crawler classification uses. **No new kind of fetch, but one more caller for S06's guarded fetcher**: a hostname that resolves to an internal address isn't guarded here, as everywhere today.
- **The wizard:**
  - It asks when the domain field is left and fills the name only while it's empty or still a suggestion ("Suggested from your website's name. Edit if it's different.").
  - The aliases it will save (domain label, and the name without spaces) show under the name ("Also recognised as techcoreit and TechCoreIT in AI answers. You can change these in Brand settings."), so none is added silently.
- **Brand settings (contract P01.identity.name, P01.aliases, P01 noPermission):**
  - The help line shows while the name equals the suggestion (C-21).
  - "Also known as" chips; "+ Add a name" opens a 36 px field (Enter adds, Esc cancels); × removes, with "Remove {value}"; the rules' own words; up to 10.
  - "View only. Owners and admins can change these settings." for other roles.
  - Test ids `p01-identity-name`, `p01-aliases`.
- **Deviations from the contract (proposed amendments):**
  - **Unique "as written", not "ignoring case":** S00's own test keeps both "techcoreit" and "TechCoreIT", which differ only in case. The sprint prompt ranks above the contract (runbook §2), and detection ignores case either way.
  - **No "editor" role exists:** manage_brands is owner and admin, so the view-only line says "Owners and admins".
  - **Layout kept:** brand settings keep their existing one-column layout (no visual change to an existing screen); the aliases field sits after Domain.
- **Detection:** `detectBrandMention` and `isBrandedPrompt` try the aliases with the name, through the same patterns. `answerMention` and the Google collector pass them.
- **N3:**
  - Stored mentions are never detected again; the two read-time rank recomputes still pass name and domain only, and a test pins that.
  - Every existing brand has aliases `'{}'`, for which detection equals today's, tested over sample answers.
  - The #50, #51, #54 and #55 answers are production data, not in the repo.
- **Tests (RED on the parent; 12 identity checks pass on both by design):**
  - `name-suggestion`: TechCore IT gives "TechCore IT" and the aliases "techcoreit", "TechCoreIT".
  - `mention-aliases`: "TechCore IT" and "TechCoreIT" are found.
  - `brand-aliases` (settings), `wizard-name-suggestion`.
  - `brand-aliases.integration`: POST, PATCH, the CHECK, a rename dropping an alias, and the route (401/403, IP refused, fallback, crawler mocked).
- **Existing-test effects:**
  - `tests/integration/__golden__/google-surfaces-off-parity.json` regenerated on purpose (`UPDATE_GOLDEN=1`). The only change is the brand rows' `"aliases": []` and `"nameSuggestion": null` (LLD 7.7 adds the column).
  - `brands-single`, `brands-patch-location` and `brands-edge-cases` failed on my first PATCH, which wrote aliases on every save. Fixed in the code: aliases are written only when they change.
- **Related and guards:**
  - `vitest related` (logic and UI files): 196 files, 2,168 passed. Three timeouts under load (`brand-settings-edit` ×2, `new-brand-setup`): 19 of 19 alone.
  - The 82 files that name the changed paths: 1,279 passed. Two timeouts (`avatar-color`, `brand-feature-locks`): 82 of 82 alone.
  - Schema drift passed.
  - Typecheck clean; lint 0 new (6 pre-existing in `wizard-form.tsx` and `brand-detail-client.tsx`, identical before).
  - Not run: `vitest related` on `db/schema/brands.ts`, which most of the suite imports (it would be a full run). The schema-drift guard and the API tests covered it instead.
- **Playwright** (02-brands-list, 03-brand-create, 04-brand-detail, 05-cross-org-isolation, 07-acceptance, sprint2-workflow, sprint3-visibility, s9-autopilot-e2e): **not run: memory**.

## Part 5. Directory registry — `d2e2cad1`

- **Migration 0153 (directory registry):** `directory_registry`, one row per domain pattern (a host, or host plus path: `linkedin.com/company`, so a person's profile is never LinkedIn the directory), grouped by `directory_key`.
  - Columns: kind, market, `applies_to` (trades / local / cited), checks.
  - Seeded with the 17 directories the list had (every field as before) and appendix B's 13, each "cited": shown only when cited, so no card or count changes unless an answer cites it.
  - Global, with no RLS. `visibleau_app` gets every table's grants (the LLD's "SELECT-only" conflicts with prod-fix 0052 and the drift guard: amendment 23).
- **`lib/directories/registry.ts`:** every function and output shape kept, plus `kind`, `relevance` and `pathPrefix` on each entry.
  - It reads what `lib/directories/registry-store.ts` loaded from the table (server only, five-minute cache).
  - The browser (it's bundled for the landing FAQ and the Action Center) and the unit tests (no database configured) use the seed, which is the migration's own rows; `registry-seed.test.ts` holds them identical.
- **Counting:** the brand's own type's directories as before, then any other enabled directory of its market that an answer cited, marked `relevantToBrand: false`.
  - The advice (recommendation evidence, the report's directory finding, the Action Center's names) reads the brand's own type's only, as before. When a cited-only directory counts as evidence is T7, in S01.
- **Display:** the audit panel and the PDF's "Where AI looks" give a cited-only directory its kind ("Local Business Guide · general directory").
  - **Difference from S00's text:** the brand's own type's rows don't show their kind, so that Hero's report changes only by added rows (S00's own acceptance). Every row's kind could come with `report_v2` (S01).
- **Tests (RED on the parent):**
  - `cited-registry-directories`:
    - TechCore #52's shape lists Local Business Guide (3), Directso (1), Whereis (1), Cylex (2), Nextdoor (1), Birdeye (1) and LinkedIn (2), with kinds.
    - The brand's own site, Reddit and a person's LinkedIn are never called directories.
    - Hero #54's shape: the ten relevant rows are unchanged, and a cited Hotfrog page adds one row and changes none.
    - The advice is unchanged.
  - `registry-seed`, `directory-kind` (panel and PDF; existing rows word for word), `directory-registry.integration` (seed, the store reading the table, checks, grants).
- **Existing tests whose expectation LLD 8.8.3 and appendix B change**, each edited only there:
  - `tests/unit/directories/registry.test.ts`: "names every AU directory" gains appendix B; "generic pattern" uses LinkedIn's `/company`; "no confirmed categories" now sees the ten trades and local ones.
  - `tests/unit/directories/citation-counts.test.ts`: "never appears in results at all" becomes "appears when cited, marked"; "short-circuits to zero queries" now means a market with no directories.
  - `tests/unit/brand-entity/no-automated-directory-lookups.test.ts`: `linkedin.com` is exempt like Google's domains (listed in `lib/trust/youtube-channel-lookup.ts`, never fetched); `au.linkedin.com` is still guarded.
  - The golden was regenerated again. Its only change is `kind` and `relevantToBrand: true` on the 20 existing directory rows: no row added, no count changed.
- **Related and guards:**
  - `vitest related`: 387 files, 4,183 passed. Four failures: the golden and the LinkedIn guard (both above), and two timeouts under load (`brand-feature-locks`, `set-rls-context`), 110 of 110 alone.
  - The 95 files that name the changed paths: 1,378 passed. One timeout in my own new test, fixed by warming the import.
  - RLS, grants and drift (app-role-grants, schema-drift, db-role-check, rls-tenant-query-guard, directory-registry): 18 passed.
  - Typecheck clean; lint 0 new (5 pre-existing, identical before).
- **Playwright** (03-brand-create, 09-google-surfaces, 10-not-found-and-errors, audit-running/running-to-finished, responsive/responsive-shell, `tests/qa/sprint4/features/f04-audit-results/f04-audit-results.spec.ts`): **not run: memory**.

## UI block (PROTOTYPE-GUIDE format)

```
P01 · Brand settings (S00: name help line, Also known as, view only)
Nodes: 3 of 17 built in S00 (P01.identity.name help line, P01.aliases, the noPermission note);
       P01.identity / P01.identity.domain existing; P01.abn: S01; P01.reach.*: S04
States: noPermission ✓ (the others belong to the reach card, S04; loading and error are the page's own)
Acceptance:
  ✓ With all three flags off the page equals today's page plus the aliases field (S00 adds no flag; the
    help line shows only for brands added with a site suggestion, so never for an existing brand)
  ✓ Aliases: up to 10, 2-60 characters, never the brand's name; + Add a name, Enter adds, Esc cancels,
    × "Remove {value}" (tests/unit/components/brand-aliases.test.tsx)
  ✓ test ids p01-identity-name, p01-aliases (+ p01-aliases-add, -input, -chip, p01-no-permission)
Screenshots: .qa/screens/S00/brand-settings-1240-light-after.png, brand-settings-1240-dark-after.png;
             390 px not taken (memory)
Deviations from the contract: the existing one-column layout kept (no visual change to an existing
  screen); aliases unique as written, not ignoring case (S00's own example); the view-only note says
  "Owners and admins" (no editor role exists)
```

## Non-regression (LLD section 4), per part

| | 0b | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| N1 stored packs asked as stored | n/a | n/a | n/a | stored-pack-verbatim; no generator bump | aliases only type questions for brands that have them (all `'{}'` today) | n/a |
| N2 question_set_hash | n/a | n/a | n/a | stored citations untouched | same | n/a |
| N3 headline for existing audits | n/a | n/a | n/a | n/a | mention-aliases (identity for `[]`, read-time recompute untouched) | advice reads relevant directories only |
| N7 RLS / no new serviceDb | n/a | n/a | feature-flags.integration as visibleau_app; app-role-grants | n/a | brands RLS unchanged; brand-aliases.integration | directory_registry global (documented); app-role-grants, schema-drift |
| N10 plan claims via tiers.ts | n/a | n/a | n/a | pricing-claims | n/a | n/a |
| N11 costs operator-only | n/a | n/a | no-cost-for-customers | n/a | n/a | n/a |
| N12 no placeholder / production writes only by run sets | n/a | n/a | 0153 run set | no-placeholders guard | 0153 run set | 0153 run set |
| N13 Inngest ids | unchanged | unchanged | unchanged | unchanged | unchanged | unchanged |
| N14/N15 PDF for Hero | n/a | n/a | n/a | n/a | golden: only the two new brand fields | directory-kind (existing rows word for word); golden: only kind/relevantToBrand fields |

## Commits

```
d2e2cad1 feat(directories): S00 part 5 -- the directory registry is a table ...
70909f77 feat(brands): S00 part 4 -- the brand's name from its own site ...
adb68ce6 fix(prompts): S00 part 3 -- question phrasing ...
b99168cb feat(flags): S00 part 2 -- the client-enhancements feature flags ...
5ea31481 docs(lld): S00 part 1 -- as-is verification ...
ac570a4b feat(theme): S00 part 0b -- the UI contract mapped onto the app ...
0124f30a docs(lld): S00 part 0 -- commit the Vunnara client-enhancements pack v1.5 ...
```

`git log origin/main..main --oneline`: these seven plus this report's commit. Nothing pushed.

## Push notes

1. **Migration 0153 first**, run1 → run2 → run3 (`db/prod-fixes/0153-s00-run1-precheck.sql`, `-run2-apply.sql`, `-run3-post-check.sql`), before the push. Take a pg_dump of `feature_settings` and `brands` before run2. run2 is three transactions: flag keys (CHECK widened, no rows), brand aliases (two columns), directory registry (table + 35 rows). run3 must show 19 allowed keys and 0 flag rows; both columns with defaults and 0 brands with aliases or suggestions; 35 rows / 30 directories / 13 cited, no RLS, app grants t. run4 undoes all three, only with the old code deployed (it drops owners' aliases: dump first). The whole set was run on the local dev database as run4 → run1 → run2 → run3, all checks as expected.
2. **Inngest resync: no.** No function added, renamed or changed in its steps.
3. **Safe while an audit runs: yes.** Running audits read their brand row at the start; the new columns have defaults; directory counting falls back to the code's identical rows if the table can't be read.
4. **Flags: all 13 off** (no `feature_settings` or `org_feature_flags` rows). Nothing reads them yet; S01 wires `report_v2` and `abn_suggestion`.
5. **D-UI1 is not behind a flag** (every form's control borders, both switches). Its screenshots were taken (see Part 0b); the Playwright specs for the changed controls were **not run: memory** and must pass before the push.
6. Local databases: 0153 (all three files) applied to `visibleau`, `visibleau_e2e`, `visibleau_integration` and `visibleau_test`; `visibleau_e2e` and `visibleau` also took 0152, which they lacked.

## Playwright: not run (memory)

Free memory was 3.4–6.4 GB through the sprint; each spec needs a fresh e2e server (3–5 GB). They must pass before the push (D-UI1 is unflagged); paste this list into the runbook's "Run Playwright specs that were skipped for memory" kickoff:

- `tests/qa/sprint9/features/f09-db-notif-prefs/f09-notifications-e2e.spec.ts` (Part 0b: the notifications switch)
- `tests/e2e/09-google-surfaces.spec.ts` (Parts 2, 5; its server needs `PLATFORM_ADMIN_EMAILS=google-surfaces-operator@example.test`)
- `tests/qa/sprint1/features/f09-feature-flags/f09-feature-flags.spec.ts` (Part 2; /pricing only, matched on the words "Feature flags")
- `tests/e2e/02-brands-list.spec.ts`, `tests/e2e/03-brand-create.spec.ts`, `tests/e2e/04-brand-detail.spec.ts`, `tests/e2e/05-cross-org-isolation.spec.ts`, `tests/e2e/07-acceptance.spec.ts` (Part 4)
- `tests/e2e/sprint2/sprint2-workflow.spec.ts` (2 shards), `tests/e2e/sprint3/sprint3-visibility.spec.ts`, `tests/e2e/sprint9/s9-autopilot-e2e.spec.ts` (Part 4)
- `tests/e2e/10-not-found-and-errors.spec.ts`, `tests/e2e/audit-running/running-to-finished.spec.ts`, `tests/e2e/responsive/responsive-shell.spec.ts` (8 shards), `tests/qa/sprint4/features/f04-audit-results/f04-audit-results.spec.ts` (Part 5)

Compare failures with `tests/e2e/known-failures.txt` by name (`npx tsx scripts/qa/compare-failures.ts --e2e <output>`).

## Proposed changes to the documents (for Sri and Claude chat)

- **S00 / contract header:** the contract typecheck command needs `types: []` or `--skipLibCheck --moduleResolution bundler --module esnext` (Part 0).
- **Contract:** `--agency-tint` → `--agency-soft`, `--on-status` → `--warning-fg` (+ `--success-fg`, `--danger-fg`); the `map` tokens' values → the app's (token-map section 1); `--accent-strong` → `--accent-blue`; P01.aliases "unique ignoring case" → "unique as written"; P01 noPermission copy → "Owners and admins" (there is no editor role); the EvidenceLine note ("production already uses mono") is wrong (TC-34); the TT/TC conflicts in the token map.
- **LLD:** the 27 amendments at the top of `docs/lld/as-is-verification.md`; plus 7.7 needs `brands.name_suggestion` (for C-21) and `directory_registry` needs `directory_key`, `applies_to` and `sort_order` (the existing list's behaviour); 8.8.3 "with its kind" is shown for cited-only directories in S00.
- **Runbook:** `docs/sprints/` is `docs/Sprints/` in git; the table in section 10 (S01 gate "0153 applied") holds: S00 used one number, 0153, as three files (`0153_feature_flag_keys.sql`, `0153_brands_aliases.sql`, `0153_directory_registry.sql`) with one run set.

## Memory and processes

Start: 6.04 GB free, 0 node processes. The only server this session started was Playwright's own e2e server for the D-UI1 screenshots (two runs); after each, 0 node processes were left. End: 6.16 GB free, 0 node processes.

## Tests skipped by the testing-scope rules

Full suites: not run (not asked). `vitest related` on `db/schema/brands.ts` (Part 4): not run, it would select most of the suite; covered by schema-drift and the API tests. No `next build`.
