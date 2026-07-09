# Claude Code — FIX Bug 1 (invisible Refresh — REPO-WIDE sweep of the -foreground/-fg typo) + VERIFY Finding 2 (missing AR components)

The Agent Readiness screen's Refresh button is INVISIBLE (white text on white bg) — the EXACT CSS-var typo from S5 bug 8
(`--accent-primary-foreground` (undefined) vs the real `--accent-primary-fg`), recurring on a NEW page. S5 point-fixed 4
files but never swept the repo, so S6's new pages reintroduced it. This time: SWEEP THE WHOLE REPO for the typo so it
stops recurring. Then VERIFY Finding 2 (spider gauge / MCP card / local-AI-trust card missing per §6U.5 — report, don't
build blindly).

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand
418f321f-2489-4560-aaa9-895728580465 (Metropolitan — a PLUMBER, vertical is NOT 'saas').

## BUG 1 — REPO-WIDE fix of the `-foreground` vs `-fg` CSS-var typo
The canonical var is **`--accent-primary-fg`** (prototype uses it 6× consistently). `--accent-primary-foreground` is
UNDEFINED → text inherits the page color → white-on-white / dark-on-dark (WCAG fail).

### STEP 1 — Find EVERY occurrence of the typo (the whole class, not just this page)
```bash
# The typo'd var (undefined) anywhere in the app:
grep -rn "accent-primary-foreground" app/ components/ 2>/dev/null
# ANY other *-foreground var that should be *-fg? (check the pattern isn't wider):
grep -rnE "\-\-[a-z-]+-foreground" app/ components/ 2>/dev/null | head -30
# Confirm the CORRECT var is defined (and -foreground is NOT):
grep -rn "accent-primary-fg\|accent-primary-foreground" app/globals.css styles/ app/**/*.css 2>/dev/null | head
```
Report: EVERY file+line using `--accent-primary-foreground` (or any `*-foreground` that should be `*-fg`), and confirm
the CSS defines `-fg` (not `-foreground`).

### STEP 2 — Replace ALL `--accent-primary-foreground` → `--accent-primary-fg` (repo-wide)
- Fix every occurrence found in STEP 1 — not just the agent-readiness page. This is the sweep S5 skipped.
- If there are OTHER `*-foreground` typos for vars that are actually defined as `*-fg` (STEP 1 may surface them), fix
  those too — same class.
- Do NOT rename the CSS variable definition; fix the REFERENCES to match the defined `-fg` name.
```bash
# after the sweep, this must return ZERO:
grep -rc "accent-primary-foreground" app/ components/ 2>/dev/null | grep -v ":0" || echo "OK: 0 occurrences of the typo"
```

### STEP 3 — Verify the Refresh button is readable (on screen, both themes)
Reload `/brands/418f321f.../retrieval/agent-readiness`:
- The **Refresh button is VISIBLE** (readable text on its background) — not the white rectangle.
- Check BOTH themes (light + dark) — the typo broke both (white-on-white one way, dark-on-dark the other).
- Click Refresh → it re-runs the agent-readiness scoring (fires technical-audit/complete → the fns).
Also spot-check any OTHER pages STEP 1 flagged (e.g. other retrieval sub-screens with a Refresh) — their buttons are now
readable too.
Report: Refresh visible on agent-readiness + any other flagged pages, both themes.

## FINDING 2 — VERIFY (don't build blindly): the 3 §6U.5 components + local-AI-trust for a non-SaaS brand
§6U.5 specifies the AR screen should have: **agent-readiness-gauge.tsx (5-dim SPIDER chart)** + **mcp-status-card.tsx
(present/valid/tools count)** + per-dimension breakdowns + **local-AI-trust card (Growth+, NULL for SaaS)** +
llmstxt-viewer. The screen currently shows a horizontal bar + text dimensions + text MCP sub-signal + gaps — missing the
spider gauge and the MCP status card; local-AI-trust card not visible.

### STEP 4 — Report what's built vs missing (verify, no fix this pass)
```bash
# Do these components EXIST as built files?
ls components/domain/retrieval/ | grep -iE "gauge|spider|mcp|local.ai|trust|llmstxt"
find . -path ./node_modules -prune -o -iname "*agent-readiness-gauge*" -print -o -iname "*mcp-status*" -print -o -iname "*local-ai-trust*" -print 2>/dev/null
# Does the AR page render them / the local_ai_trust card?
grep -n "gauge\|spider\|Radar\|mcp.*card\|McpStatus\|localAiTrust\|local_ai_trust\|LocalAiTrust\|llmstxt-viewer" "app/(auth)/brands/[brandId]/retrieval/agent-readiness/page.tsx" components/domain/retrieval/agent-readiness-card.tsx
```
Report which of the 4 §6U.5 components exist-and-render vs are missing (like the hub's Finding 2 — the build may have
simplified the UI). This is a design/completeness finding for your decision — do NOT build them this pass.

### STEP 5 — local-AI-trust for a NON-SaaS brand (this one might be a real bug, not just missing UI)
Canon: `local_ai_trust_score` is **NULL only for SaaS** (scorer checks brand.vertical and skips 'saas'). Metropolitan is
a PLUMBER (vertical ≠ 'saas') → it should be **COMPUTED and SHOWN**, not absent.
```bash
# Is local_ai_trust_score computed for Metropolitan? (should be non-NULL for a plumber)
psql "$PROD_URL" -c "SELECT vertical FROM brands WHERE id='418f321f-2489-4560-aaa9-895728580465';"
psql "$PROD_URL" -c "SELECT local_ai_trust_score, total_score FROM agent_readiness_scores WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' ORDER BY scored_at DESC LIMIT 1;"
```
Report: (a) Metropolitan's vertical (should be 'tradie'/plumbing, NOT 'saas'); (b) is local_ai_trust_score computed
(non-NULL) in the latest row? If it's NULL for a non-SaaS brand → that's a BUG (the scorer wrongly skipped it, or the
vertical check is wrong). If it's computed but just not SHOWN on screen → that's the missing local-AI-trust card (Finding
2 UI gap). Distinguish which: NULL-in-DB = scorer bug; computed-but-not-rendered = missing card.

## STEP — Report
- BUG 1: every `-foreground` typo found + fixed repo-wide (0 remaining); Refresh visible on AR + any other flagged pages,
  both themes. The sweep (not point-fix) so it can't recur on the next new page.
- FINDING 2: which §6U.5 components (spider gauge / MCP card / local-AI-trust card / llmstxt-viewer) are built vs missing
  — reported for your decision, not built.
- STEP 5: is local_ai_trust_score computed for this non-SaaS brand (non-NULL)? NULL = scorer bug (real); computed-but-
  not-shown = missing card (UI gap). Report which.
- Add a §12-style grep guard: `grep -rc "accent-primary-foreground" app/ components/` → 0 (the bug-8 regression guard,
  now repo-wide).

## Constraints
- BUG 1 is a REPO-WIDE sweep — fix EVERY `--accent-primary-foreground` (and any sibling `*-foreground` typo), not just
  the agent-readiness page. That's the fix S5 should have done; point-fixing again just defers the next recurrence.
- FINDING 2 is VERIFY-ONLY — report built-vs-missing components; don't build the spider gauge / MCP card this pass.
- STEP 5 distinguishes a real bug (local_ai_trust NULL for a non-SaaS brand) from a UI gap (computed but not rendered) —
  report which; the DB query is decisive.
- Verify on screen, both themes. Local prod, never real prod. LLD v8.70 / §6U.5 win.

## NOTE
Bug 1 is the S5 bug-8 CSS-var typo (`--accent-primary-foreground` undefined vs `--accent-primary-fg`) recurring on the
new agent-readiness page — because S5 point-fixed 4 files and never swept the repo. This time SWEEP repo-wide (fix every
occurrence, add the grep guard → 0) so it stops recurring on each new page. Finding 2 (spider gauge + MCP status card +
local-AI-trust card missing per §6U.5) is verify-only — same design-simplification as the hub; report, don't build. But
STEP 5 is important: local_ai_trust_score is NULL only for SaaS, and Metropolitan is a plumber — if it's NULL in the DB
that's a real scorer bug (wrong vertical skip); if it's computed but not shown, that's the missing card. The DB query
tells you which.
