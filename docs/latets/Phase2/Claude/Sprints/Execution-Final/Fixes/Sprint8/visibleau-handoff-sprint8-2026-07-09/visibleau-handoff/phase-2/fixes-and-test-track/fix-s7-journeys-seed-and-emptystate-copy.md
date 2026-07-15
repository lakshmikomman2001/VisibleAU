# Claude Code — FIX: Journeys missing the mandatory prebuilt seed + wrong empty-state copy (both Journeys & Comparisons)

Two confirmed bugs on the Discovery sub-screens, both empty-state/seed issues:

**Bug 3 [the real one] — Journeys: the MANDATORY §5.5 seed (acceptance criterion) isn't showing + wrong empty copy.**
§5.5 (LLD 9046) is a MANDATORY seed: **3 pre-built conversation_journeys per vertical** (clonable templates). Metropolitan
is tradies → 3 tradies journeys should show here as clonable. The screen shows "No journeys configured / Create a journey
via the API" — but canon empty state (§6U.3) is **"No journeys yet — clone a pre-built one to start"**. So (a) the copy is
wrong (says "use the API" — developer-only — instead of "clone a pre-built one" — the UI action), AND (b) the pre-built
journeys aren't reaching the screen (seed not on prod, OR the query excludes templates). The build report said
"prebuilt-journeys.ts — 15 journeys" so the seed FILE exists but isn't landing.

**Bug 4 — Comparisons: wrong empty-state copy.** Canon (§6U.4) empty state = **"Add competitors to your brand to see
head-to-head results"**. Screen says "No comparison data yet / Comparisons run automatically after each audit cycle."
(Metropolitan HAS 4 competitors set, so it's genuinely empty because no audit has completed+emitted since S7 — the
dual-emit dependency — but the CANONICAL copy is the competitors one; the build invented different copy.)

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod` + dev `visibleau`. Never real prod.
Brand: Metropolitan 418f321f-2489-4560-aaa9-895728580465 (tradies, HAS competitors).

## STEP 1 — DIAGNOSE the missing journeys: seed-not-on-prod vs query-excludes-templates
```bash
# Is the seed actually in the DB? Check BOTH databases (the recurring dev/prod gap):
psql "$DEV_URL"  -c "SELECT count(*), vertical FROM conversation_journeys GROUP BY vertical;"
psql "$PROD_URL" -c "SELECT count(*), vertical FROM conversation_journeys GROUP BY vertical;"
# Specifically tradies (what Metropolitan needs):
psql "$PROD_URL" -c "SELECT id, name, vertical, organization_id FROM conversation_journeys WHERE vertical='tradies';"
# How does the journeys page/API query them? Does it filter by organization_id (excluding global templates)?
cat "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx"
grep -rn "conversation_journeys\|organization_id\|prebuilt\|template\|vertical" app/api/**/journeys/**/*.ts "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx" | head
```
Report which:
- **A (seed not on prod):** tradies count = 0 on prod (maybe present on dev) → the seed wasn't applied to prod. → run
  the prebuilt-journeys seed on prod.
- **B (query excludes templates):** journeys ARE in the DB (e.g. organization_id NULL = global templates) but the page
  query filters `WHERE organization_id = {org}` → excludes them. → the page must show pre-built templates (org_id NULL
  OR a template flag) alongside the org's own journeys.
- Could be BOTH (seed not on prod AND query would exclude them).

## STEP 2 — FIX the seed/query (per diagnosis)

### If A (seed not on prod):
Run the prebuilt-journeys seed against local prod (visibleau_prod), same as dev. Confirm:
```bash
psql "$PROD_URL" -c "SELECT count(*) FROM conversation_journeys WHERE vertical='tradies';"   # expect 3
```
(Recurring lesson: the seed/migration must be applied to BOTH DBs — verify in the DB, don't trust "seed ran".)

### If B (query excludes templates):
The journeys page must surface the pre-built templates. Per §5.5 they're "template journeys an org can clone/activate" —
so they're likely global (organization_id NULL) or flagged. Update the page/API query to show:
- the pre-built templates for the brand's vertical (tradies), AND
- any journeys this org has already created/cloned.
So Metropolitan (tradies) sees the 3 tradies templates as clonable, even with none cloned yet.

## STEP 3 — FIX the empty-state COPY (both screens — to the canonical text)
### Journeys (§6U.3):
Change "No journeys configured / Create a journey via the API to get started" → the canonical
**"No journeys yet — clone a pre-built one to start"**. (And if STEP 2 surfaces the templates, this screen won't even BE
empty for tradies — it'll list the 3 clonable templates. The empty copy only shows for a vertical with no templates.)
### Comparisons (§6U.4):
Change "No comparison data yet / Comparisons run automatically after each audit cycle" → the canonical
**"Add competitors to your brand to see head-to-head results"**. (Note: since Metropolitan HAS competitors, consider the
nuance — canon's empty state assumes no competitors; if competitors ARE set but no audit has run, a truthful variant like
"Comparisons will appear after your next audit" is arguably more accurate. Match canon's copy as the default; if you keep
an audit-pending variant, make it conditional on competitors being present. Report which you did.)

## STEP 4 — Verify on screen
Reload `/brands/418f321f.../discovery/journeys`:
- If tradies templates now show: the 3 pre-built tradies journeys are LISTED as clonable (name + turn count + a
  clone/run action) — NOT an empty "use the API" state.
- If genuinely empty for some reason: the copy reads "No journeys yet — clone a pre-built one to start" (canonical), not
  "via the API".
Reload `/discovery/comparisons`:
- Empty-state copy is the canonical competitors copy (or the conditional audit-pending variant if competitors are set).
Report both screens on screen.

## STEP 5 — Report + guard
- STEP 1: the diagnosis (seed-not-on-prod / query-excludes-templates / both), with the DB counts.
- STEP 2: seed applied to prod (count=3 tradies) and/or the query fixed to show templates.
- STEP 3: both empty-state copies corrected to canon.
- STEP 4: on screen — journeys shows the 3 tradies templates (or the correct canonical empty copy); comparisons shows
  canonical copy.
- Add to scripts/qa/sprint7-invariants.sh: assert conversation_journeys has ≥3 per vertical seeded (the §5.5 acceptance
  criterion) — `psql ... "SELECT count(*) FROM conversation_journeys WHERE vertical='tradies'"` ≥3; and assert the
  empty-state copy strings match canon (grep the journeys page for "clone a pre-built", NOT "via the API").

## Constraints
- Bug 3 is the real one: the §5.5 seed is a MANDATORY acceptance criterion (3 per vertical, clonable) — it must be in the
  DB (BOTH databases — verify with psql, the recurring dev/prod gap) AND surfaced to the journeys screen for the brand's
  vertical.
- Empty-state copy must match canon exactly: Journeys "No journeys yet — clone a pre-built one to start" (§6U.3);
  Comparisons "Add competitors to your brand to see head-to-head results" (§6U.4). Don't invent copy.
- Verify in the DB (psql count) AND on screen. Local prod + dev, never real prod.
- LLD v8.70 / §5.5 / §6U.3 / §6U.4 win.

## NOTE
Two empty-state/seed bugs on the Discovery sub-screens. Bug 3 (real): the MANDATORY §5.5 seed — 3 pre-built clonable
conversation_journeys per vertical (an acceptance criterion, LLD 9046) — isn't showing on the journeys screen for
Metropolitan (tradies); diagnose whether the seed isn't on prod (the recurring dev/prod gap — verify with psql on BOTH
DBs) or the page query excludes global templates (organization_id NULL), fix accordingly so the 3 tradies templates show
as clonable. Bug 4: both screens invented non-canonical empty-state copy — Journeys says "Create a journey via the API"
(canon: "No journeys yet — clone a pre-built one to start", §6U.3), Comparisons says "runs automatically after each audit"
(canon: "Add competitors to your brand to see head-to-head results", §6U.4). Fix the copy to canon; add a grep + a DB-count
guard asserting the §5.5 seed exists (≥3 per vertical). This is the 4th "build claimed it, screen shows otherwise" in S7
(after nav-orphan, wrong color, now missing seed + wrong copy).
