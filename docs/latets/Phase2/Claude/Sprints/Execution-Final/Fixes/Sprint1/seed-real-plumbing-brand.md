# Claude Code — Seed a REAL Australian brand for manual audit testing (real ABN + real LLMs)

Add one **real, ABR-verified** Australian business to the local prod DB, under a **new test org**, so it can be
selected in the running app and have a real audit run against it (real ABN lookup + real LLM engines).

> **Investigate-first.** Do NOT assume column names or enum values — read the actual schema and the existing
> seed script first, then write the insert to match. Your prod DB is the source of truth, not any doc.

---

## THE BRAND (verified on the official ABR register, 27 Jun 2026 — it WILL resolve in ABN lookup)

- **Legal/entity name:** SYDNEY PLUMBING SOLUTIONS PTY LTD
- **ABN:** `81 121 903 919`  (store without spaces if the schema expects that: `81121903919`)
- **ABN status:** Active from 25 Sep 2006 · **GST:** Registered · **Entity type:** Australian Private Company
- **Location:** NSW, postcode 2212 (Condell Park, Sydney metro)
- **Vertical:** plumbing / home services / trades (pick the value that matches the actual `vertical` enum — see Step 1)
- **primaryRegions:** `['NSW:Condell Park']`  (canonical `STATE:Suburb`; 2212 = Condell Park)
- **Website (optional, for the audit to crawl):** if a `website`/`domain` column exists, you may leave it null
  or set a plausible value — but do NOT fabricate a specific URL as fact; null is safer than a guessed domain.

> This ABN is real and active — confirmed directly on abr.business.gov.au today. That's deliberate: it means the
> real ABN-lookup call in the app will succeed, so the test exercises the integration rather than failing on bad input.

---

## STEP 1 — Investigate the schema + existing seed pattern (before writing anything)
```bash
# a) The brands + organizations + subscriptions table definitions (real column names, NOT NULLs, types):
grep -rn "pgTable(\"brands\"\|pgTable('brands'\|export const brands" lib/ db/ drizzle/ --include=*.ts
grep -rn "pgTable(\"organizations\"\|export const organizations" lib/ db/ drizzle/ --include=*.ts
grep -rn "pgTable(\"subscriptions\"\|export const subscriptions" lib/ db/ drizzle/ --include=*.ts

# b) The vertical enum values + region enum (so we use a real one):
grep -rn "verticalEnum\|vertical.*pgEnum\|regionEnum" lib/ db/ drizzle/ --include=*.ts

# c) The existing seed script to mirror its style/connection/insert pattern:
cat scripts/seed-dental-demo.ts 2>/dev/null || find . -name "seed-*.ts" -not -path "*/node_modules/*"

# d) How the existing demo org+subscription were created (tier source = subscriptions.tier, NOT organizations.tier):
grep -rn "subscriptions\|tier" scripts/seed-dental-demo.ts 2>/dev/null
```
**Confirm before proceeding:** the exact required columns for `organizations`, `brands`, and how a tier is set
(via a `subscriptions` row). Note the real `vertical` enum value to use. Note whether ABN is stored with/without spaces.

## STEP 2 — Write the seed script `scripts/seed-real-plumbing.ts`
Model it on `seed-dental-demo.ts`. It must:

1. **Be idempotent** — check if the org/brand already exists (by a stable key like org name or brand ABN) and
   skip or upsert rather than creating duplicates on re-run. Use explicit IDs so re-runs are safe.
2. **Create a NEW test org** — e.g. name `"Plumbing Test Org"`, region `'au'` (lowercase enum). Give it whatever
   columns Step 1 showed are required (slug if present, timestamps, etc.).
3. **Give the org a tier via `subscriptions`** — insert a `subscriptions` row for the org at a paid tier
   (e.g. Growth or Agency) so the real audit is allowed to fan out across the paid engine count. **Set the tier
   on `subscriptions.tier` — NEVER on `organizations.tier`** (locked invariant).
4. **Insert the brand** under that org with the verified data above:
   - name: `Sydney Plumbing Solutions`
   - the ABN field: `81121903919` (or with spaces — match what Step 1 found the column expects)
   - vertical: the real enum value from Step 1
   - region: `'au'`; primaryRegions: `['NSW:Condell Park']` (TEXT[], canonical STATE:Suburb)
   - any other NOT NULL columns Step 1 surfaced, with sensible values.
5. **Scope every write** — explicit IDs / WHERE on any upsert. **Never an unscoped `UPDATE` or `DELETE`** on
   brands/organizations (the Sprint 10 footgun).
6. **Print** the created org id + brand id at the end.

## STEP 3 — Run it
```bash
# Use the same runner the existing seed uses (tsx / ts-node / pnpm script — check package.json):
pnpm tsx scripts/seed-real-plumbing.ts    # or whatever the dental seed uses
```

## STEP 4 — Verify it landed (DB level)
```sql
SELECT o.id AS org_id, o.name AS org, s.tier, b.id AS brand_id, b.name AS brand, b.primary_regions
FROM organizations o
JOIN subscriptions s ON s.organization_id = o.id
JOIN brands b ON b.organization_id = o.id
WHERE o.name = 'Plumbing Test Org';
-- → one row: the new org, a paid tier, the Sydney Plumbing Solutions brand, primary_regions = {NSW:Condell Park}
```
Confirm: org exists, tier is set on the subscription, brand exists with canonical `NSW:Condell Park` region.

---

## THEN — your manual test in the running app (not part of this script)
1. Make sure the local app loads this org/brand. If brand access is user-scoped, ensure your logged-in dev user
   is a member of (or has access to) the new "Plumbing Test Org" — if not, you'll need to add membership the
   same way the dental demo's user was granted access (check seed-dental-demo.ts for the membership/brand_access row).
2. In the app: **New brand** flow OR brand selector → confirm **Sydney Plumbing Solutions** appears.
3. To test **real ABN lookup**: in the New brand form, enter ABN `81 121 903 919` → it should auto-fill
   "SYDNEY PLUMBING SOLUTIONS PTY LTD" from the live ABR (proves the GUID-authenticated lookup works).
4. **Run a real audit** on the brand → real LLM engines fan out. Start with ONE audit, watch the LLM spend land
   on the dashboard, and reconcile it against the provider dashboards before running more.

## REPORT
- Step 1 findings (real column names + the vertical enum value used + how tier is set).
- The seed script created + the org_id / brand_id printed.
- Step 4 SQL result confirming the row.
- Note: do NOT run the audit from this script — that's the manual in-app step Sri will do.

## NOTE ON CLEANUP (for later)
This is test data in your prod DB. Before launch, this org + brand + subscription should be removed. Tag it
mentally as test data ("Plumbing Test Org" makes it easy to find and purge later).
