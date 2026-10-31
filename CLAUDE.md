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
   - Don't run `next build` unless asked. Vercel builds every push, and a failed build there leaves the previous
     deployment live.
3. **Never run a build and a test run at the same time.** It crashed the machine on 31 Oct 2026.
4. **Flaky test:** the 150 ms rate-limit window test (`tests/integration/rate-limit-fallback.integration.test.ts`)
   is a known flake. If it fails, re-run that file alone up to 3 times and report it. Don't chase it.
5. **In every report:** list each test command and its result. If you skipped something because of this section,
   say so in one line.
6. **When Sri asks for the full suites:** run them with `--maxWorkers=1`. The baseline is unit 28 failed / 6 files
   and integration + phase2 18 failed / 5 files. Compare the failing **sets** against the baseline lists, and
   report any difference with the commit that introduced it.
