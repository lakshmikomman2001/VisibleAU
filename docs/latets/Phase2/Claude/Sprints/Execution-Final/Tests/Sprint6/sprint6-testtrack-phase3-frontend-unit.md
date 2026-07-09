# Claude Code — S6 test track — PHASE 3 of 5: FRONTEND UNIT (retrieval component tests)

Correcting the track to the S4 FIVE-PHASE standard: Backend Unit (done) → Backend E2E (done) → **FRONTEND UNIT (this)** →
Frontend E2E/Playwright (next) → QA greps (last). This is FRONTEND UNIT: systematic component tests for the retrieval
components — each renders its STATES correctly (loading/empty/data/error) and its data correctly. The Section-3 walk
guards fold in here as the bug-specific SUBSET. Do NOT jump to Frontend E2E or QA.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau`. LLM_MODE=mock. Never prod. tests/phase2/sprint6/.
Component test setup: use the repo's existing component-test pattern (the S5 trust-card tests / testing-library) — match it.

## The BUILT retrieval components to test (NOT the spec'd-but-not-built ones)
BUILT (verified on screen this session — test these): retrieval-score-summary, agent-readiness-card,
entity-home-card, content-structure-card (+ the citation headline), crawler-log-table, cdn-block-alert,
content-format-card, freshness-badge, passage-counter, llmstxt-viewer.
NOT BUILT (walk Finding 2 — do NOT write tests for absent components): agent-readiness-gauge (spider),
mcp-status-card, local-ai-trust standalone card. (If you want, add a SINGLE skipped/todo test noting they're deferred —
optional.)

## STEP 1 — Inventory existing component tests + confirm the test-render setup
```bash
ls tests/phase2/sprint6/ | grep -iE "card|summary|table|badge|counter|viewer|alert|component|render"
grep -rln "render(\|screen\.\|@testing-library" tests/phase2/sprint6/ 2>/dev/null | head
head -20 tests/phase2/sprint5/*card*.test.* 2>/dev/null   # match the S5 component-test pattern
```
Report: which retrieval components already have render tests (the fixes + Section 3 added some — entity-home-card,
score-summary, content-structure headline), and the component-test setup to match.

## STEP 2 — Frontend Unit tests per BUILT component (STATES + data). One at a time:

### retrieval-score-summary
- Renders the **3 hub stats** (Agent Readiness /100, Avg Citation Prob %, Crawler Visits) — and **NO standalone
  llms.txt-depth /18 card** (the depth-card guard — Section 3 #1 folds in here).
- Data: given a score object, the 3 stats show the right values.

### agent-readiness-card
- Renders the **5 dimension bars** with correct labels (Technical/Entity Clarity/Verifiability/Authority/Task-Fit) + /20.
- **Badge (if any) matches the score direction** (the S5 contamination class — assert a low score → Low/appropriate, not
  "High"). If this card has no High/Med/Low badge, assert that (no false badge).
- Renders the **"Technical sub-signals"** nesting (llms.txt depth + MCP) — the Finding-1 fix.
- States: loading skeleton; empty "Run an agent-readiness check".

### entity-home-card (Bug B — the display guard, folds in)
- Given an entityHomeStatus: renders **@id present + sameAs count (X/3) + org-schema present + Complete/Incomplete badge**
  — NOT content-structure fields (Citation/Capsule/Format). (Section 3 #2.)
- States: empty "We haven't identified your Entity Home yet — run an audit".

### content-structure-card + the citation headline (Section 3 #5 folds in)
- The **citation headline** renders prominently ("How likely is this page to be cited by AI? X%") — not only in cards.
- **Band thresholds EXACT:** 0.72→green, 0.45→amber, 0.22→red (≥0.70/0.40–0.69/<0.40).
- Per-page card: format + word count + freshness badge + capsule + passages render.
- States: loading skeleton; empty EmptyState.

### crawler-log-table
- Given visits: renders rows with visit_purpose + error highlighting (blocked_cdn highlight).
- **Empty state**: "No crawler visits recorded yet. Install the tracking snippet" (the verified empty state).
- States: loading row skeletons; error boundary.

### cdn-block-alert
- Given a blocked diagnostic (isBlockedByCDN=true, vendor=Cloudflare, snippet): renders the "AI Crawler Access Blocked"
  card + remediation snippet + copy-to-clipboard.
- Given isBlockedByCDN=false: renders NOTHING (no alert) — the honest-block behavior at the component level.

### content-format-card / freshness-badge / passage-counter (the small ones)
- content-format-card: shows the detected format + the advisor recommendation.
- freshness-badge: fresh→green, aging→amber, at_risk→amber/orange, stale→red (all 4 enum values render the right color).
- passage-counter: shows the count.

### llmstxt-viewer
- Renders the file + depth_score /18 + download; empty when no llms.txt.

### The hardcoded-white guard (Section 3 #4) — keep it in Frontend Unit
- The repo-wide `grep -rEc "color:\s*[\"']white[\"']" app/ components/` → 0 assertion lives here (or stays in the
  walk-regression file — confirm it's present either way).

## STEP 3 — Verify real + re-break (component level), fill gaps
For each: the test RENDERS the component (testing-library) and asserts the DOM, then re-break (break the render → test
fails). Priority re-breaks: badge-matches-score (agent-readiness), citation bands (0.45→amber), entity-home fields
(@id/sameAs not content-structure), cdn-block-alert hidden when not blocked, freshness-badge 4 colors. Build any missing
component's test; fold the Section-3 component guards in (don't duplicate — reference/merge).

## STEP 4 — Run + report, then STOP
```bash
<repo test cmd> run tests/phase2/sprint6/
```
- Which components had render tests (from fixes/Section 3) vs built new. STATES covered (loading/empty/data/error) per
  component. Re-break fired for the priority ones.
- NOT-built components (spider/mcp-card/local-trust-standalone) correctly NOT tested (optionally a todo note).
- Frontend Unit green; total count.
STOP — do NOT start Frontend E2E. Report, and Frontend E2E (Playwright) is next.

## Constraints
- FRONTEND UNIT ONLY. Not Frontend E2E, not QA.
- Test only BUILT components — do NOT write tests for agent-readiness-gauge/mcp-status-card/local-trust-standalone (not
  built; walk Finding 2). Optionally one todo note.
- Each test RENDERS the component (testing-library) + asserts the DOM + fires on re-break. NO source-greps at the
  component level (the grep guards are the exception, kept as-is).
- Fold Section 3's component guards in (depth-card, entity-home fields, citation headline+bands, hardcoded-white) — merge,
  don't duplicate.
- Match the S5 component-test pattern. LLM_MODE=mock. Dev DB `visibleau`, never prod. LLD v8.70 / §6U win.

## NOTE
Phase 3 of 5 (correcting to the S4 five-phase standard: BE Unit → BE E2E → FE Unit → FE E2E → QA). FRONTEND UNIT:
render tests for the BUILT retrieval components (retrieval-score-summary, agent-readiness-card, entity-home-card,
content-structure-card + citation headline, crawler-log-table, cdn-block-alert, content-format-card, freshness-badge,
passage-counter, llmstxt-viewer) — each with its STATES (loading/empty/data/error) and correct data. Do NOT test the
spec'd-but-not-built components (spider gauge/mcp-card/local-trust-standalone — walk Finding 2). Fold the Section-3 walk
guards in as the bug-specific subset (depth-card absent, entity-home @id/sameAs, citation headline+bands, hardcoded-white,
cdn-alert-hidden-when-not-blocked). Render + re-break at the component level. STOP after Frontend Unit; Frontend E2E
(Playwright) is next, then QA.
