@AGENTS.md

# Never push, deploy, or touch a remote

Never run `git push`, `vercel`, `neon`, or any command that changes a remote, a deploy, or a production
database. Commit locally only — Sri pushes after prod checks have been run and confirmed. If a prompt says
something like "run after X is pushed" or "once this is live," that is a precondition to check (has it actually
happened?), never an instruction for Claude Code to make it happen. If the precondition isn't met, stop and
say so — don't push to satisfy it, even if asked a clarifying question about it first.

# Database Safety

## NEVER run `drizzle-kit push`
`drizzle-kit push` applies Drizzle schema diffs directly to whichever database DATABASE_URL points at — bypassing the hand-written migration ledger. It once created AA tables on prod with wrong types (TEXT instead of INET/CIDR, missing CHECKs, no RLS). Use `drizzle-kit generate` to produce a migration file, review it, then apply via `psql -f`.

## Two databases
- `visibleau` — dev (reference schema, safe to experiment on)
- `visibleau_prod` — production (write ONLY when explicitly authorized)

Default all work to dev. Production changes require explicit user authorization and a pg_dump backup first.

## Test databases (13 Nov 2026)
- `visibleau_integration` — the vitest "integration" project only (vitest.config.ts and
  tests/integration/global-setup.ts refuse anything else; tests/helpers/integration-database.ts). Create and
  migrate it with `pnpm db:setup:integration`, and run that again after each new migration, as for `visibleau`
  and `visibleau_e2e`. Its tests may truncate it freely.
- `visibleau_e2e` — Playwright only (the specs, `pnpm e2e:server`, the seed scripts). No integration test may
  touch it: a phase2 sprint4 test's `truncateAll()` once removed user 1's membership and all 336 vertical-pack
  prompts there. Restore it with `pnpm seed:e2e-users` and `scripts/ops/seed-vertical-packs.ts`, never
  `pnpm seed` (it fabricates subscriptions for every workspace).

# Git worktrees

Never symlink or junction `node_modules` into a git worktree or any temporary copy of this repo. Removing a
worktree walks into a symlinked `node_modules` and deletes the real one underneath — this has happened twice.
Inside a worktree, either run `pnpm install` there (its own real `node_modules`) or don't use a worktree at
all (e.g. `git show <commit>:<path>` for a one-off file read).

# Testing scope (Sri, 31 Oct 2026)

Tasks were taking 3+ hours, mostly in the full suites (about 2,200 unit and 2,800 integration + phase2 tests at
`--maxWorkers=1`).

1. **Never run the full suites unless Sri explicitly asks in that task** ("run the full test suite", "full
   suites", "full regression"). That covers `vitest run tests/unit`, `vitest run tests/integration tests/phase2`,
   and any equivalent whole-suite command. A prompt that asks for "suite counts" doesn't count as asking; Sri's
   own words in the task do.
2. **By default, for every task:**
   - `vitest related <changed source files> --run`, so only the tests that import what changed run.
   - The new or changed test files themselves: prove each RED on the previous commit's code and GREEN on the new
     code, running only those files, never the suites.
   - Typecheck (`tsc --noEmit`) and lint/format on the changed files.
   - A Playwright spec only when the task touches sign-in/auth, the app shell, layout or mobile pages, and then
     only the relevant spec.
   - After a UI copy or route change, `npx tsx scripts/qa/e2e-specs-for.ts <changed files>` lists the Playwright
     specs that import, name or quote what changed (`vitest related` never selects them). Run each, one file at
     a time, if 6 GB is free; otherwise list them in the report as "not run". Compare their failures by name with
     `tests/e2e/known-failures.txt`: `npx tsx scripts/qa/compare-failures.ts --e2e <saved output>`.
   - Don't run `next build` unless asked. Vercel builds every push, and a failed build there leaves the previous
     deployment live.
3. **Never run a build and a test run at the same time.** It crashed the machine on 31 Oct 2026. The same goes for
   a dev server or Playwright: never at the same time as vitest or a build.
4. **Flaky test:** the 150 ms rate-limit window test (`tests/integration/rate-limit-fallback.integration.test.ts`)
   is a known flake. If it fails, re-run that file alone up to 3 times and report it. Don't chase it.
5. **In every report:** list each test command and its result. If you skipped something because of this section,
   say so in one line.
6. **The baseline is `tests/known-failures.txt`, by name.** It was emptied by the 9 Nov 2026 triage (all 46 old
   entries fixed or updated); from 10 to 11 Nov it held one entry, the legal-name placeholder test, gone when Sri
   set the name and ABN. It's empty now: every failure is new. An accepted failure goes in only with its reason on the same
   line (`<test>    # why`). A `vitest related` run fails only the part of it that it selects, so compare every
   run's failures with it **by name, never by count**:
   `npx tsx scripts/qa/compare-failures.ts <saved vitest output>` lists any failure that isn't in it. When Sri asks
   for the full suites, run them with `--maxWorkers=1`. Report any difference with the commit that introduced it.
7. **Never leave orphaned processes (1 Nov 2026).** A crashed Playwright run left 926 orphaned Turbopack/node
   workers holding 42 GB on this 15.4 GB PC, which most likely froze the browser during audit #38.
   - If free memory is under 3 GB at the start of a task, report the top 5 memory users before running anything.
   - Before any Playwright spec or dev server: report the free memory. **Don't start with less than 6 GB free.**
   - After every Playwright run, dev server or build, including one that crashes or times out: confirm its
     processes have exited, stop any leftovers this session started, and report the count. Only stop processes
     this session started (their command line has this repo's path); other `node` processes aren't yours.
   - At the end of any task that started a dev server: report the free memory and the `node` process count.
