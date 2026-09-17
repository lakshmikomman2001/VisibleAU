// Blocks `drizzle-kit generate` / `drizzle-kit push` in this repo.
// See db/migrations/README.md for why: the drizzle-kit snapshot tracking is
// stuck at migration 0011 (migrations 0012+ are hand-written and applied via
// `psql -f`), so `generate`/`push` don't know about ~18 migrations of real
// schema history and will produce wrong or colliding output (confirmed: it
// once generated a migration numbered 0012, colliding with the real
// 0012_subscriptions_table.sql).
console.error(`
✗ Blocked: drizzle-kit generate/push must not be run in this repo.

  Reason: this repo's migration ledger includes hand-written migrations
  (0012 onward) applied directly via "psql -f", which were never fed back
  into drizzle-kit's snapshot tracking. Its tracked snapshot is stuck at
  migration 0011, so "generate" and "push" will produce incorrect or
  filename-colliding output against the real schema history.

  Instead:
    - To check for drift between the TS schema and a live database, run:
        pnpm db:drift
    - To make a schema change, hand-write a new migration file
      (db/migrations/00NN_description.sql) and apply it with psql -f.

  See db/migrations/README.md for details.
`);
process.exit(1);
