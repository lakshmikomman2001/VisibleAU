# Claude Code — FIX (HIGH): wins-feed crashes on multi-engine citations (sql<Date> returns string, not Date)

**Bug (BE-3 cross-sprint):** `getWinsFeed` **crashes the entire wins feed** when a brand has citations from **2+
engines**. In `findNewEngineCoverage` (`lib/communication/wins-feed.ts`), `sql<Date>\`MAX(${citations.createdAt})\``
returns a **string** (Drizzle/postgres timestamps come back as strings; the `sql<Date>` generic is a type annotation
only, it does NOT coerce). The sort at **wins-feed.ts:39** calls **`.getTime()`** on that string → **TypeError**,
throwing out of the whole `getWinsFeed`. ANY brand with multi-engine citations (most real brands) → broken wins feed.

Severity HIGH — customer-facing crash on the wins surface.

## ✅ THREE-SOURCE CHECK (LLD v8.70 + Sprint 3 prompt + prototype FIX17) — done, fix CONFIRMED in scope
- **LLD 7947-7960 (authority):** `new_engine_coverage` **IS a Phase A (Sprint 3) win type** — one of the 5:
  new_citation, new_engine_coverage, visibility_up, competitor_down, gap_closed. So it is CORRECT that it runs this
  sprint. The fix is to **fix the crash**, NOT to disable the type.
- **Sprint 3 prompt §6.8:** confirms `new_engine_coverage` (Phase 1 citations table) is Phase A. Win **shape per LLD
  7783** — the fix must NOT change the shape (type union / fields); it only coerces the timestamp.
- **Prototype FIX17 (L495/1353/1392):** wins-feed HAS a UI surface (`.wins-item`, wired to `GET /api/brands/[id]/
  wins`) — so this crash breaks a real prototype surface when wins are shown. Fixing it is right.
- **Conflict check:** none. All three agree new_engine_coverage is a valid Phase-A type; fix the crash, keep shape.

## STEP 1 — Read the code
```bash
sed -n '1,80p' lib/communication/wins-feed.ts
grep -n "findNewEngineCoverage\|getTime\|sql<Date>\|MAX(\|createdAt\|\.sort(" lib/communication/wins-feed.ts
```
Confirm `findNewEngineCoverage`'s max-created-at is a string and line ~39 sorts via `.getTime()` on it.

## STEP 2 — Fix: coerce MAX() to a real Date (prefer at the source)
- **Preferred:** in `findNewEngineCoverage`, wrap the MAX result: `new Date(row.maxCreatedAt as string)` (actual
  field name) so every consumer gets a real Date; then the sort's `.getTime()` is safe.
- Or coerce at the sort (wins-feed.ts:39): `new Date(x.detectedAt).getTime()` on both sides.
- Prefer source-coercion so the same footgun can't recur wherever else the value is read.
- The `sql<Date>` annotation may stay or become `sql<string>` — the REAL fix is the runtime `new Date()`. If you
  keep `sql<Date>`, add a one-line comment that MAX() returns a string.

## STEP 3 — Sibling audit (SCOPED by the 3-source check — this is the corrected part)
The LLD tells us exactly which siblings exist NOW vs later:
- **THIS SPRINT (check + fix if same bug):** the other Phase-A win types that read timestamps —
  `new_citation` (also citations table), `visibility_up` (visibility_trends), `competitor_down`
  (share_of_voice_snapshots). Grep each for a `MAX(...)`/timestamp later hit with `.getTime()`/date math/sort; fix
  any with the same string-not-Date pattern.
```bash
grep -n "getTime\|MAX(\|MIN(\|new Date\|\.sort(\|detectedAt\|createdAt\|calculatedAt" lib/communication/wins-feed.ts
```
- **BANK for Sprint 5 (do NOT fix now — not built yet):** `trust_improved` is **Phase B / Sprint 5** (LLD
  7962-7970) and will use **`MAX(checkedAt)`** — it will need the SAME `new Date()` coercion when built. Note this
  so S5 doesn't reintroduce the crash. (My earlier prompt wrongly told you to check MAX(checkedAt) now — that code
  doesn't exist in S3 yet.)

## VERIFY — the exact crash case
1. Test: a brand with citations from **2+ engines** → `getWinsFeed` returns successfully (no TypeError), and the
   new_engine_coverage win sorts correctly by date. (The BE-3 failing case → green.)
2. Re-run wins-feed tests + full Sprint 3 suite — green; no regression to the other 4 Phase-A win types, the
   "likely linked to:" attribution, or LIMIT 20 / max 50.
3. Confirm the fix is runtime coercion (a real Date reaches `.getTime()`), not a removed/silenced sort, and the win
   SHAPE (LLD 7783) is unchanged.

## INVARIANTS
- Fix the runtime value (Date coercion); don't just change the annotation. Don't change the win shape (LLD 7783).
- Keep all 5 Phase-A win types working; don't disable new_engine_coverage (LLD confirms it's Phase A).
- Prefer source-coercion in findNewEngineCoverage. TS strict, no `any`.

## REPORT
- Line(s) changed + approach (source-coerce preferred).
- Multi-engine test green (BE-3 crash case fixed).
- Sibling audit result: any of new_citation / visibility_up / competitor_down with the same pattern (fixed);
  confirm trust_improved (S5, MAX(checkedAt)) is BANKED for S5, not touched now.
- Full Sprint 3 suite green; win shape (LLD 7783) unchanged.

## NOTE (three-source discipline)
This fix was re-checked against the LLD (authority), the Sprint 3 prompt, and the prototype before writing. The LLD
corrected the sibling scope (trust_improved's MAX(checkedAt) is Sprint 5, not now) and confirmed new_engine_coverage
is a valid Phase-A type (fix the crash, don't disable it).
