# FIX S9-MED-04 (F16 + F18) — Discovery: 0 journeys (envelope) + the "View →" link 404s (dead route)

## TWO bugs on the same card — and they shielded each other
| # | Sev | Bug |
|---|---|---|
| **F16** | MED | The Conversational Journeys card shows **0 journeys** for every brand — `Array.isArray()` on the wrapped `{ journeys, templates }` envelope is always false → falls through to `[]` |
| **F18** | MED | The card's **"View →" link 404s** — it points at `/brands/{id}/discovery/journeys`, a page that does not exist |

**Why F16 stayed hidden:** nobody could click through to a journeys detail view to notice the count
was wrong, **because the detail view 404s**. The dead link concealed the empty count. Fix both.

## The on-screen evidence (a perfect control)
Metropolitan's Discovery page:
| Card | Route shape | Renders |
|---|---|---|
| Conversational Journeys | **`{ journeys, templates }`** (envelope) | **0 journeys** ❌ |
| Competitor Comparisons | **bare array** | **16 results** ✅ |

Same page, same brand, same fetch pattern — **the one with the envelope is broken; the one without
works.** That is F16 demonstrated as cleanly as possible. And Metropolitan having 16 comparisons
strongly implies it HAS journey data too (an S7 brand that ran comparisons almost certainly ran
journeys) — so the 0 is a lie, not an honest empty.

---

## STEP 1 — F18 first: does the journeys detail route exist? Does comparisons?
```bash
cd c:/startup/VisibleAU/src
ls -R "app/(auth)/brands/[brandId]/discovery/" 2>/dev/null
# Where do the two "View →" links point?
grep -n "href\|Link\|View" "app/(auth)/brands/[brandId]/discovery/page.tsx" | head -20
# Does a comparisons detail page exist?
find "app/(auth)/brands/[brandId]/discovery" -name "page.tsx" 2>/dev/null
```
**CLASSIFY:**
- **CASE A — comparisons/ exists, journeys/ doesn't** → only the journeys sub-route is missing. Build
  it (mirroring the comparisons page's shape), or — if journeys detail was never in scope — **remove
  the dead "View →" link** rather than leaving a 404. A link that 404s is worse than no link.
- **CASE B — NEITHER sub-route exists** (both "View →" links 404) → the whole Discovery detail layer
  is unbuilt. **REPORT before building** — that's a scope question for Sri, not a fix to do
  unilaterally. (Check: does Metropolitan's Competitor Comparisons "View →" also 404? Its card says
  "16 results" — test that link.)
- **CASE C — both exist** and only the URL is wrong → fix the href.

⚠️ **Do not build a whole new journeys screen unprompted.** Report the case, propose the minimal
option, let Sri decide. If the detail page is out of scope, the correct fix is to **remove or disable
the dead link** (and/or make the card non-clickable) so the UI doesn't promise a page that isn't
there.

## STEP 2 — F16: unwrap the journeys envelope
```bash
grep -n "return NextResponse.json\|json(" "app/api/brands/[brandId]/journeys/route.ts" | head -3
sed -n '1,80p' "app/(auth)/brands/[brandId]/discovery/page.tsx"
```
Fix (named key first, defensive):
```ts
const raw       = res.ok ? await res.json() : null;
const journeys  = raw?.journeys  ?? (Array.isArray(raw) ? raw : []);
const templates = raw?.templates ?? [];
```
**Check EVERY fetch on the discovery page** — comparisons is a bare array (works), but confirm there
are no others with the same latent bug.

## STEP 3 — Verify the count against the DB (the F11 discipline)
A rendering number is not proof of a correct number.
```bash
psql "$PROD" -c "
  SELECT COUNT(*) AS journeys
  FROM conversational_journeys
  WHERE brand_id = '418f321f-2489-4560-aaa9-895728580465';"   -- Metropolitan
psql "$PROD" -c "
  SELECT COUNT(*) AS journeys
  FROM conversational_journeys
  WHERE brand_id = '0f531803-b529-4d09-9fd6-b6272b5baba8';"   -- Bondi
```
The rendered "N journeys" on each brand's Discovery card **must match these counts**.
- If Metropolitan now shows a non-zero count matching the DB → **F16 fixed**.
- If it still shows 0 AND the DB says 0 → the table is genuinely empty (an honest empty; then note
  that the journeys path is unverifiable from the UI — an upstream S7 data question, not an S9 bug).
  **Report which.**

## STEP 4 — The envelope guard: remove the F16 waiver
`envelope-unwrap-guard.test.ts` currently carries an explicit **waiver for `/journeys`**. Once fixed:
- **Remove the waiver.** The guard's stale-waiver check should then FAIL if the waiver is left in
  place while the page correctly unwraps — that's the check working as designed. Confirm it goes
  green only after the waiver is removed.

## STEP 5 — Add a dead-link guard (F18's class)
The nav guard (F10) asserts every brand route HAS a tile. **F18 is the inverse: a link that points at
a route that does NOT exist.** Add the reverse check:
- Enumerate every internal `href` in the app's pages/components.
- Assert each resolves to an existing route (a `page.tsx` under `app/`).
- Fail on any href with no matching route (with a waiver list for intentional externals/anchors).
This would have caught F18 at build time. Same set-difference shape as the other two guards.

## Constraints
- **Do NOT build a new journeys detail screen unprompted** — report the case (A/B/C) and the minimal
  option first.
- If the detail page is out of scope → **remove the dead link** (a 404 is worse than no link).
- Verify the journey count against the DB (not just "it renders a number").
- Remove the `/journeys` waiver from the envelope guard once fixed.
- The new dead-link guard must catch the NEXT one without editing the test.

## Report back (paste inline)
1. **CASE A / B / C** — which sub-routes exist? Does the Competitor Comparisons "View →" also 404?
2. The journeys unwrap diff.
3. **Screenshot** Metropolitan's Discovery card — the journey count + the DB count → **do they MATCH?**
4. What you did about the dead "View →" (built the route? removed the link? reported for a decision?).
5. The envelope-guard waiver removed + still green.
6. The new dead-link guard + its re-break.
