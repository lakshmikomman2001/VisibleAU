# Claude Code — FIX (HIGH): wins-feed crashes on multi-engine citations (sql<Date> returns string, not Date)

**Bug (found by BE-3 cross-sprint testing):** `getWinsFeed` **crashes the entire wins feed** when a brand has
citations from **2+ engines**. In `findNewEngineCoverage` (`lib/communication/wins-feed.ts`), the query uses
`sql<Date>\`MAX(${citations.createdAt})\`` — but Drizzle/postgres returns that timestamp as a **string**, NOT a
`Date`. The `sql<Date>` generic is a *type annotation only*; it does not coerce the runtime value. The sort at
**wins-feed.ts:39** then calls **`.getTime()`** on that string → **TypeError**, which throws out of the whole
`getWinsFeed` call. So ANY brand with multi-engine citation history (i.e. most real brands) gets a broken wins feed,
not just a missing new_engine_coverage win.

Severity: HIGH — customer-facing crash on the flagship wins surface for real (multi-engine) brands.

> This is the "type says Date, runtime is a string" class — the annotation lied; the code trusted it. Fix the
> runtime coercion, not the annotation.

## STEP 1 — Read the actual code
```bash
sed -n '1,80p' lib/communication/wins-feed.ts
grep -n "findNewEngineCoverage\|getTime\|sql<Date>\|MAX(\|createdAt\|\.sort(" lib/communication/wins-feed.ts
```
Confirm: `findNewEngineCoverage` returns rows where the max-created-at field is a **string** (from `MAX()`), and
line ~39 sorts by calling `.getTime()` on it.

## STEP 2 — Fix: coerce the MAX() result to a Date before it's sorted
Two acceptable approaches — pick the one that fits the code:
- **Preferred (coerce at the source):** where `findNewEngineCoverage` builds each win's timestamp from the `MAX()`
  result, wrap it: `new Date(row.maxCreatedAt as string)` (or the actual field name), so downstream always has a
  real `Date`. Then the sort's `.getTime()` is safe.
- **Or (coerce at the sort):** at wins-feed.ts:39, sort by `new Date(x.detectedAt).getTime()` (coerce both sides),
  so a string timestamp doesn't throw.
Prefer coercing **at the source** (in `findNewEngineCoverage`) so every consumer of that value gets a real Date, not
just this one sort — that prevents the same string-not-Date footgun re-appearing wherever else the value is used.
- Keep the `sql<Date>` annotation OR change it to `sql<string>` to reflect reality — but the important fix is the
  **runtime coercion**. (If you keep `sql<Date>`, add a one-line comment that MAX() actually returns a string so the
  next reader isn't misled.)

## STEP 3 — Guard against the same bug elsewhere
```bash
# Other places that trust sql<Date> / raw timestamp strings then call date methods:
grep -rn "sql<Date>" lib/ app/ | head
grep -rn "MAX(\|MIN(" lib/ app/ | grep -i "createdAt\|updatedAt\|detectedAt\|_at" | head
```
Report any OTHER `sql<Date>` (or `MAX/MIN` on a timestamp) whose result is later treated as a real `Date`
(`.getTime()`, `.toISOString()`, date math, sort). If found, note them — fix the ones in the wins/visibility paths
now; flag others for follow-up. (This is the same class; there may be siblings.)

## VERIFY — the exact crash case
1. Add/confirm a test: a brand with citations from **2+ engines** → `getWinsFeed` **returns successfully** (no
   TypeError), and the new_engine_coverage win sorts correctly by date. (This is the BE-3 failing case — it must go
   green.)
2. Re-run the wins-feed tests + the full Sprint 3 suite — all green, no regression to the other win types
   (gap_closed, new_citation, visibility_up, competitor_down) or the "likely linked to:" attribution / LIMIT 20 /
   max 50 guards.
3. Confirm the fix is the **runtime coercion** (a real Date reaches `.getTime()`), not a silenced/removed sort.

## INVARIANTS
- Fix the runtime value (coerce to Date), don't just change the annotation.
- Don't regress the other wins-feed behaviours (5 win types, attribution honesty, pagination).
- Prefer coercing at the source in `findNewEngineCoverage` so all consumers get a Date.
- TS strict, no `any` (use a typed coercion, e.g. `new Date(value)` where value is typed string).

## REPORT
- The exact line(s) changed + which approach (source-coerce preferred).
- The multi-engine test now passes (the BE-3 crash case is green).
- Any OTHER `sql<Date>` / MAX-timestamp string-not-Date sites found (fixed or flagged).
- Full Sprint 3 suite green; other win types unaffected.
