# Claude Code — FIX the test-suite flakiness: 8 intermittent failures from concurrent-fork DB cleanup (deadlock/FK)

## The problem (a real defect in the SUITE — the thing we're building)
Full unfiltered suite: 120 files / 1822 tests, but **8 tests in `tier-source` + `sprint2-workflow-integration` FAIL
INTERMITTENTLY** — Postgres deadlocks / FK-constraint violations when `pool: "forks"` runs DB-touching integration
files CONCURRENTLY against the SAME dev database, so their `TRUNCATE CASCADE` / `DELETE` cleanup steps race.

This is not a product bug — but an intermittently-red suite is a BROKEN suite for its purpose: every future run has a
coin-flip red that people learn to shrug off ("just the deadlock"), which is exactly the "ignore-the-red" failure that
lets the next real regression hide. A green run must MEAN something. Fix the flakiness so the full suite is RELIABLY
green — this is the last thing before the suite baseline is trustworthy for Sections 3-5.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` (`DEV_DATABASE_URL`), never prod. vitest with
`pool: "forks"`.

## STEP 1 — Establish the current config + how the DB-touching tests clean up
```bash
cat vitest.config.* 2>/dev/null
grep -rn "pool\|poolOptions\|forks\|fileParallelism\|maxForks\|singleFork\|isolate\|sequence" vitest.config.* vitest.workspace.* 2>/dev/null
# Which integration files hit the DB + how do they clean up?
grep -rln "TRUNCATE\|DELETE FROM\|db.delete\|db.execute\|beforeEach\|afterEach\|beforeAll" tests/ | head
grep -rn "TRUNCATE\|db.delete\|DELETE FROM" tests/**/tier-source*.ts tests/**/sprint2-workflow-integration*.ts tests/**/*.integration.test.ts | head -20
# Confirm the intermittent set:
<repo test cmd> run 2>&1 | grep -iE "deadlock|foreign key|violates|FAIL" | head
```
Report: current pool config; the full list of DB-touching integration files; and HOW they clean (TRUNCATE CASCADE vs
scoped DELETE vs transaction). This determines which fix fits.

## STEP 2 — Apply the LEAST-INVASIVE reliable fix (serial execution of the DB integration files)
The root cause is CONCURRENT cleanup on SHARED tables. Simplest robust fix: stop running the DB-touching integration
files in parallel forks. Pick the mechanism that fits the repo's vitest setup:

**Option A (preferred — a separate serial project/workspace for integration):** if using vitest workspace/projects,
put the DB integration tests in a project with `fileParallelism: false` (or `poolOptions.forks.singleFork: true`), while
unit/pure tests keep full parallelism. Fast unit suite stays fast; only the DB files serialize.
```ts
// vitest.workspace.ts (or projects in vitest.config)
export default defineWorkspace([
  { test: { name: 'unit',        include: ['tests/unit/**','tests/phase2/**/*.test.ts'], /* parallel */ } },
  { test: { name: 'integration', include: ['tests/integration/**','tests/**/*.integration.test.ts'],
            fileParallelism: false,                 // serialize DB-touching files → no concurrent cleanup
            poolOptions: { forks: { singleFork: true } } } },
]);
```

**Option B (single global, simpler):** if there's one config, add `poolOptions: { forks: { singleFork: true } }` for the
integration run, or run integration separately with `--no-file-parallelism`. Add an npm script:
```json
"test:integration": "vitest run --no-file-parallelism tests/**/*.integration.test.ts",
"test:unit": "vitest run tests/unit tests/phase2/**/*.test.ts",
"test": "vitest run"   // full suite — with the integration files serialized via config
```

**Option C (more robust, more work — only if serial speed bites):** isolate DATA per fork so cleanup never races — each
worker uses its own schema `test_${process.env.VITEST_POOL_ID ?? VITEST_WORKER_ID}` (set search_path in setup), or wrap
each test in a transaction that ROLLS BACK (no TRUNCATE at all). Note this as the graduation path; don't build it now
unless serial is too slow.

**Pick A if the repo has projects/workspace; else B.** The goal: DB-touching files do NOT run cleanup concurrently.

## STEP 3 — Also scope the cleanup (defense in depth, if quick)
If the failing files use `TRUNCATE ... CASCADE` on shared tables, that's the FK-race source. Where feasible, prefer
SCOPED cleanup (delete only the rows this test created, by test-run id / seeded ids) over TRUNCATE CASCADE — so even if
two files overlap, they don't clobber each other's FK graph. Report whether the failing files use CASCADE truncate; if
the serial fix (STEP 2) fully resolves it, this is optional — note it as a hardening follow-up.

## STEP 4 — VERIFY reliably green: run the FULL suite 3× back-to-back
Flakiness only shows on REPEAT runs — one green run does NOT prove it's fixed.
```bash
for i in 1 2 3; do echo "=== RUN $i ==="; <repo test cmd> run 2>&1 | tail -4; done
```
- All 3 runs: 120 files / 1822 tests, **0 failures each time** (the 8 intermittent ones now consistently pass).
- Confirm NO deadlock / FK-violation lines in any of the 3 runs.
- Confirm the fix did NOT change coverage (still 120 files, ~1822 tests — nothing skipped/excluded to "fix" it).
- Report the total wall-time delta (serializing the DB files costs some time — report it so the tradeoff is known).

## Report back
1. Current pool config + which files were racing + their cleanup method.
2. The fix applied (A/B/C) + the config/script change.
3. **3 consecutive full-suite runs, all 120/1822, 0 failures** (the proof it's non-flaky now).
4. Whether TRUNCATE CASCADE is still used (hardening follow-up) + the wall-time cost of serialization.

## Constraints
- Fix the FLAKINESS, do not MASK it — no `.skip` on the 8 tests, no excluding the files, no retry-until-green. Coverage
  stays 120/1822; the tests must actually PASS reliably, not be silenced.
- Serialize ONLY the DB-touching integration files — keep unit/pure tests parallel (don't slow the whole suite).
- Dev DB `visibleau`, never prod.
- The proof is 3 consecutive clean full runs — a single green run is not sufficient for a flaky-test fix.

## NOTE
Flaky = broken, for a suite's purpose: you can't trust green if 8 tests coin-flip red. The cause is concurrent forks
running TRUNCATE/DELETE cleanup on the same DB — serialize the DB-touching integration files (fileParallelism:false /
singleFork) so cleanup never races; keep unit tests parallel. Do NOT skip/exclude/retry to force green — that MASKS it
and reintroduces the ignore-the-red problem. Prove it with 3 consecutive full runs at 120/1822, 0 failures. Then the
suite baseline is genuinely trustworthy and Section 3 (Frontend Unit) builds on solid ground.
