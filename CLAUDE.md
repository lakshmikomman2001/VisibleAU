@AGENTS.md

# Database Safety

## NEVER run `drizzle-kit push`
`drizzle-kit push` applies Drizzle schema diffs directly to whichever database DATABASE_URL points at — bypassing the hand-written migration ledger. It once created AA tables on prod with wrong types (TEXT instead of INET/CIDR, missing CHECKs, no RLS). Use `drizzle-kit generate` to produce a migration file, review it, then apply via `psql -f`.

## Two databases
- `visibleau` — dev (reference schema, safe to experiment on)
- `visibleau_prod` — production (write ONLY when explicitly authorized)

Default all work to dev. Production changes require explicit user authorization and a pg_dump backup first.
