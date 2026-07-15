# Claude Code — FIX (P3): coerce citationShare + scoreAtCapture NUMERIC-as-string at the route boundary (Number())

Two S5 API routes return NUMERIC(5,2) columns as raw Drizzle STRINGS to the frontend. Latent bug (the 7000%/toFixed
class): displays fine today, but breaks the moment any UI does `score * 100` (string repetition/NaN) or `.toFixed()`
(crash). Fix at the route boundary — coerce once where the value leaves the API, so the frontend ALWAYS gets a real
number regardless of what UI code does later. (trust-scorer.ts:66 already coerces scoreOf10 correctly — this brings the
other two NUMERIC columns in line.)

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod`; dev `visibleau`. Never real prod.

## The two columns (confirmed NUMERIC(5,2) → Drizzle STRING):
- `citation_share` — returned by `app/api/brands/[brandId]/citation-sources/route.ts` (~line 56)
- `score_at_capture` — returned by `app/api/brands/[brandId]/evidence/route.ts` (~line 56)
(consistencyScore + presenceScore are INTEGER → real numbers, NO coercion. scoreOf10 already coerced. Only these two.)

## STEP 1 — Read both routes + confirm the raw-string return
```bash
sed -n '40,75p' "app/api/brands/[brandId]/citation-sources/route.ts"
sed -n '40,75p' "app/api/brands/[brandId]/evidence/route.ts"
grep -n "citationShare\|citation_share\|scoreAtCapture\|score_at_capture\|Number(\|\.map(\|return NextResponse\|json(" "app/api/brands/[brandId]/citation-sources/route.ts" "app/api/brands/[brandId]/evidence/route.ts"
```
Report the exact return shape — is it `rows` mapped to a response, or returned raw? Coerce in the map/response builder.

## STEP 2 — Coerce citationShare (citation-sources route)
In the response builder, wrap the NUMERIC value in `Number()`:
```ts
// BEFORE: citationShare: row.citationShare            // "25.50" (string)
// AFTER:  citationShare: Number(row.citationShare)    // 25.5 (number)
```
- If the value can be NULL, guard it: `row.citationShare == null ? null : Number(row.citationShare)` (don't turn null
  into 0 or NaN — preserve null if the column is nullable).
- Coerce ONLY the NUMERIC column(s); leave integers/strings-that-are-genuinely-strings alone.

## STEP 3 — Coerce scoreAtCapture (evidence route)
Same pattern:
```ts
// AFTER: scoreAtCapture: row.scoreAtCapture == null ? null : Number(row.scoreAtCapture)
```
If the evidence route returns a list, coerce inside the `.map()` for each row.

## STEP 4 — Verify: real number out + renders correctly (real data, local prod)
```bash
# Hit each route (or open the sub-screen) and confirm the JSON value is a NUMBER, not a quoted string:
# citation-sources → "citationShare": 25.5   (not "25.50")
# evidence         → "scoreAtCapture": <number>   (not a string)
```
- API returns numbers (no quotes around the value in the JSON).
- On screen: open Citation Sources + Evidence Archive sub-screens → the values render the same/correct (coercion is
  display-safe: Number("25.50") → 25.5 shows as 25.5). No NaN, no change in what the user sees for valid values.
- Prove the tripwire is disarmed: (optional) a quick `Number(x).toFixed(1)` in a scratch check on the coerced value
  works, whereas `"25.50" as any).toFixed` would've been fine but string math (`"25.50"*100`) would've been "2550"...
  the point: downstream arithmetic now gets a real number.
Report: both routes return numbers; both sub-screens still render correctly.

## STEP 5 — (unblocks bug 4) note the citation test
Bug 4 (citation-intelligence.test.ts, 10 TS errors passing strings to a number param) is the SAME issue's fingerprint —
the test replicates the coercion problem. It's a SEPARATE fix (next), but note: once callers pass real numbers (post-
coercion), the test should be updated to pass NUMBERS (matching the real coerced contract), which clears the 10 TS
errors AND makes it assert the real behavior. Don't fix the test here — just confirm the coercion makes the correct
contract "number in, number out" so the test fix aligns.

## Report
- Both routes now coerce their NUMERIC column with Number() (null-guarded).
- API returns numbers (not quoted strings); sub-screens still render correctly on screen.
- Confirm no OTHER NUMERIC(5,2) column leaks raw from these or nearby trust routes (quick grep):
```bash
grep -rn "citationShare\|scoreAtCapture\|scoreOf10\|NUMERIC\|numeric(5" app/api/brands/**/trust* app/api/brands/**/*evidence* app/api/brands/**/*citation* app/api/brands/**/*entity* | grep -iv "Number(" | head
```

## Constraints
- Coerce at the ROUTE boundary (once), not scattered in UI components — the frontend should always receive numbers.
- Null-guard: nullable NUMERIC → null stays null (not 0/NaN). Only coerce non-null values.
- ONLY the two NUMERIC(5,2) columns (citationShare, scoreAtCapture) — integers need no coercion.
- Display-safe: valid values must render identically after coercion (Number("25.50")→25.5). Verify on screen.
- Dev/local-prod only, never real prod. LLD v8.70 wins.

## NOTE
The milder Drizzle-string bug (no as-number cast lie, so no crash today) — but citation_share/score_at_capture leave the
API as strings, a tripwire that breaks on the first `*100`/`.toFixed()`. Coerce with Number() at the route boundary
(null-guarded), so the frontend always gets real numbers. trust-scorer already does this for scoreOf10; this brings the
other two in line. Verify the JSON returns numbers and the sub-screens still render correctly. This also sets the correct
"number in/out" contract that unblocks fixing the type-broken citation test (bug 4, next).
