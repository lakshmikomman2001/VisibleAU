# S00 — Verify the LLD against the code, quick wins, feature flags

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/sprints/reports/S00-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` as Sri has pushed it (`15f287b` on 20 Nov 2026 or later); say which hash you started from. The start step has copied these into the repo: `docs/lld/vunnara-client-enhancements-lld-v1.md` (the LLD, v1.2), `docs/lld/CLAUDE-CODE-RUNBOOK.md` (how every sprint runs), `docs/lld/design/*.pdf` (design documents, reasoning only), the sprint prompts in `docs/sprints/`, and in `docs/prototypes/`: `vunnara-ui-config.ts` (the UI contract, canonical for every screen), `client-enhancements-v2.html` (the visual, rendered from the contract), `PROTOTYPE-GUIDE.md` (how to build a screen from the contract) and `screens/*.png` (static screenshots). Read LLD sections 1, 3, 4, 5, 7.7, 8.8.1–8.8.3, 9, 15, 17, the prototype guide, and the contract's `precedence`, tokens, `components`, `conflicts` and `screens` entries P00 and P01 before changing anything.

**Rules (every part):**
- One commit per numbered part; don't amend; commit only in a separate step after the tests have finished, never chained with `;`. **Never push.**
- Testing (CLAUDE.md "Testing scope" and the project rule): targeted only. Related tests, new tests RED on the parent commit then GREEN, typecheck, lint, compared by name with `tests/known-failures.txt` (0 entries; keep it 0), and the source-scan guards named in each part. Full suites only if Sri asks. Playwright only in parts that change a screen or a shared UI component: run the specs `scripts/qa/e2e-specs-for.ts` maps to the files that part changed, one at a time, only with ≥ 6 GB free (otherwise "not run: memory" and list the specs). Parts that change only data, jobs, scoring, APIs or PDF rendering don't run Playwright; say "Playwright: not needed (no UI change)".
- ⛔ No mock data in production. Claim only what the product does. No `any`. FORCE RLS on every new org table; no new `serviceDb` in request paths. No production writes: a migration is a `db/prod-fixes/<n>-run1..run4` set for Sri (run1 read-only preview, run2 apply, run3 verify incl. grants to `visibleau_app`, run4 rollback).
- Non-regression: LLD section 4 (N1–N14). For each part, list which guards you ran.
- If the LLD contradicts the code, the code wins: report the difference with file:line and the LLD amendment you propose; continue only with independent parts.

## 0. Commit the design files
- Commit the LLD, the runbook, `docs/lld/design/`, `docs/sprints/` and everything in `docs/prototypes/` exactly as copied (no edits). Never commit `docs/latets/`. If any file is missing, stop and say so.
- Check the contract compiles on its own, without touching the repo's tsconfig: `npx tsc --noEmit --strict --target es2022 --lib es2022 docs/prototypes/vunnara-ui-config.ts` (using the repo's TypeScript). Report the result; if it fails, stop and report the errors (don't edit the file).
- If `docs/` is inside the app's lint or typecheck globs and the contract file trips them, exclude `docs/prototypes/` from those globs in the same commit and say so.

## 0b. UI ground-truth audit: the token map (no new screens)
Building from prose let separate builds drift apart before (one audit on another project found 54 conflicts). Do the audit first, once:
- Write `docs/prototypes/token-map.md` with four tables:
  1. **Colours:** every token in the contract's `color` → the app's variable or Tailwind class (file:line), the app's light and dark values, and match / different / missing.
  2. **Type roles:** every entry in `typography` → the class or style the app uses for that role today (file:line), exact or different (state the app's value).
  3. **Components:** every entry in `components` → the existing component (path), the variants and states it already has, what's missing (e.g. an accent Button variant, Stepper, EngineDots), and the extension you propose. No code yet.
  4. **Platform:** viewport breakpoints, icon library, toast, tooltip, dialog, sheet/drawer, combobox/command, dropdown menu, skeleton, and how the app shell behaves at ≤ 640 px (file:line for each).
- List every difference between the contract and the app as a conflict row (id T-01…, where, app value, contract value, proposed resolution; default: **the app's value wins** and the contract gets amended). Re-measure WCAG contrast with a script (not by eye) for every pair in the contract's `contrast` whose token maps to a different app value; list any pair below its threshold.
- Add the four tokens with status `new` (`--border-control`, `--agency`, `--agency-tint`, `--on-status`) to the app theme in light and dark with the contract's values. No component uses them yet.
- Decision D-UI1 (default app-wide unless Sri said otherwise when he pasted this prompt): point the existing form-control border (inputs, textarea, select, checkbox, switch track when off) at `--border-control` values so control boundaries reach 3:1. Visual change only. Before/after screenshots of two existing pages with forms (brand settings and the add-brand wizard) at 1240 px, light and dark, into `.qa/screens/S00/` (one Playwright run at a time, ≥ 6 GB free, else "not run: memory"). If visual snapshot tests exist, update only the affected snapshots and list them.
- Add `.qa/` to `.gitignore` if it isn't there.
- Tests: typecheck, lint, and the existing tests for any component whose styles changed. Guards: none expected beyond typecheck and lint.

## 1. As-is verification report (no code changes)
Write `docs/lld/as-is-verification.md`: for **every** statement marked VERIFY in the LLD and every file, table, column, function and event named in LLD section 5, record: confirmed / different (with what the code actually does, file:line) / missing. Also answer:
1. Where the hard-coded directory list lives and its full contents.
2. How stored packs are typed branded vs everyday today (exact function and lines), and whether `citations.is_branded_prompt` is always written.
3. The full `CATEGORY_KEYS` list.
4. The platform-settings store used by `/admin/settings` for Google AI (table, columns, Changes log), and whether it supports workspace overrides for arbitrary keys.
5. The audit-complete event name and every function listening to it.
6. Whether `brands.aliases` already exists, and how mention detection uses name/domain today.
7. Whether the YouTube check, the ABN check (`ABN_LOOKUP_GUID`) and robots/crawler checks produce real measurements in production code paths (no stub branches left), with file:line.
8. Where the Wilson (or other) confidence interval is computed.
9. How `report_templates.sections` is used today, if at all.
10. The existing directory-links store behind "Directory listings" in brand settings.
11. What `market_ai_budget_policies.max_prompts_per_audit` controls today and how it must interact with per-plan question limits and packs (LLD 7.6, 8.3.5).
12. Reports, for the report tiers (LLD 8.1.7): where plan entitlements live (`tiers.ts` or other) and whether Free can generate reports; the brand reports page (route, columns, statuses, how it learns a render finished); the generate route and render job (request body, function id); how the PDF cover is built in `report-document.tsx`; where report branding is stored (table, columns, route, who can edit); and whether scheduled or automatic report generation exists (table, cron, function id).
Commit the report. **This part is the gate for every later sprint**; list any LLD amendments you propose at the top.

## 2. Feature-flag scaffold (LLD 17)
- `lib/flags/flags.ts`: `isEnabled(flag, orgId)` reading the platform-settings store from Part 1.4 (global value + workspace override), cached per request; typed flag names from the LLD table; default **off** for every flag.
- `/admin/settings`: a "Feature flags" card (operators only) listing each flag with global switch and per-workspace override, written to the existing Changes log (no-op saves not logged, as fixed on 19 Nov).
- If the store can't hold arbitrary keys, propose the smallest additive migration (run1–run4 set) and implement against it.
- Tests: default off; override wins; non-operator can't read or write (403); Changes log rows.
- Guards: cost-visibility, RLS suite.

## 3. Question phrasing: acronyms, articles, spaces (LLD 8.8.1, T3)
- `lib/prompts/phrasing.ts` with `toServicePhrase()` (acronym list from the LLD) and `withArticle()`.
- Use it in `lib/prompts/templates.ts` substitution, `buildEnrichedPrompts` (branded), `lib/verticals/expand-prompt.ts`.
- `validateGeneratedQuestion`: reject lower-case acronyms from the list, "a/an + plural", doubled spaces; trim brand names before substitution.
- **Stored packs are not rewritten** (N1). Prove it: a test that `getAuditPrompts()` for a brand with a stored pack returns it byte for byte.
- Tests: "managed it services" → "managed IT services"; "a good choice for a managed it services" → "a good choice for managed IT services"; HVAC, NDIS, CCTV, SEO cases; a regression test using TechCore IT's audit #52 question texts.
- Guards: placeholder guard, plan-claim guard.

## 4. Brand display name and aliases (LLD 8.8.2, T2)
- Migration 0153 part A: `brands.aliases text[] not null default '{}'` (skip if Part 1.6 found it exists).
- Name suggestion when adding a brand: from `og:site_name`, then the title's brand segment, then JSON-LD `name`, then the domain label; the user can edit (prototype P01 help text).
- Aliases: the domain label and the no-space form are suggested; editable as chips in brand settings ("Also known as", P01).
- UI exactly as the contract's nodes `P01.identity.name` and `P01.aliases` (copy, limits, add/remove behaviour, test ids) and P01's `noPermission` state; report them in the guide's per-screen format.
- Mention detection and branded-question detection include aliases through the one shared normalisation function.
- Tests: TechCore IT → suggests "TechCore IT", aliases "techcoreit", "TechCoreIT"; mention detection finds "TechCore IT" and "TechCoreIT"; existing audits' mention counts unchanged (N3: snapshot tests on #50, #51, #54, #55 fixtures).

## 5. Directory registry (LLD 7.7, 8.8.3, appendix B, T6)
- Migration 0153 part B: `directory_registry` (global, SELECT-only for `visibleau_app`), seeded with the current hard-coded list (Part 1.1) plus appendix B.
- Replace the hard-coded list with a cached registry read (`lib/directories/registry.ts`), keeping the same output shape for existing callers.
- The directories card and report "Where AI looks" show any cited registry directory with its kind; unknown domains are never labelled directories.
- Tests: TechCore IT #52 fixture now lists Local Business Guide, Directso, Whereis, LinkedIn, Nextdoor, Birdeye, Cylex with counts; Hero #54 fixture output unchanged except added directories that were actually cited.
- Write the 0153 run1–run4 set (run1: shows current list vs seed; run3: counts and grants).

## Report-back
- For each part: file:line, what changed, tests (commands, RED/GREEN, compared by name), guards run, Playwright run, "not run: memory" (with the specs) or "not needed (no UI change)".
- Part 0: the contract typecheck result.
- Part 0b: the token map summary (matches, differences, missing), every T-conflict with its proposed resolution, contrast failures if any, the D-UI1 before/after screenshot paths, and the files changed.
- Part 1: the full verification report summary and every proposed LLD amendment.
- Commit hashes and `git log origin/main..main --oneline`.
- Push notes: migration 0153 first (run1→run2→run3), Inngest resync (expected: no), safe while an audit runs (expected: yes), flags all off; the only visual change is control borders (D-UI1), which is not behind a flag, so its before/after screenshots and the Playwright specs for the changed controls must have run before Sri pushes (if they were "not run: memory", say so first in the report).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
