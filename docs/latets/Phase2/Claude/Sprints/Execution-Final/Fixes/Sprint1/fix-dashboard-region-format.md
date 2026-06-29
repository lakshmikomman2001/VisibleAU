# VisibleAU — FIX: region format leaking raw to the dashboard (`au · nsw:sydney:marrickville`)

**Found in manual testing** on `/dashboard` (Recent audits list). Marrickville Dental Studio renders
`au · nsw:sydney:marrickville` while Bondi Plumbing renders `NSW · Bondi`. Two bugs at once:

1. **FORMATTER** — the audit-list region badge isn't applying `formatLocation()` (or its equivalent), so a
   non-canonical `primaryRegions` value leaks to the screen verbatim instead of being formatted/guarded.
2. **SEED DATA** — Marrickville's `primaryRegions` is stored in an INVALID format
   (`nsw:sydney:marrickville` — lowercase + 3-level) instead of canonical `STATE:Suburb` (`NSW:Marrickville`).

**Fix order: formatter FIRST (so no bad value can ever leak again), seed data SECOND (clean existing rows).**
Severity: LOW–MEDIUM (visible correctness + canon-compliance; not blocking).

---

## CANONICAL CONTRACT (from canon — do not deviate)

- **`primaryRegions`** is `TEXT[]`; each entry is **`STATE:Suburb`** — uppercase 2–4-char state, colon, suburb.
  Regex (Sprint 1 W4, the Zod validator): `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`.
  Valid: `NSW:Bondi`, `VIC:Fitzroy`, `QLD:Brisbane CBD`. Foundations §3: "stored as 'NSW:Bondi' format (state:suburb)".
- **`formatLocation('NSW:Bondi')` → `'Bondi, NSW'`** (Suburb, STATE). This is the canonical display transform.
- **`region`** is the lowercase country enum (`'au'`, `'nz'`, …) — a SEPARATE field from primaryRegions. Do
  NOT concatenate `region` + raw `primaryRegions` into the badge.
- Dashboard intent (Sprint 4 spec): the region badge = **first value of `brand.primaryRegions`, formatted**
  (fallback to org region only if primaryRegions is empty). NOT the raw joined string, NOT `region · raw`.

---

## PART 1 — FORMATTER (the durable guard) — do this first

### 1a. Confirm `formatLocation` exists and is canonical
```bash
grep -rn "formatLocation\|function formatLocation\|export const formatLocation" lib/ app/ --include=*.ts --include=*.tsx | head
```
- If it exists: confirm it does `'NSW:Bondi' → 'Bondi, NSW'` and **handles malformed input gracefully** (see 1c).
- If it does NOT exist: create it in the shared location helper (e.g. `lib/utils/location.ts` or wherever the
  region helpers live per Foundations "Helper functions parse and validate").

### 1b. Apply it on the dashboard Recent-audits list
Find the audit-list row component rendering the region badge (the one showing `NSW · Bondi` /
`au · nsw:sydney:marrickville`):
```bash
grep -rn "primaryRegions\|· Bondi\|region.*badge\|Recent audits" app/ components/ --include=*.tsx | head
```
Fix the badge to render **`formatLocation(brand.primaryRegions[0])`** (first primaryRegions value, formatted),
falling back to the org region only when `primaryRegions` is empty. **Remove any `region + ':' + ...` or
`region · primaryRegions` concatenation** — the `au ·` prefix is the bug signature; it must not be prepended.

### 1c. Make `formatLocation` defensive (so a bad value is normalized, never leaked raw)
`formatLocation` must not pass through unrecognized input verbatim. Required behaviour:
- Valid `STATE:Suburb` → `'Suburb, STATE'`.
- Input with MORE than one colon (e.g. `nsw:sydney:marrickville`) → take the **first** segment as state and the
  **last** as suburb, and **uppercase the state**: → `'Marrickville, NSW'`. (Defensive normalization so legacy/
  malformed rows still display cleanly while the seed fix catches up.)
- Lowercase state → uppercase it.
- Empty/null → return the fallback (org region label or `'—'`), never `undefined`/`'null'`.
Add a unit test covering: canonical input, the 3-level malformed case, lowercase-state, and empty.

> Why defensive: even after Part 2 cleans current data, a future bad write or import shouldn't leak raw to the
> UI again. The formatter is the guarantee; the seed fix is the cleanup.

---

## PART 2 — SEED DATA (correct existing rows) — do this second

### 2a. Find every brand with a non-canonical `primaryRegions`
```sql
-- List all brands' primaryRegions to see which violate STATE:Suburb:
SELECT id, name, primary_regions FROM brands ORDER BY name;
```
Flag any entry that is NOT `^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$` — i.e. lowercase state, or >1 colon
(3-level), or country-prefixed. From the screen, Marrickville (`nsw:sydney:marrickville`) is one; check whether
others (e.g. any seeded with `au:...` or lowercase) are too.

### 2b. Correct them to canonical `STATE:Suburb`
For each bad row, rewrite to 2-level uppercase-state:suburb. Marrickville:
```sql
-- 'nsw:sydney:marrickville'  →  'NSW:Marrickville'   (drop the city level; uppercase state)
UPDATE brands
SET primary_regions = ARRAY['NSW:Marrickville']
WHERE name = 'Marrickville Dental Studio';   -- or target by id from 2a
```
Apply the analogous correction to any other malformed rows found in 2a. **Scope every UPDATE with a WHERE
clause** (id or name) — never an unscoped `UPDATE brands SET primary_regions = ...` (that footgun bit Sprint 10).

### 2c. Re-validate
```sql
SELECT id, name, primary_regions FROM brands ORDER BY name;
-- every entry now matches ^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$
```
Also check the seed script/fixtures that CREATED Marrickville — if a seed file hardcodes
`nsw:sydney:marrickville`, fix it there too so re-seeding doesn't reintroduce the bad value:
```bash
grep -rn "marrickville\|sydney:marrickville\|nsw:sydney" scripts/ prisma/ supabase/ seed* --include=*.ts --include=*.sql -i | head
```

---

## VERIFY (behavioural — look at the actual screen)
1. **Formatter unit test** green (canonical + 3-level + lowercase + empty cases).
2. Reload `/dashboard` — the Recent audits list shows **`Marrickville, NSW`** (or `NSW · Marrickville` per the
   badge's separator style), NOT `au · nsw:sydney:marrickville`. Bondi still shows correctly.
3. No row anywhere in the list shows a lowercase-colon or `au ·`-prefixed region.
4. Check one other audit-listing surface (brand detail page, agency dashboard) — confirm the same value now
   renders formatted there too (proves the formatter fix, not just a per-screen patch).
5. `SELECT ... primary_regions FROM brands` — all canonical.

## REPORT
- Part 1: where `formatLocation` lives, the badge component fixed, the defensive cases added + test result.
- Part 2: which brands were malformed (from 2a), the corrected values, seed-file fix if any, re-validation.
- Confirmation from the rendered dashboard (item 2–4 above). Note any other malformed brands found beyond Marrickville.
