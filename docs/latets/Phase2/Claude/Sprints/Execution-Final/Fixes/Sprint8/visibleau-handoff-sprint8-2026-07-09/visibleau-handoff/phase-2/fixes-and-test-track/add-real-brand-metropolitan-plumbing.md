# Claude Code — ADD a REAL brand for report validation: Metropolitan Plumbing (then run a new audit)

## Why this brand
Bondi Plumbing is fictional → AI engines return 0 mentions/0 citations → the report renders 0/0 and validates nothing.
To exercise every report section with REAL non-zero data, insert a real Australian plumbing brand with genuine AI
presence, in the SAME org as Bondi Plumbing (so it's Agency-tier and appears in the same workspace), with REAL
competitor domains (so share-of-voice + competitive-benchmark populate).

**Chosen brand — Metropolitan Plumbing** (researched, verified):
- Name: `Metropolitan Plumbing`
- Domain: `metropolitanplumbing.com.au`
- National AU plumbing franchise, 3,700+ reviews, strong AI-answer presence, has a LinkedIn company page (also
  exercises the Sprint-5 LinkedIn slot). Real competitors below are all national/large AU plumbing brands that AI
  engines actually name — good for SoV/benchmark.
- Vertical: `tradies` (verified enum value). Region: `au`.
- primaryRegions (sub-region locations, text[]): major metros it serves — `['VIC:Melbourne','NSW:Sydney','QLD:Brisbane','SA:Adelaide','WA:Perth']`
- competitors (real AU plumbing brands AI engines cite, text[]):
  `['mremergency.com.au','fallonsolutions.com.au','jimsplumbing.net.au','hipages.com.au']`

(If you prefer a different real brand, alternates that also work: **Mr Emergency** `mremergency.com.au`, **Fallon
Solutions** `fallonsolutions.com.au` (SE QLD). Metropolitan is the safest for non-zero results.)

## Schema (verified against Foundations v1.12 — brands table, do NOT guess columns)
```
brands(
  id uuid default gen_random_uuid() PK,
  organization_id uuid NOT NULL FK→organizations.id,
  region region_enum NOT NULL,          -- 'au'
  name text NOT NULL,
  domain text NOT NULL,
  vertical vertical_enum NOT NULL,      -- 'tradies'
  primary_regions text[] NOT NULL default '{}',
  competitors text[] NOT NULL default '{}',
  created_at timestamptz NOT NULL default now(),
  updated_at timestamptz NOT NULL default now(),
  deleted_at timestamptz NULL
)
```
Vertical enum valid values: `tradies | allied_health | saas | professional_services | real_estate`. Use `tradies`.
Region enum is lowercase: `au` (not 'AU').

## STEP 1 — Find the target org (same as Bondi Plumbing) and confirm tier
```bash
psql "$DATABASE_URL" -c "SELECT b.id AS bondi_brand_id, b.organization_id, o.region, s.tier FROM brands b JOIN organizations o ON b.organization_id=o.id LEFT JOIN subscriptions s ON s.organization_id=o.id WHERE b.id='0f531803-b529-4d09-9fd6-b6272b5baba8';"
```
Report the `organization_id` and confirm tier is Agency (≥ Growth+, so reports work). Use THIS org_id for the insert.
(If for any reason you want it isolated, a different org works too — but same-org keeps it in the workspace you've been
testing.)

## STEP 2 — Insert the brand (idempotent — don't create duplicates on re-run)
Prefer a small committed script `scripts/seed-validation-brand.ts` using the app's Drizzle client (so types + enum
handling are correct), OR a guarded SQL insert. Idempotency: skip if a brand with this domain already exists in the org.
```sql
-- Guarded SQL (psql) — replace :ORG_ID with STEP 1's organization_id:
INSERT INTO brands (organization_id, region, name, domain, vertical, primary_regions, competitors)
SELECT
  ':ORG_ID'::uuid, 'au', 'Metropolitan Plumbing', 'metropolitanplumbing.com.au', 'tradies',
  ARRAY['VIC:Melbourne','NSW:Sydney','QLD:Brisbane','SA:Adelaide','WA:Perth'],
  ARRAY['mremergency.com.au','fallonsolutions.com.au','jimsplumbing.net.au','hipages.com.au']
WHERE NOT EXISTS (
  SELECT 1 FROM brands WHERE organization_id=':ORG_ID'::uuid AND domain='metropolitanplumbing.com.au' AND deleted_at IS NULL
)
RETURNING id, name, domain, vertical, region;
```
If using a Drizzle script instead, mirror the same fields + the same not-exists guard. Report the new brand's `id`.

## STEP 3 — Verify the insert
```bash
psql "$DATABASE_URL" -c "SELECT id, name, domain, vertical, region, primary_regions, competitors, organization_id FROM brands WHERE domain='metropolitanplumbing.com.au';"
```
Confirm: correct org, `vertical='tradies'`, `region='au'`, competitors + primary_regions populated as arrays.

## STEP 4 — Run a NEW audit for this brand (real LLMs) and let the pipeline run
Trigger an audit the normal way (UI "Run audit" on Metropolitan Plumbing, or the audit-create route) so:
`run-audit` → real LLM calls across engines → citations written (brandMentioned + citedSources) → `audit.complete` →
post-audit pipeline (share-of-voice, visibility-trend with the FIXED citation numerator, fan-out, topical, citation-
source) populates for the current ISO-week period.
Watch the Inngest terminal: confirm run-audit completes AND the post-audit functions run without error. Note the period
label the aggregator writes (should be the current ISO week, e.g. 2026-W27, via formatPeriodLabel).

## STEP 5 — Confirm REAL non-zero data landed, then generate the report
```bash
# New brand id from STEP 2/3:
psql "$DATABASE_URL" -c "SELECT period_label, mention_rate, citation_rate, mention_source_ratio, brand_archetype, updated_at FROM visibility_trends WHERE brand_id='<NEW_BRAND_ID>' ORDER BY updated_at DESC LIMIT 2;"
psql "$DATABASE_URL" -c "SELECT engine, sub_query_rank, original_prompt, sub_query FROM query_fan_out_results WHERE brand_id='<NEW_BRAND_ID>' ORDER BY sub_query_rank LIMIT 20;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) sov_rows FROM share_of_voice_snapshots WHERE brand_id='<NEW_BRAND_ID>';"
```
Expect (for a real, well-known brand): `mention_rate` and `citation_rate` NON-zero, `citation_rate ≤ mention_rate`
(the subset rule — proves the aggregator fix on REAL data), a sane archetype (likely NOT 'invisible' this time),
fan-out sub-queries that are clean standalone queries, SoV rows present.
Then generate a report for this brand for the current period and **OPEN the PDF**:
- Rates render ≤ 100% (no 7000% — proves the display fix on real data).
- Mention-Source Divide, fan-out coverage, topical-gap sections populate with REAL content (not "No data available").
- Numbers internally consistent (citation ≤ mention; archetype matches).

## VERDICT / report back
- New brand id, the visibility_trends row (mention_rate, citation_rate, archetype) from the REAL audit, whether
  citation ≤ mention holds on real data, and what the PDF's sections show. This is the real end-to-end validation the
  0/0 Bondi run couldn't provide.

## Constraints
- Same org as Bondi (Agency tier) unless you deliberately want isolation. region='au', vertical='tradies' (verified
  enum). text[] arrays for primary_regions + competitors. Idempotent insert (not-exists guard).
- Use the app's Drizzle client if scripting, so enum + array types serialize correctly.
- This is real-LLM spend across engines — one audit is enough to validate; no need to loop.
- Don't touch the Bondi brand or prior reports; this is additive.

## NOTE
Metropolitan Plumbing is a real national AU plumbing brand with genuine AI-answer presence and a LinkedIn page, in the
`tradies` vertical your pack already covers, with real competitor domains for SoV/benchmark. A fresh audit should
produce NON-zero mention/citation rates with citation ≤ mention — which finally validates BOTH the aggregator fix (real
data, subset rule holds) AND the display fix (real percentages ≤ 100%) end-to-end, in a way the fictional Bondi 0/0 run
never could. Read the PDF sections, not just the DB.
