# VERIFY S8 DR-01 — data_residency_log rows on visibleau_prod (expect 7, diagnose 5 or 0)

## Why
CRITICAL-01 confirmed the 4 governance tables now exist on both DBs and the brand-route 500s are
gone (`…/visibility 200`). Remaining open item from that fix: the `data_residency_log` TABLE
existing does NOT prove the DR-01 writer (`lib/governance/record-data-residency.ts`) ran or wrote
the correct rows. Canon (LLD 8733–8743) requires **7 declarative rows per org**. This table
historically shipped with a reader but no writer (the DR-01 bug), so an empty/short result is a
real, known failure mode — verify before the manual walk so the data-residency screen is
attributed correctly.

## Task — read-only verification first (no writes yet)

### Step 1 — Find the prod connection string (do NOT hardcode)
```bash
cd c:/startup/VisibleAU/src
# Identify the env file the RUNNING app uses for visibleau_prod:
grep -RnE "visibleau_prod|DATABASE_URL" .env .env.local .env.production.local 2>/dev/null
```
Use that real `visibleau_prod` connection string in the psql calls below (shown as `$PROD`).

### Step 2 — Dump the residency rows for the validation org (Metropolitan Plumbing)
```bash
psql "$PROD" -c "
  SELECT data_type, storage_region, provider, retention_period, encryption_status
  FROM data_residency_log
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9'
  ORDER BY data_type;"
psql "$PROD" -c "
  SELECT count(*) AS residency_rows
  FROM data_residency_log
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9';"
```

### Step 3 — Interpret the count against canon
Canon RESIDENCY map (LLD 8733–8743) = exactly these **7** `data_type` values:
`audit_data`, `evidence_snapshots`, `pdf_reports`, `llm_cache`, `crawler_logs`,
`llm_processing_openai`, `llm_processing_anthropic`.
Expected column values to spot-check:
- audit_data / evidence_snapshots / pdf_reports → region `ap-southeast-2`, provider `supabase`, retention `12 months`
- llm_cache → retention `30 days`; crawler_logs → retention `90 days` (both `ap-southeast-2`, `supabase`)
- llm_processing_openai → region `us`, provider `openai` (no retention/encryption required)
- llm_processing_anthropic → region `us`, provider `anthropic`

Then classify:
- **7 rows, values match** → DR-01 correct. Report "DR-01 OK: 7 rows". STOP (no changes).
- **5 rows** (missing the two `llm_processing_*`) → the RESIDENCY map in
  `lib/governance/record-data-residency.ts` is incomplete. Go to Step 4.
- **0 rows** → the writer never ran for this org (the DR-01 bug). Go to Step 5.
- **Some other count / wrong values** → report the exact dump inline; do not guess-fix.

### Step 4 — IF 5 rows: inspect the writer's RESIDENCY map (report, don't blind-fix)
```bash
sed -n '1,80p' lib/governance/record-data-residency.ts
grep -n "llm_processing" lib/governance/record-data-residency.ts    # expect 2 hits; 0 hits = they were omitted
```
If the two `llm_processing_openai` / `llm_processing_anthropic` entries are absent from the map,
that is the finding. Report the current map contents inline and STOP — a targeted fix prompt will
add the two canonical entries (with region `us` + the correct provider) and re-run the writer.
Do NOT invent extra columns or values beyond canon.

### Step 5 — IF 0 rows: confirm the writer exists and was simply never invoked
```bash
test -e lib/governance/record-data-residency.ts && echo "writer file present" || echo "WRITER FILE MISSING"
grep -n "onConflict\|ON CONFLICT" lib/governance/record-data-residency.ts   # UPSERT present?
# Find where it is (or should be) called — provisioning + nightly governance cron:
grep -Rn "record-data-residency\|recordDataResidency\|recordResidency" app/ lib/ inngest/ | grep -v test
```
Report inline: whether the file exists, whether the UPSERT is present, and every call site found.
This distinguishes "writer built but never wired to provisioning/cron" from "writer wired but the
validation org predates it." STOP after reporting — the fix (invoke the writer for existing orgs,
and/or wire it into the provisioning path + governance cron) will be scoped from what you find.

## Constraints
- Steps 1–3 are READ-ONLY. Do not write to `data_residency_log` or edit any file in Steps 1–5
  beyond reading. The purpose is diagnosis; the fix is a separate prompt scoped to the result.
- Do NOT edit canon-derived values. The 7 rows + their region/provider/retention come from LLD
  8733–8743 verbatim — if the writer disagrees with canon, canon wins and the writer is the bug.
- Use the project's real `visibleau_prod` connection string from the env file, not an example.

## Report back (paste inline)
1. The Step 2 row dump (full table) + the count.
2. Which classification (7 / 5 / 0 / other).
3. If 5 or 0: the Step 4 or Step 5 output (the map contents or the call-site grep).
