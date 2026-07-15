# Claude Code — DIAGNOSE + FIX: /retrieval now 404s (regression from the depth-card fix)

The retrieval hub was loading fine (4 stat cards) BEFORE the depth-card fix. AFTER the fix (which edited
`retrieval/page.tsx` — "removed llmstxtDepth prop + llmstxt from interface"), the SAME URL `/brands/[id]/retrieval` now
404s ("Couldn't find that page"; console: `retrieval:1 ... 404` — the PAGE ROUTE itself, not a data fetch). The
prop-removal edit broke the route. Find the compile error, fix it, confirm the hub loads again.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand
418f321f-2489-4560-aaa9-895728580465. (The array/local-disabled + /e + /flags 404s are PostHog noise — ignore; the
`retrieval:1 404` is the real one.)

## STEP 1 — Get the compile error (the terminal, not the browser)
The browser shows "404 / Couldn't find that page"; the `next dev` TERMINAL shows WHY (a compile error makes the route
fail to resolve). Reload `/retrieval` and capture the terminal error. Then read the edited file:
```bash
cat "app/(auth)/brands/[brandId]/retrieval/page.tsx"
# Look for what the prop-removal edit broke:
grep -n "llmstxtDepth\|llmstxt\|import\|export default\|RetrievalScoreSummary\|interface\|Props" "app/(auth)/brands/[brandId]/retrieval/page.tsx"
# Also the component the props were removed from:
grep -n "llmstxtDepth\|llmstxt\|Props\|interface" components/domain/retrieval/retrieval-score-summary.tsx
```
Report the terminal compile error + classify:
- **Dangling reference:** `llmstxtDepth` removed from the interface/props but still USED somewhere in page.tsx or the
  component → `llmstxtDepth is not defined` / TS error → the reference was half-removed.
- **Broken import:** the edit removed/renamed an import that's still referenced, or left an unused import that breaks.
- **Export disturbed:** the `export default function ...Page()` got altered/removed → route stops existing → 404.
- **Type mismatch:** the component's Props interface no longer matches what page.tsx passes.
- **Something else:** report the exact error.

## STEP 2 — Fix whatever the edit broke
Based on STEP 1:
- If a dangling `llmstxtDepth` reference remains → remove that usage too (the prop was removed from the interface but a
  consumer still reads it).
- If the import/export was disturbed → restore the correct import and the `export default function` for the page route.
- If the Props interface and the passed props diverged → align them (page.tsx passes exactly what the component's
  interface now declares).
- Ensure the file compiles cleanly (the route must resolve). This is a fix to the depth-card edit, not a rebuild.
```bash
# after fixing, confirm no dangling refs + the default export is intact:
grep -n "export default\|llmstxtDepth" "app/(auth)/brands/[brandId]/retrieval/page.tsx"
```

## STEP 3 — RESTART the dev server + verify the hub loads
A broken edit can leave the dev server serving a stale/failed module even after the file is fixed.
```bash
# stop and restart next dev (full restart, not just Fast Refresh), then:
```
Reload `/brands/418f321f.../retrieval`:
- The hub LOADS (no 404) — shows the **3 stat cards** (Agent Readiness 56/100, Avg Citation Prob, Crawler Visits 0) —
  confirming the depth-card fix is intact AND the route works.
- The 5 sub-screen tiles render.
Report: the hub loads again, 3 stat cards (not 4), no 404.

## STEP 4 — Why did "83 green / 0 TS errors" miss this? (so the test track guards it)
The fix report claimed "83/83 green, 0 TS errors, hub shows 3 stat cards" — but the page 404s. Report which is true:
- Were the tests component-unit tests (retrieval-score-summary) that pass while page.tsx doesn't compile? (unit tests of
  a child component don't catch a broken PAGE route.)
- Did "0 TS errors" run against the fixed file, or before the break?
This is the "green tests ≠ page renders" gap. Note: the S6 test track (§11) should include a check that the retrieval
PAGE route resolves/renders (not just the child components) — a smoke/e2e that GETs /retrieval and asserts 200, which
would have caught this 404.

## STEP 5 — Report
- The compile error + which class (dangling ref / import / export / type).
- The fix (what the depth-card edit broke + how corrected).
- On screen: /retrieval loads, 3 stat cards, no 404 (depth-card fix intact).
- Note for the test track: add a page-route-resolves check (GET /retrieval → 200).

## Constraints
- Get the REAL compile error (terminal) — don't guess; the prop-removal edit left a specific breakage.
- The fix must KEEP the depth-card fix (3 stat cards, depth nested in agent-readiness) — just repair what broke the
  route. Do NOT revert the depth-card fix to "fix" the 404.
- Full dev-server restart after the fix (stale module risk).
- Verify on screen (hub loads, 3 cards). Local prod, never real prod.

## NOTE
Regression from the depth-card fix: editing retrieval/page.tsx ("removed llmstxtDepth prop + llmstxt from interface")
broke the route → /retrieval 404s (the page route itself, per console `retrieval:1 404`). Almost certainly a dangling
`llmstxtDepth` reference left after removing it from the interface, or a disturbed import/export. Get the terminal
compile error, remove the dangling ref / restore the export, restart dev, confirm the hub loads with 3 stat cards (keep
the depth-card fix — don't revert it). The "83 green / 0 TS errors" claim missed this because component unit tests don't
catch a broken PAGE route — the test track needs a GET /retrieval → 200 check.
