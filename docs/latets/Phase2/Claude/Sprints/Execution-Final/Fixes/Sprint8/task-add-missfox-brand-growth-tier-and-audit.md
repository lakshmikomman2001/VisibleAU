# TASK — Add "MISS FOX" (real AU day spa) as a brand to a GROWTH-tier account + run ONE real audit

## Environment
Run against **`visibleau_prod`** (the local-prod DB wired to real LLM / real Stripe sandbox / real
ABN Lookup with the authorised GUID / real Supabase storage). This will incur **real ABN lookup +
real LLM spend** — that is intended (Sri approved). This is a **single real AU SMB** used as a
realistic Growth-tier test fixture, using only public business facts.

## The brand (public facts — verified via web)
- **Name:** MISS FOX  (award-winning day spa / beauty salon / skin clinic)
- **Domain:** `missfox.com.au`
- **Location:** 285 Little Collins Street, Melbourne VIC 3000 (single CBD location)
- **Vertical:** health / beauty / wellness (NOT tradies)
- **Region:** Melbourne, VIC (AU)
- **ABN:** DO NOT invent — fetch it live via the real ABN Lookup integration (below).

## Prerequisites — confirm the Growth account exists and is correct
This must go on a **Growth-tier** org (Growth = single AU SMB, 1 brand, 4 engines). Two cases:

### Case A — a Growth org already exists (e.g. the one Sri switched to Growth for the F18 test)
Confirm and use it:
```bash
cd c:/startup/VisibleAU/src
# Find Growth-tier orgs (tier is on subscriptions, NEVER organizations.tier):
psql "$PROD" -c "
  SELECT o.id, o.name, s.tier
  FROM organizations o
  JOIN subscriptions s ON s.organization_id = o.id
  WHERE s.tier = 'growth'
  ORDER BY o.name;"
```
Pick the intended Growth org; capture its `id` as `$ORG`.

### Case B — no Growth org exists / Sri wants a fresh one
Create a Growth org through the app's normal provisioning path (do NOT hand-INSERT — provisioning
now seeds the owner org_members row + residency rows per the recent fixes; bypassing it re-creates
the gaps we just closed). If a seed/script path exists for a test org, use it, then set its
`subscriptions.tier = 'growth'`. Confirm the owner org_members row + 7 residency rows exist (the
provisioning fixes should produce them). Capture `$ORG`.

> IMPORTANT: brand tier limits. Growth = **1 brand**. If `$ORG` already has a brand, adding MISS FOX
> would exceed the Growth brand limit (`TIER_BRAND_LIMITS`). Check first:
> ```bash
> psql "$PROD" -c "SELECT id, name, domain FROM brands WHERE organization_id = '$ORG';"
> ```
> If a brand already exists on the Growth org, STOP and ask Sri whether to (a) use a fresh Growth
> org, or (b) remove/replace the existing brand. Do not silently exceed the limit or let the add
> fail opaquely.

## Step 1 — Fetch the real ABN via the live ABN Lookup (do NOT invent)
Use the existing ABN Lookup integration (the one with the authorised government GUID — the same
path the brand-create/entity flow uses). Search by name + verify against the Melbourne CBD address:
```bash
# Locate the ABN lookup util the app already uses:
grep -Rn "abn\|ABN\|abr\|guid\|abnLookup\|abrLookup" lib/ app/api | grep -vi test | grep -iE "lookup|abn|abr|guid" | head
```
Run the app's ABN search for "MISS FOX" (or the registered entity behind it) and capture the
**real ABN + registered entity name + status**. If multiple candidates return, pick the one whose
registered/trading name + state (VIC) match MISS FOX Melbourne; if genuinely ambiguous, REPORT the
candidates to Sri rather than guessing. The brand-entity record stores `abn_number`,
`abn_entity_name`, `abn_status` — these come from the live lookup, not from this prompt.

## Step 2 — Create the brand through the real brand-create path
Use the app's actual brand-creation flow (API/route + service), NOT a raw INSERT — so all the
Phase-1/2 side effects fire (brand_entity_scores init, RLS org scoping, region inheritance, etc.).
```bash
# Find the brand-create route/service:
grep -Rn "insert(brands)\|createBrand\|brands).values\|POST.*brands" app/api lib/ | grep -v test | head
```
Create with:
- name: `MISS FOX`
- domain: `missfox.com.au`
- vertical: the health/beauty vertical key the app uses (confirm the enum — likely `beauty`,
  `wellness`, `health`, or a `personal-services` key; pick the CLOSEST existing vertical, do NOT
  invent a new vertical value). If no beauty/wellness vertical exists and only `tradies`+others do,
  REPORT the available vertical enum to Sri and ask which to map to (do not force `tradies`).
- region / primary region: Melbourne, VIC (AU)
- organization_id: `$ORG`
- competitors: leave empty OR add 2–4 real Melbourne day-spa competitors if the create flow accepts
  them (e.g. `endotaspa.com.au`, `aurorasparetreat.com.au`, `sakuraspa.com.au`, `chuanspa` at The
  Langham). Only add competitors the flow supports; if unsure, create with none and let Sri add
  them via the UI. Do NOT fabricate competitor domains — use real ones or none.
- Attach the ABN fields from Step 1 to the brand-entity record via the normal path.

## Step 3 — Verify the brand landed correctly (both the row and the entity)
```bash
psql "$PROD" -c "
  SELECT b.id, b.name, b.domain, b.vertical, b.organization_id
  FROM brands b WHERE b.domain = 'missfox.com.au' AND b.organization_id = '$ORG';"
psql "$PROD" -c "
  SELECT abn_number, abn_entity_name, abn_status, abn_verified
  FROM brand_entity_scores
  WHERE brand_id = (SELECT id FROM brands WHERE domain='missfox.com.au' AND organization_id='$ORG');"
```
EXPECT: one brand row on `$ORG`; the ABN fields populated from the live lookup (not null, not a
placeholder). Capture the brand `id` as `$BRAND`.

## Step 4 — Run ONE real audit (real LLM spend — approved)
Trigger a real audit through the app's normal run-audit path for `$BRAND` (the same path the "Run
audit" button uses). Growth = 4 engines (ChatGPT + Claude + Gemini + Perplexity). Then:
```bash
# Watch the server terminal during the run for errors (esp. any 23502 / null-org / dot-vs-slash).
# After it completes, confirm an audit row + results landed:
psql "$PROD" -c "
  SELECT id, status, created_at FROM audits
  WHERE brand_id = '$BRAND' ORDER BY created_at DESC LIMIT 3;"
```
EXPECT: an audit row with status reaching the completed state (canon: `audits.status='complete'`,
no -d). REPORT the terminal output of the run — specifically any errors, and whether all 4 engines
returned. (This audit doubles as a real-world smoke test of the S8 webhook chain if any webhook
endpoints are configured on `$ORG` — note any `webhook_deliveries` rows that appear.)

## Constraints
- **Do NOT invent the ABN** — it comes from the live ABN Lookup (Step 1). If the lookup can't
  resolve MISS FOX unambiguously, report candidates and stop.
- **Do NOT invent a vertical value** — map to the closest existing enum or ask.
- **Do NOT raw-INSERT** the org or brand — use the real provisioning/create paths so side effects
  (owner seed, residency rows, entity init, RLS) fire. Bypassing them re-opens the gaps just fixed.
- Tier checks use `subscriptions.tier`, never `organizations.tier`.
- Respect the Growth **1-brand** limit — check before adding; stop if it would exceed.
- Real facts only: name/domain/address/awards are public; competitors must be real domains or none.

## Report back (paste inline)
1. Which Growth org was used (`$ORG`) + confirmation it's `subscriptions.tier='growth'` and within
   the 1-brand limit.
2. The real ABN + registered entity name + status returned by the live lookup (or the candidate
   list if ambiguous).
3. The Step 3 brand + entity verification rows (`$BRAND`, ABN fields populated).
4. The Step 4 audit result: audit row status + a summary of the run terminal (errors? all 4
   engines? any webhook_deliveries?).
