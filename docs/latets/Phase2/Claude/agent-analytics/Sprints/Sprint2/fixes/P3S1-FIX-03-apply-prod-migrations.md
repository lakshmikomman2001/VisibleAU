# P3-S1 · FIX 03 — Apply 0024 + 0025 to PROD (backup → run → prod-asserted read-back) ⚠️ PROD WRITE

> **Type:** PROD WRITE. Applies the two S1 corrective migrations to `visibleau_prod`. The SQL has been
> **reviewed and confirmed safe** — `0024` was written against **prod's actual constraint/index names**
> (the renames go prod-name → dev-name, each guarded `IF EXISTS(prod) AND NOT EXISTS(dev)`), the two
> `ALTER TYPE` casts are self-guarded and abort-on-uncastable, and everything runs in one `BEGIN…COMMIT`
> so any failure rolls back cleanly. This is NOT the broken "apply 0024 as-written-for-dev" path — the
> names are correct for prod.
>
> **Why the ceremony anyway:** this session proved TWICE that "applied to prod / zero drift" was
> **reported but false** (FIX-01 and FIX-02 never actually reached prod; DIAG-03 caught it). So the rule
> now is: **prove it landed against prod with independent queries — never trust the script's own success
> message or a summary.** The read-back in Step 3 runs explicitly against `visibleau_prod` with
> `current_database()` asserted. That is the actual success condition.
>
> ⚠️ **SCOPE — read this so you don't over-conclude:** `0024`+`0025` fix **S1's** prod gap ONLY
> (source_ip/cidr types, the 7 CHECKs, the dedup index, RLS policy, naming). They do **NOT** apply the
> **S2** schema (the 6 new `remediation_task` types + any S2 `ai_referral_hits` changes). **After this
> lands, prod matches dev for S1, but S2's prod migration is STILL PENDING.** Don't read "prod caught up"
> as "S2 deployable."
>
> ⚠️ **Finding #2 still applies:** this creates the RLS policy (matching dev) but the app connects as
> superuser, so RLS won't *engage* until that's addressed. "RLS policy created" ≠ "tenant isolation
> enforced on prod." Parked pre-GTM item — not resolved here.
>
> **DB:** `visibleau_prod` — `postgresql://postgres:password@localhost:5432/visibleau_prod`. ⚠️
> `.env.local` points at dev; the `.mjs` script and the read-back must use the **explicit prod string**.
> **Never `drizzle-kit push`.**

---

## STEP 0 — BACKUP PROD (mandatory — before running the script)

```bash
pg_dump "postgresql://postgres:password@localhost:5432/visibleau_prod" \
  --format=custom \
  --file="visibleau_prod_backup_pre_0024_0025_$(date +%Y%m%d_%H%M%S).dump"

ls -la visibleau_prod_backup_pre_0024_0025_*.dump   # must exist, non-zero size
```
⚠️ **If the dump is missing or 0 bytes, STOP.** Do not run the migration script without a good backup.

---

## STEP 1 — Pre-flight: confirm prod is still in the expected (pre-migration) state

Run against **prod** (paste output; this guards against acting on stale assumptions):
```sql
SELECT current_database();   -- MUST return 'visibleau_prod'. If not, STOP.

-- expect: source_ip = text, cidr = text  (pre-migration state)
SELECT
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='crawler_visit_logs' AND column_name='source_ip') AS source_ip_now,
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='ai_bot_ip_ranges' AND column_name='cidr')        AS cidr_now;

-- expect: 0  (the 7 CHECKs not yet present)
SELECT count(*) FROM pg_constraint
WHERE conrelid IN ('crawler_visit_logs'::regclass,'ai_bot_registry'::regclass,'ai_referral_hits'::regclass)
  AND contype='c';

-- expect: dedup index absent
SELECT indexname FROM pg_indexes WHERE indexname='crawler_logs_dedup_idx';

-- DATA-SAFETY: both ALTER-TYPE tables must be empty (expect 0, 0)
SELECT (SELECT count(*) FROM crawler_visit_logs) AS clv, (SELECT count(*) FROM ai_bot_ip_ranges) AS ipr;
```
⚠️ **Expected:** `source_ip=text`, `cidr=text`, CHECK count `0`, no dedup index, both tables empty.
- If prod is **already** partly migrated (e.g. source_ip already inet) → the migration's guards will skip
  those parts (safe), but **report it** — it means a prior partial apply happened.
- If either ALTER-TYPE table has **rows** → report the count before running (the migration self-guards and
  will abort if uncastable, but we want to know first).

---

## STEP 2 — Run the migration script

```bash
node _apply-prod-migrations.mjs
```
This applies `0024` then `0025` to prod. Capture the **full output**.

⚠️ **Watch for:**
- A `RAISE EXCEPTION 'ABORT: ...'` → a self-guard tripped (uncastable value). That's a **finding**, not
  something to force past — the transaction rolled back, prod is unchanged. Report the exception text.
- Any other SQL error → the transaction should roll back (single `BEGIN…COMMIT`). Report it; prod unchanged.
- ⚠️ **Do NOT trust the script's own "verification diff / zero differences" message as proof.** Step 3 is
  the real proof. (The script's internal diff is the same kind of self-report that was wrong twice this
  session.)

---

## STEP 3 — INDEPENDENT PROD-ASSERTED READ-BACK (the actual success condition)

Run these **against prod** yourself — not the script's diff. **Every query must be preceded by confirming
`current_database()` = `visibleau_prod`.**

```sql
SELECT current_database();   -- MUST be 'visibleau_prod' for everything below to count

-- 3a. types corrected
SELECT
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='crawler_visit_logs' AND column_name='source_ip') AS source_ip,  -- expect inet
  (SELECT data_type FROM information_schema.columns
     WHERE table_name='ai_bot_ip_ranges' AND column_name='cidr')        AS cidr;        -- expect cidr

-- 3b. the 7 CHECK constraints now present (list them)
SELECT conname FROM pg_constraint
WHERE conrelid IN ('crawler_visit_logs'::regclass,'ai_bot_registry'::regclass,'ai_referral_hits'::regclass)
  AND contype='c'
ORDER BY conname;
-- expect 7: crawler_visit_logs_{verification_status,verified_via,ingest_source}_check,
--           ai_bot_registry_{crawler_tier,default_purpose,match_mode}_check,
--           ai_referral_hits_source_check

-- 3c. dedup index present (0025)
SELECT indexdef FROM pg_indexes WHERE indexname='crawler_logs_dedup_idx';   -- expect the COALESCE unique index

-- 3d. GiST index on cidr present + verification index has DESC
SELECT indexname FROM pg_indexes WHERE indexname='ai_bot_ip_ranges_cidr_idx';           -- expect present
SELECT indexdef FROM pg_indexes WHERE indexname='crawler_logs_verification_idx';        -- expect visited_at DESC

-- 3e. RLS enabled + policy present (matching dev)
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='ai_referral_hits';
-- expect relrowsecurity=true (relforcerowsecurity=false — Finding #2, correct-for-now)
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename='ai_referral_hits';
-- expect ai_referral_hits_org_isolation with current_setting('app.current_org_id')

-- 3f. naming aligned (the renames landed)
SELECT conname FROM pg_constraint
WHERE conrelid='ai_referral_hits'::regclass AND contype='f' ORDER BY conname;
-- expect ..._brand_id_fkey and ..._organization_id_fkey (NOT the _brands_id_fk Drizzle names)
SELECT conname FROM pg_constraint
WHERE conrelid='ai_bot_registry'::regclass AND conname LIKE '%ua_token%';
-- expect ai_bot_registry_ua_token_key (NOT _ua_token_unique)
```

### 3g — The definitive parity check: re-run the DIAG-03 full diff dev-vs-prod
Run the DIAG-03 Part B column/constraint/index/RLS comparison across **both** DBs and confirm the count of
structural differences is now **0** (was 27).
```sql
-- table count (both should be 74)
SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';
-- then the column/constraint/index/RLS diffs from DIAG-03 Part B — expect ZERO differences now
```
⚠️ **Ignore** the known-benign items (pg_toast internal OIDs, `organizations` column ordinal position) —
those are not structural drift. **Everything else must be zero.**

---

## REPORT-BACK (paste inline)

**Step 0:** backup filename + non-zero size confirmed?

**Step 1 (pre-flight):** `current_database()`=visibleau_prod? source_ip/cidr both `text`? CHECK count `0`?
dedup absent? both ALTER-TYPE tables empty? (Any deviation reported?)

**Step 2 (run):** did the script COMMIT cleanly, or did a `RAISE EXCEPTION`/error fire (paste it)? Paste
the script's output — but note it's not the proof.

**Step 3 (the proof — all against prod):**
- ⚠️ 3a: source_ip=**inet**, cidr=**cidr**?
- ⚠️ 3b: all **7** CHECKs listed?
- ⚠️ 3c: dedup index present?
- 3d: GiST index present, verification index has DESC?
- ⚠️ 3e: RLS **enabled=true**, org_isolation policy present with the `app.current_org_id` predicate?
- 3f: FK names are `_fkey` (not `_brands_id_fk`); registry unique is `_ua_token_key` (not `_unique`)?
- ⚠️ **3g: does the DIAG-03 full re-diff now show ZERO structural differences (was 27)?**

**⚠️ THE VERDICT at the top:**
> **Did 0024+0025 actually land on PROD — verified by independent prod-asserted queries (not the script's
> own message) — with source_ip=inet, cidr=cidr, 7 CHECKs, dedup index, RLS policy, aligned names, and the
> DIAG-03 re-diff now at ZERO differences?** YES → prod finally matches dev **for S1**; S1's prod gap is
> closed and PROVEN this time. NO → paste which check failed; if the script rolled back, prod is unchanged
> and safe.
>
> ⚠️ **Reminder regardless of outcome:** this closes **S1's** prod gap only. **S2's prod migration
> (remediation_task enum + S2 schema) is still PENDING** — prod is NOT yet ready for S2. And **Finding #2**
> (superuser bypasses RLS) is unchanged — the policy exists but won't engage until the app stops
> connecting as superuser.

**Constraints recap:** backup before running; use the explicit prod connection (not the dev default);
never `drizzle-kit push`; the success condition is the **independent prod read-back at zero drift**, NOT
the script's own diff message; a `RAISE EXCEPTION` is a finding (rolled back safely), not something to
force; this is S1-only — S2 prod-apply and Finding #2 remain open.
