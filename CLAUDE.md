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
