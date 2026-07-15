# ADDENDUM S9-LOW-06b (F22) — PROVE RLS is enforced, don't just prove the `tx` is plumbed

## Why this addendum exists
F22's fix wired `getProgressSummary(brandId, db)` and both callers now pass `tx`. **But the
break-proof offered was:**
> *"If the parameter is removed, tests fail to compile / the mock doesn't intercept."*

That proves **the mock is wired**. It does **not** prove **RLS is enforced**. RLS lives in Postgres —
**a mock has no Postgres**, so a unit test can say nothing about it either way.

**And there's a specific reason to doubt:**
```ts
db: DbClient = serviceDb as unknown as DbClient    // ← default BYPASSES RLS
```
The function is RLS-protected **only when a caller passes `tx`**. Any future caller that omits it
silently falls back to the RLS-bypassing client — **no error, no warning.** That is the same shape as
the original bug, one level up.

**F22 exists precisely because a security control looked present and wasn't. Closing it with a proof
that also looks present and isn't would be an absurd way to end the story.** Section 2 already has a
live DB. This costs minutes.

READ the existing Section 2 isolation test first; extend it, don't duplicate it.

---

## TASK 1 — Make `db` REQUIRED (remove the RLS-bypassing default)

```ts
export async function getProgressSummary(
  brandId: string,
  db: DbClient,            // ← REQUIRED. No serviceDb default.
): Promise<ProgressSummary> { ... }
```

**Why:** with a default of `serviceDb`, a caller can silently opt out of RLS by simply forgetting an
argument. Making it required means **TypeScript enforces what the pattern intends** — a new caller
*must* consciously supply a client, and passing `serviceDb` becomes an explicit, greppable choice
rather than an invisible default.

- Both existing callers already pass `tx` → they compile unchanged.
- Any caller TS now flags is a site that was silently bypassing RLS. **Report how many.**
- If a legitimate caller genuinely needs `serviceDb` (a cron/webhook outside a request context),
  passing it **explicitly** is fine — that's the point. It's now visible.

---

## TASK 2 — THE ACTUAL RLS PROOF (live DB, Section 2 layer)

**The question:** is isolation holding because of **RLS**, or because of the **`brandId` filter** —
with RLS doing nothing?

**The test that distinguishes them:**

```
1. Seed Org A (brand A) and Org B (brand B), each with remediation_tasks rows.
2. Open a transaction with withRlsContext set to ORG A.
3. Inside it, run the progress-summary query for BRAND B
   — WITHOUT the app-level brandId/org filter (or with the filter deliberately
     widened so it cannot be what's providing isolation).
4. ASSERT: zero rows / zero counts.
```

- **Zero rows → RLS is genuinely enforcing isolation.** ✅ F22 CLOSED, properly.
- **Org B's data comes back → RLS is NOT active on this path.** ❌ The `tx` is plumbed but the
  policy isn't applying (missing policy on `remediation_tasks`? `withRlsContext` not setting the
  session GUC? the Drizzle client not inheriting the tx?). **That's a NEW finding — a real security
  gap, not a style issue.** Diagnose which of the three and report.

**Run the SAME query through `serviceDb` as a control** — it should return Org B's rows (proving the
data is really there and the test isn't vacuously passing on an empty table). ⚠️ **Without this
control, "zero rows" could just mean "no rows exist" — which would be a false green.** This control is
mandatory.

### BREAK-PROOF
Remove/disable the RLS policy on `remediation_tasks` (or drop the `withRlsContext` wrapper) → the
isolation test must go **RED**, returning Org B's rows. **Paste that RED.** If it stays green, RLS was
never providing the isolation and the app-level filter is the only thing standing there.

---

## TASK 3 — Is `withRlsContext` doing anything on this path at all?
```bash
cd c:/startup/VisibleAU/src
grep -rn "withRlsContext" lib/ app/ | head
grep -rn "SET LOCAL\|set_config\|current_setting" lib/db/ | head
# Does remediation_tasks HAVE an RLS policy?
psql "$DEV" -c "SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('remediation_tasks','brands','audits');"
psql "$DEV" -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('remediation_tasks','brands','audits');"
```
- If `relrowsecurity = false` on `remediation_tasks`, **RLS is not even enabled on the table** — the
  whole `withRlsContext` layer is decorative for this query, and that is the finding.
- Report the policy list. A table with RLS *enabled* but *no policy* denies everything; a table with
  RLS *disabled* allows everything regardless of the session GUC.

---

## CONSTRAINTS
- Do NOT weaken the app-level `brandId` filter in production code — only widen/bypass it **inside the
  test** to isolate what RLS is doing. The app filter stays as defence-in-depth.
- The `serviceDb` control run is **mandatory** — otherwise a "zero rows" pass may be vacuous.
- If RLS turns out to be inactive on this path: **do not paper over it.** Report it as a finding with
  the diagnosis (policy missing / RLS disabled / GUC not set / tx not inherited). That is a genuine
  security finding and belongs in the ledger.
- Do not regress the tracker (F1–F4, F21 — the canonical query and UTC month must be untouched).

## REPORT BACK (paste inline)
1. **How many callers TypeScript flagged** when `db` became required (0 is a fine answer — it means
   the two known callers were the only ones).
2. **The RLS proof result:** zero rows under Org A's context (✅) — with the **`serviceDb` control**
   showing Org B's rows really exist.
3. **The break-proof RED** (disable the policy / drop `withRlsContext` → Org B's rows leak).
4. `pg_policies` + `relrowsecurity` for `remediation_tasks`, `brands`, `audits`.
5. **VERDICT:** is RLS genuinely enforcing isolation on this path, or is the app-level filter the only
   thing doing it?
6. Full suite green (213 + the new test).
