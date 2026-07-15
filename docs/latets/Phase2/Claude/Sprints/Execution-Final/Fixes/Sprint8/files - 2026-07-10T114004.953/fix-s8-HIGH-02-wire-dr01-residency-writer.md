# FIX S8-HIGH-02 — Wire the orphaned DR-01 residency writer (recordDataResidency never called → 0 rows for every org)

## Severity: HIGH (data-residency screen permanently empty for all orgs — the exact pre-DR-01 bug the writer exists to prevent)

## What the diagnosis proved
`lib/governance/record-data-residency.ts` is built correctly:
- `recordDataResidency(organizationId)` exists (line 56), UPSERT via `.onConflictDoUpdate` (line 68)
- RESIDENCY_MAP has all 7 canonical entries
- Exported from the barrel: `lib/governance/index.ts:18`

But it has **ZERO call sites**. `grep -Rn "record-data-residency|recordDataResidency|recordResidency" app/ lib/ inngest/` returns only the definition + the barrel export — nothing INVOKES it. Not on org provisioning, not on any cron, not in any route or Inngest function. Result: `data_residency_log` has **0 rows** for the validation org (and every org); `GET /api/organizations/[id]/data-residency` returns empty; the data-residency page shows its empty state forever.

This reproduces the DR-01 bug verbatim (LLD 8725–8727: the table "had a reader… but NO documented writer — so the endpoint would always return empty"). The writer was the fix; leaving it unwired undoes it. §12 grep c18 (`onConflict → ≥1`) passed because the UPSERT STRING exists — a string existing does not mean the function is ever called.

## Canon requirement (LLD 8731–8732) — TWO call sites, verbatim
> `lib/governance/record-data-residency.ts` (**called on org provisioning** + **idempotent on the nightly governance cron**) UPSERTs the current declarations…

So the writer must be invoked in BOTH:
1. **On org provisioning** — when a new organization is created, so a fresh org immediately has its 7 residency rows.
2. **On the nightly/weekly governance cron** — idempotently, so declarations stay current and any org missing rows self-heals. Canon ties the residency retention values to the existing **Phase 1 Sprint 12 `audit-data-retention.ts` Sunday cron `'0 4 * * 0'`** as the single source of truth (LLD 827, 860, 5297) — that cron is the natural, canon-endorsed home for the idempotent re-UPSERT.

Plus, because orgs ALREADY exist with 0 rows, a **one-time backfill** is needed so existing orgs (incl. Metropolitan) get their rows now rather than waiting for the next provisioning event.

## Task

### Step 1 — Locate the real provisioning path and the retention cron (target real files, don't invent)
```bash
cd c:/startup/VisibleAU/src
# Org creation / provisioning site(s):
grep -Rn "insert(organizations)\|createOrganization\|organizations).values\|db.insert(orgs" app/ lib/ | grep -v test
# The Phase 1 Sprint 12 retention cron (the canon-endorsed cron home):
ls inngest/functions/ | grep -iE "retention|governance|cron"
grep -Rn "0 4 \* \* 0\|audit-data-retention" inngest/ | head
# Confirm the writer's current signature + export:
sed -n '50,80p' lib/governance/record-data-residency.ts
grep -n "recordDataResidency" lib/governance/index.ts
```
Report what you find for each before editing. If org creation happens in more than one place (e.g. a Better Auth hook AND a manual admin path), wire the provisioning call at the single canonical creation point they all funnel through — not scattered.

### Step 2 — Wire call site 1: org provisioning
At the canonical org-creation point (from Step 1), after the `organizations` row is committed, call:
```typescript
import { recordDataResidency } from "@/lib/governance";
// … after the organization row is created and its id is known:
await recordDataResidency(organization.id);
```
Constraints:
- Call it AFTER the org row commits (it FKs organization_id → organizations).
- It's idempotent (UPSERT on (organization_id, data_type)), so a retry or double-provision is a no-op — safe.
- If provisioning is inside a transaction, ensure the org row is visible to this call (same tx or after commit). Do not let a residency-write failure roll back org creation — wrap defensively (log + continue) so a residency hiccup never blocks onboarding, but DO surface the error to logs.

### Step 3 — Wire call site 2: the nightly/weekly governance cron (idempotent)
Extend the existing Phase 1 Sprint 12 `audit-data-retention.ts` Sunday cron (`'0 4 * * 0'`) — the canon-endorsed single-source-of-truth cron for residency retention windows — to UPSERT residency for every active org each run:
```typescript
// inside the retention cron's handler, as an additional idempotent step:
const orgs = await serviceDb.select({ id: organizations.id }).from(organizations); // active orgs
for (const org of orgs) {
  await recordDataResidency(org.id);   // UPSERT — no-op if already current
}
```
Wrap in a `step.run("refresh-data-residency", …)` if the function is an Inngest step function (matches the per-step retry model used elsewhere). Do NOT create a NEW cron if the retention cron already exists — extend it (canon explicitly ties the two together). Only create a dedicated governance cron if no suitable nightly/weekly function exists; report first if so.

### Step 4 — One-time backfill for existing orgs (they currently have 0 rows)
Provide a runnable backfill so existing orgs get rows immediately. Prefer a small script over a manual loop:
```bash
# e.g. a scripts/backfill-residency.ts run against BOTH DBs, or reuse the cron step manually.
```
It must run for **both** `visibleau` (dev) and `visibleau_prod` (the real-integrations DB the app runs against) — the dev/prod-sync discipline. The backfill is just N calls to `recordDataResidency(orgId)`; idempotent, safe to re-run.

### Step 5 — VERIFY on BOTH DBs (do not trust "it ran")
```bash
for DB in visibleau visibleau_prod; do
  echo "=== $DB ==="
  psql "$<conn for $DB>" -c "
    SELECT data_type, storage_region, provider, retention_period
    FROM data_residency_log
    WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9'
    ORDER BY data_type;"
  psql "$<conn for $DB>" -c "
    SELECT count(*) FILTER (WHERE organization_id='da1071de-6dbd-4e08-8f43-29f76c123be9') AS metro_rows,
           count(DISTINCT organization_id) AS orgs_with_rows
    FROM data_residency_log;"
done
```
EXPECT for BOTH DBs:
- Metropolitan org (`da1071de-…`) has **exactly 7 rows**: audit_data, evidence_snapshots, pdf_reports, llm_cache, crawler_logs, llm_processing_openai, llm_processing_anthropic.
- Column spot-check: the 3 stored classes → `ap-southeast-2`/`supabase`/`12 months`; llm_cache → `30 days`; crawler_logs → `90 days`; both llm_processing_* → region `us`, provider `openai`/`anthropic`.
- `orgs_with_rows` = the number of orgs in that DB (every org backfilled), not just 1.

### Step 6 — Idempotency proof
Run the backfill (or the cron step) a SECOND time, re-count:
```bash
psql "$<prod conn>" -c "SELECT count(*) FROM data_residency_log WHERE organization_id='da1071de-6dbd-4e08-8f43-29f76c123be9';"
```
EXPECT: still 7 (not 14) — the UPSERT refreshed, did not duplicate.

## Constraints
- Do NOT edit the RESIDENCY_MAP values — they come from LLD 8733–8743 verbatim and were verified
  correct in the diagnosis (all 7 present). This fix is WIRING only, plus the backfill.
- Do NOT remove or weaken the barrel export.
- subscriptions.tier unchanged. No new env vars.
- The provisioning call must not be able to roll back / block org creation on a residency error
  (log + continue), but must log failures loudly.

## Report back (paste inline)
1. Step 1 output — the provisioning site(s) + the retention cron file + the writer signature.
2. The diff/summary of where you added the two calls (provisioning + cron) and the backfill mechanism.
3. Step 5 verification: the 7-row dump + counts for BOTH DBs.
4. Step 6: the second-run count proving idempotency (still 7).
