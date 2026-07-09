# Claude Code — S6 §11 test track — SECTION 3 of 4: the WALK regression guards (the bugs the manual pass found that no test caught)

Section-by-section: SECTIONS 1 (Backend Unit, 48) + 2 (Backend Integration, +19) DONE. This is SECTION 3 — the
regression guards for every bug the MANUAL SCREEN PASS found this session that the "89 green" build tests MISSED. These
are NOT in §11 (they postdate the build) — each is "write the test that would have caught the bug we found on screen."
Do NOT jump to Section 4. Some may partly exist (the fixes added regression tests) — INVENTORY, verify each is real +
re-break, fill gaps.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint6/.

## SECTION 3 — the 8 walk-found guards (each maps to a real bug we fixed on screen):

### 1. Depth-card guard (hub — the §13 conflation)
Bug: the Retrieval hub showed a standalone "—/18 llms.txt Depth" stat card as a peer to Agent Readiness (LLD 5457/2911:
depth_score shown INSIDE agent_readiness /100, NOT standalone; §13 / prototype FIX-2).
Guard: assert the hub's stat cards do NOT include a standalone llms.txt-depth /18 card (only the 3 legit stats: Agent
Readiness /100, Avg Citation Prob %, Crawler Visits). If the hub is component-tested, assert the depth card is absent;
depth appears nested under the Technical Accessibility dimension instead.
Re-break: re-add the standalone depth card → the "no standalone depth card" assertion FAILS.

### 2. Entity-home DISPLAY guard (the card renders entity-home fields, not content-structure — Bug B display half)
Bug: entity-home-card showed content-structure fields (Citation/Capsule/Format) instead of §6U.6's @id/sameAs/org-schema.
Guard: the entity-home card, given an entityHomeStatus, renders **@id present + sameAs count (X/3) + org-schema present +
Complete/Incomplete badge** — NOT Citation%/Capsule/Format. (NOTE: the Bug B fix likely added a version of this — confirm
it asserts the @id/sameAs/org-schema fields render.)
Re-break: point the card at content-structure fields → the @id/sameAs assertion FAILS.

### 3. Entity-home GRID-removed guard (no content-structure bleed on Entity Home)
Bug: the Entity Home screen had an "Audited Pages" per-page content-structure grid (§6U.6 = status + gap list ONLY).
Guard: the Entity Home page renders the status card but NOT the per-page content-structure grid (that grid lives on
/content-structure, §6U.4). (The grid-removal fix added a test — confirm it.)
Re-break: re-add the content-structure grid to Entity Home → the "no grid" assertion FAILS.

### 4. Hardcoded-white Refresh guard (the invisible-button class — repo-wide)
Bug: buttons used `color: "white"` on `background: var(--accent-primary)` → white-on-white in dark mode (invisible).
Guard: a repo-wide grep-style assertion (or a §12-style check, but put a test-level guard here too):
`grep -rc 'color:\s*["'\'']white["'\'']' app/ components/` → **0** (all use var(--accent-primary-fg)). If any UI test
renders the Refresh buttons, assert the button text color is not literally "white".
Re-break: reintroduce a hardcoded `color:"white"` on a button → the grep guard returns >0 → FAILS.

### 5. Citation-headline + bands guard (Content Structure — the §13 "don't bury it" + the corrected thresholds)
Bug: citation_probability was buried in per-page card corners (§13 anti-pattern); AND the color bands were wrong
(green ≥0.50 instead of ≥0.70).
Guard: (a) the Content Structure page renders a **prominent/full-width citation headline** ("How likely is this page to
be cited by AI? X%") ABOVE the per-page cards — not only in the cards; (b) the band thresholds are EXACT: **≥0.70 green /
0.40–0.69 amber / <0.40 red** — assert 0.72→green, 0.45→amber, 0.22→red (the corrected bands). (The citation-headline fix
added +2 tests — confirm they assert the headline present + the band thresholds.)
Re-break: (a) remove the headline (citation only in cards) → the "headline present" assertion FAILS; (b) change a band
threshold (green back to ≥0.50) → the 0.45→amber / band test FAILS.

### 6. Page-route-resolves smoke (the 404-catcher)
Bug: an edit to retrieval/page.tsx made /retrieval 404 (the route stopped resolving) — no test caught it (component unit
tests don't exercise the page route).
Guard: a smoke test that the retrieval page route RESOLVES — e.g. GET /retrieval returns 200/307 (not 404), OR (simpler,
no server) the page module imports + exports a default function (STEP 7 below). Do the module-export version as the
reliable one.
Re-break: break the page's default export → the module-export smoke FAILS.

### 7. Page-module-export smoke (the compile-break catcher — the one you agreed to add)
Guard: for each retrieval page (retrieval/page.tsx, entity-home, agent-readiness, crawler-logs, content-structure),
import the module and assert it **exports a default function**. This catches a broken export / compile error from an edit
(the class the /retrieval 404 turned out to be adjacent to) WITHOUT needing a running server.
Re-break: remove/rename a page's default export → the import-and-assert-default-function test FAILS.

### 8. CDN honest-block guard (VERIFY — already exists; the anti-Gemini-bug)
This ALREADY EXISTS: `tests/phase2/sprint6/cdn-shield-detector.test.ts` with the mandated assertion **Cloudflare header +
status 200 → isBlockedByCDN===false** (the enhancement §11). Do NOT duplicate — VERIFY it's present, real, and fires on
re-break: add 200 to BLOCK_CODES (make 200 return blocked) → the "200 → not blocked" test FAILS. Report it's covered.

## STEP 1 — Inventory: which guards already exist (the fixes added some)?
```bash
grep -rln "standalone.*depth\|depth.*card\|no.*llms.*depth" tests/phase2/sprint6/ 2>/dev/null   # depth-card
grep -rln "orgSchemaPresent\|sameAsCount\|idFieldPresent\|entity.home.*card" tests/phase2/sprint6/ 2>/dev/null  # entity-home display
grep -rln "Audited Pages\|content.structure.grid\|no.*grid" tests/phase2/sprint6/ 2>/dev/null   # grid-removed
grep -rln "color.*white\|accent-primary-fg" tests/phase2/sprint6/ scripts/qa/ 2>/dev/null       # hardcoded-white
grep -rln "citation.*headline\|band\|0.70\|0.40" tests/phase2/sprint6/ 2>/dev/null              # citation headline+bands
grep -rln "default.*function\|export default\|route.*200\|resolves" tests/phase2/sprint6/ 2>/dev/null  # route/module smoke
grep -rln "isBlockedByCDN\|Cloudflare.*200\|cdn-shield-detector" tests/phase2/sprint6/ 2>/dev/null    # CDN honest-block
```
Report which of the 8 already have a guard (from the fixes) vs need building.

## STEP 2 — For each existing guard, verify real + re-break; build the missing ones
Go through the 8 ONE AT A TIME. Confirm the assertion, prove re-break (reintroduce the bug → test FAILS → restore).
Build any missing. Priority (the ones most likely to recur): hardcoded-white grep (→0), page-module-export smoke (the
404-class catcher), citation bands (0.45→amber), depth-card absent, entity-home fields render.

## STEP 3 — Run Section 3 + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint6/
```
- The 8 guards: which existed (from fixes) / built new. Re-break fired for each (reintroduce the bug → FAIL).
- CDN honest-block (#8) confirmed present + re-break (200→BLOCK_CODES → fail).
- Section 3 green; total count.
STOP — do NOT start Section 4. Report, and we do Section 4 (the §12 grep script) last.

## Constraints
- SECTION 3 ONLY (the 8 walk-found guards). Not Section 4.
- Each guard = "the test that would have caught the bug we found on screen" — it MUST fail when the bug is reintroduced
  (re-break is the whole point here). NO source-greps that pass regardless.
- #8 (CDN 200-not-blocked) ALREADY EXISTS — verify + re-break, do NOT duplicate.
- The hardcoded-white guard (#4) is repo-wide (grep → 0) — this is the class that recurred (S5 + S6); the guard stops the
  next recurrence.
- The page-module-export smoke (#7) catches the compile-break/404 class without a running server.
- LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §6U.4 / §6U.6 / §13 / CDN §11 win.

## NOTE
Section 3 of 4 — the regression guards the MANUAL PASS earned (the bugs "89 green" missed, found only by watching the
screen against canon): depth-card absent (§13 conflation), entity-home card renders @id/sameAs/org-schema not
content-structure (Bug B display), no content-structure grid on Entity Home (bleed), hardcoded-white Refresh repo-wide
grep→0 (the class that recurred S5+S6), citation headline present + EXACT bands ≥0.70/0.40/0.40 (§13 + the corrected
thresholds), page-route-resolves + page-module-export smoke (the 404/compile-break catcher), and VERIFY the already-
existing CDN 200-not-blocked test. Each MUST fail when the bug is reintroduced — re-break is the point. Inventory (the
fixes added some), verify + re-break, fill gaps. STOP after Section 3; Section 4 (the §12 grep script) is last.
