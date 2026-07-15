# FIX S9-MED-07 (F21) + S9-LOW-06 (F22) — `date_trunc` truncates in AEST · `getProgressSummary` drops its `tx`

Both found by Section 2's **live-DB** tests. Neither was visible to Section 1 (which could only grep
the source) — **this is the payoff for testing against a real Postgres.**

---

# F21 [MEDIUM] — `date_trunc('month', now())` uses the SERVER timezone (AEST), not UTC

## The finding
`lib/workflow/progress-summary.ts:16`
```sql
date_trunc('month', now())     -- ← truncates in the Postgres server's timezone
```
The Postgres server timezone is **`Australia/Sydney`**. So the month boundary lands at
**2026-06-30T14:00Z**, not **2026-07-01T00:00Z**.

**Impact:** tasks completed in the **~10-hour window** between `2026-06-30 14:00 UTC` and
`2026-07-01 00:00 UTC` are counted in the **wrong month** — they appear in July's "Work Completed"
when they belong to June (or vice versa at every month boundary).

**Canon (LLD 7895–7931) binds UTC explicitly — and explicitly NOT AEST.** This violates it.

## Why this matters beyond the bug
**F2's fix MOVED the bug rather than removing it.** We corrected the JS-side local-time month; the
**SQL-side `date_trunc` was independently timezone-dependent**. Only a real Postgres with a non-UTC
server timezone reveals that — a mock returns whatever we tell it to. Two layers, same bug class, and
fixing one made the other invisible.

## Task
```bash
cd c:/startup/VisibleAU/src
grep -rn "date_trunc\|now()" lib/workflow/progress-summary.ts
# And sweep for the SAME bug elsewhere — this pattern may be repeated:
grep -rn "date_trunc" lib/ app/ --include=*.ts | grep -v "AT TIME ZONE"
```

**Fix:**
```sql
date_trunc('month', now() AT TIME ZONE 'UTC')
```
Apply to **BOTH** filters (Work Completed AND Measured Impact — they share the month predicate).

⚠️ **Sweep for other instances.** If `date_trunc` (or any `now()`-based month/day bucketing) appears
elsewhere — visibility trends, drift alerts, usage metering, audit scheduling — **it has the same
bug.** Report every hit; fix the ones in S9's scope and list the rest as carried findings.

## Verify — the test that must go RED without the fix
Section 2 already has the AEST/UTC fixture. Strengthen it so it **fails on the unfixed code**:
- Insert `completed_at = '2026-06-30 23:00:00+00'` (= **2026-07-01 09:00 AEST**).
- Query July's summary → **must NOT count** (it's a June task in UTC).
- Insert `completed_at = '2026-06-30 14:30:00+00'` (= **2026-07-01 00:30 AEST**) — **inside the broken
  window**. Under AEST truncation this wrongly counts as July. Under UTC it's correctly June.
  **This is the fixture that catches F21.**
- **BREAK-PROOF:** revert to `date_trunc('month', now())` → this fixture goes **RED**. Paste it.

Also confirm the test suite runs against a Postgres whose timezone is **not** UTC (it does —
`Australia/Sydney`), otherwise the test is vacuous.

---

# F22 [LOW] — `getProgressSummary` ignores its `tx` argument → `withRlsContext` protects nothing

## The finding
- `app/api/brands/[brandId]/action-progress/route.ts:43` calls **`getProgressSummary(brandId, tx)`**
- `lib/workflow/progress-summary.ts:13` signature is **`(brandId: string)`** — one parameter.

**The `tx` is silently dropped.** The function uses **`serviceDb`**, which **bypasses RLS entirely**.

## Why it's worth fixing even though it "works"
Isolation holds **today** — the query filters by `brandId` and `assertBrandAccess` gates the route.
**But the route's `withRlsContext` is providing ZERO actual protection for this query while appearing
to.** That's a defence-in-depth layer that exists on paper only.

The failure mode is future-tense and quiet: someone later relaxes the app-level filter, trusting RLS
to catch it — and it doesn't. **A security control that looks present but isn't is worse than one
that's absent**, because it stops people looking.

Also: TypeScript did **not** catch the extra argument. Worth knowing why (excess args to a JS-callable
fn, or a loose signature) — if TS is silently swallowing arity mismatches, **there may be others.**

## Task
1. Change the signature to accept the transaction and USE it:
   ```ts
   export async function getProgressSummary(brandId: string, tx: DbOrTx = serviceDb) { ... }
   ```
   (match the repo's existing `tx`-passing convention — S8's handlers use `db.transaction` with `tx`
   exclusively; follow that.)
2. Use `tx` for the query instead of `serviceDb`, so `withRlsContext` actually applies.
3. ```bash
   # Are there OTHER callers passing args a function doesn't accept?
   grep -rn "getProgressSummary\|getOrgProgressSummary" app/ lib/ components/
   ```
4. **Assert RLS is now genuinely enforced:** the Section 2 brand-isolation test should still pass —
   but now it's passing *because of RLS*, not merely because of the `brandId` filter.
   **BREAK-PROOF:** remove the app-level `brandId` filter → the isolation test must **STILL PASS**
   (RLS catching it). If it *fails*, RLS still isn't doing anything and the fix didn't take. **That's
   the real test of this fix.**

## Constraints
- Do NOT regress the tracker (F1–F4's canonical query is verified — keep the SQL semantics identical
  apart from the timezone).
- Do NOT weaken brand isolation while wiring `tx`.
- Sweep for BOTH bug classes (`date_trunc` without UTC; functions ignoring a passed `tx`) — report
  every instance, fix the S9-scoped ones.

## Report back (paste inline)
1. F21: the diff + **the sweep** (every other `date_trunc`/`now()` bucketing in the codebase) + the
   **RED** from the 14:30-UTC boundary fixture.
2. F22: the diff + whether other callers pass args that are silently dropped + **the RLS break-proof**
   (remove the app-level filter → isolation must STILL hold).
3. Full suite green (210 + any new tests).
