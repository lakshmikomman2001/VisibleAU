# P3-S1 · DIAGNOSTIC 03 — Re-confirm dev==prod parity (READ-ONLY, post-0024/0025)

> **Type:** DIAGNOSTIC. **READ-ONLY. No writes, no ALTER, no migrations, no `drizzle-kit push`.** Every
> step is a query.
>
> **Why this exists:** The §11.2 test report revealed that migrations **0024** (FIX-01: source_ip→INET,
> cidr→CIDR, 7 CHECKs, RLS policy, indexes) and **0025** (FIX-02: `crawler_logs_dedup_idx`) were applied
> to **prod** (during FIX-01/FIX-02) but were **NOT on dev** until the integration-test build applied them
> just now. So for the stretch between FIX-01 and this test run, **dev and prod were diverged** — in the
> *opposite* direction from what we assumed (prod correct, dev behind). This is the same two-DB pitfall,
> mirrored. The test build closed it **by accident** (the integration tests needed the columns), and the
> report *asserts* "dev now matches prod exactly" — but that is a **manual assertion**, and a "they match"
> claim already turned out wrong once this session. **We verify it, we don't re-trust it.** This re-runs
> the DIAG-02 structural comparison on the CURRENT state to confirm parity for real.
>
> **Two databases:** `visibleau` (dev) and `visibleau_prod` (prod). Connection:
> `postgresql://postgres:password@localhost:5432/{visibleau|visibleau_prod}`. ⚠️ `.env.local` points at
> dev now — use the **explicit prod connection string** for the prod queries; don't rely on the default.
>
> **Expected state (both migrations now on BOTH DBs):** 74 tables each; `source_ip`=inet, `cidr`=cidr on
> both; `crawler_logs_dedup_idx` present on both; 7 CHECKs + the `ai_referral_hits` RLS policy on both;
> registry = 20 on both; **zero structural diff**. If anything doesn't match, that's a real finding.

---

## PART A — The two migrations that reached the DBs at different times (targeted checks)

Run each on **both** DBs; report both values side by side.

**A1 — FIX-01 column types (0024):**
```sql
SELECT current_database(),
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='crawler_visit_logs' AND column_name='source_ip') AS source_ip_type,
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='ai_bot_ip_ranges' AND column_name='cidr')        AS cidr_type;
```
⚠️ Expect `inet` and `cidr` on **BOTH**. (If dev shows `text` on either, 0024 didn't fully apply to dev.)

**A2 — FIX-02 dedup index (0025):**
```sql
SELECT current_database(), indexdef
FROM pg_indexes
WHERE tablename='crawler_visit_logs' AND indexname='crawler_logs_dedup_idx';
```
⚠️ Expect the identical `CREATE UNIQUE INDEX ... COALESCE(source_ip, '0.0.0.0'::inet)` definition on
**BOTH**. (If absent on dev, 0025 didn't reach dev.)

**A3 — the 7 CHECK constraints (0024):**
```sql
SELECT current_database(), conname
FROM pg_constraint
WHERE conrelid::regclass::text IN ('crawler_visit_logs','ai_bot_registry','ai_referral_hits')
  AND contype='c'
ORDER BY conname;
```
⚠️ Expect the same 7 on both: `verification_status_check, verified_via_check, ingest_source_check,
crawler_tier_check, default_purpose_check, match_mode_check, source_check`.

**A4 — RLS policy + enabled flag (0024):**
```sql
SELECT current_database(), relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname='ai_referral_hits';
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename='ai_referral_hits';
```
⚠️ Expect `relrowsecurity=true` on both, the `org_isolation` policy present on both, predicate identical.
(`relforcerowsecurity` will be `false` on both — that's Finding #2, correct-for-now, NOT a drift.)

---

## PART B — Full structural re-diff (the authoritative parity check)

Same as DIAG-02 Part B. Run each on **both** DBs and report **only the differences** dev-vs-prod.

**B1 — table count:**
```sql
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE';
```
⚠️ Expect **74** on both, and no table present on one but not the other.

**B2 — column diff (types/null/default):**
```sql
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;
```
Diff dev vs prod. ⚠️ Expect **zero** differences (the DIAG-02 known ones — source_ip, cidr — should now be
resolved on both). Report any remaining difference. *(Cosmetic ordinal-position differences on unrelated
tables, as noted in the earlier full-drift check, are not structural — ignore those, but say if you see
them.)*

**B3 — constraint diff:**
```sql
SELECT tc.table_name, tc.constraint_name, tc.constraint_type, cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name=cc.constraint_name AND tc.constraint_schema=cc.constraint_schema
WHERE tc.table_schema='public'
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
```
Diff. ⚠️ Expect zero differences.

**B4 — index diff:**
```sql
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' ORDER BY tablename, indexname;
```
Diff (ignore `pg_toast` internals). ⚠️ Expect zero user-table index differences — `crawler_logs_dedup_idx`
and the AA indexes should now be identical on both.

**B5 — RLS policy diff:**
```sql
SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname='public' ORDER BY tablename, policyname;
```
Diff. ⚠️ Expect identical (only `ai_referral_hits.org_isolation` on both).

**B6 — seed parity:**
```sql
SELECT current_database(), count(*) FROM ai_bot_registry;
```
⚠️ Expect **20** on both.

---

## PART C — Migration ledger (did 0024/0025 get recorded, or applied raw?)

These were hand-written psql migrations (like 0023), which bypass Drizzle's `__drizzle_migrations`
tracking. Confirm the on-disk migration files exist and note whether the ledger reflects them (it may
not — raw psql apply doesn't record). This is informational — it tells us the migration *history* is
consistent even though tracking is manual.
```sql
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;  -- adjust schema/name if different
```
Run on both; report whether 0024/0025 appear (likely not, since applied via raw psql) and confirm the
`.sql` files exist on disk (`ls db/migrations/*002[45]*`).

---

## PART D — Log the systemic gap (no automated drift checker)

DIAG-02 established there is **no automated dev-vs-prod schema drift checker** — "dev == prod" has been a
**manual assertion**, and it has now been wrong or stale **twice this session** (the AA-object divergence,
and the 0024/0025 dev-lag). The FIX-01 recurrence guard prevents `drizzle-kit push` damage but does
**nothing** about "a migration reached one DB and not the other." Record this as a tracked pre-GTM item
(no action now — just capture it so it lands on the security/ops list next to Finding #2):

> ⚠️ **TRACKED (pre-GTM ops): No automated dev↔prod schema drift check.** Schema parity is asserted
> manually and has been wrong twice this session. A scripted structural comparison (the Part B queries)
> should be run before any deploy, and ideally wired as a CI/pre-deploy gate. Root cause of the gap:
> migrations are hand-written psql applied to two DBs by hand, with no reconciliation step. Pairs with
> Finding #2 (RLS) as the two standing ops/security items.

---

## REPORT-BACK (paste inline)

**⚠️ THE VERDICT at the top:**
> **Is dev structurally identical to prod RIGHT NOW (after 0024+0025 reached both), verified by
> independent re-diff — zero column/constraint/index/RLS differences, 74 tables each, registry 20 each?**
> YES → parity confirmed for real; the dev-lag gap is closed and verified (not just asserted). NO → list
> every remaining difference; that's still-open drift.

**Part A (the two migrations):** A1 source_ip/cidr types on both; A2 dedup index on both; A3 the 7 CHECKs
on both; A4 RLS enabled+policy on both. Any that differ dev-vs-prod?

**Part B (full re-diff):** B1 table counts; ⚠️ **B2/B3/B4/B5 — any differences at all?** (list them, or
state "zero"); B6 registry counts.

**Part C:** do 0024/0025 appear in the ledger, and do the `.sql` files exist? (Informational.)

**Part D:** confirm the "no drift checker" item is captured as tracked.

**Reminder:** read-only — no writes, no push. This just verifies the parity the test report asserted, and
logs the systemic gap. If parity holds, S1's remaining items are the manual route+Inngest test and the
§12 grep pass.
