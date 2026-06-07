# Claude Code — diagnose why the Audit Results page is STILL simplified, then fix it correctly

## Situation (read carefully)

A previous prompt asked you to rebuild the Audit Results page (`app/(auth)/audits/[auditId]/page.tsx`)
into the rich design — multidimensional breakdown, per-engine performance, sentiment, composite score
+ 95% CI, and a Sprint-6 top-3 "Recommended actions" section. **That prompt was run, but the live
screen is UNCHANGED**: it still shows only three cards (Score / Mentions / Cost) and a flat
"Citations (N)" list; the breadcrumb still reads "Detail"; engines still render lowercase ("chatgpt").

**Do NOT assume the rebuild applied, and do NOT just rewrite the file again.** First diagnose why it
didn't take, REPORT what you find, and only then fix — using the schema that actually exists in this
repo, not assumed column names.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 1 — INVESTIGATE AND REPORT (change NO code in this phase)
═══════════════════════════════════════════════════════════════════════════════

Print your findings for each numbered item. This phase is read-only.

### 1. Which file actually renders this screen?
The screen is the `/audits/[auditId]` route — header "Audit #105", breadcrumb "Workspace > Audits > Detail".
- Run: `grep -rn "Citations (" app/ components/` and `grep -rn "Audit #" app/ components/`
- Run: `find app -path '*audits*' -name 'page.tsx'` and `find app -path '*audit*' -name '*.tsx'`
- The prototype's rich audit screen is **brand-scoped** ("Workspace > Brands > {brand} > Audit #N"),
  but THIS screen sits under "Audits" — so there may be **two** audit-detail routes/components.
  List every file that could render an audit detail page, and identify which one this screen uses
  (match it by the "Citations (N)" heading and the three-card header).

### 2. Did the previous rebuild actually land in that file?
- Run: `git log --oneline -8`
- Run: `git diff HEAD~3 -- <the real file from step 1>` (show what changed recently)
- Does the current file contain the literal strings "Multidimensional breakdown",
  "Per-engine performance", and "Recommended actions"? Report yes/no for each.
  (If NO, the edit never landed here — likely wrong file, per step 1, or the edit was reverted.)

### 3. What columns does the schema ACTUALLY have?
Open the Drizzle schema (search: `find . -name 'schema.ts' -not -path '*/node_modules/*'` and
`grep -rn "pgTable(" --include=*.ts | grep -iE "audits|citations|action"`).
- For the **audits** table, list ALL columns. Then report, for EACH of these, whether it exists and
  its exact name (or "MISSING"):
  `scoreComposite, scoreFrequency, scorePosition, scoreSentimentNumeric, scoreContextNumeric,
   scoreAccuracy, scoreConfidenceLow, scoreConfidenceHigh, confidenceIntervals, engines,
   promptsCount, runsPerPrompt, totalCostUsd, auditNumber, completedAt`
- For the **citations** table, report existence of:
  `engine, brandMentioned, scoreSentiment, runNumber, responseSnippet, position, citedSources`
- Does an action-items table exist (`actionItems` / `action_items`)? If yes, list its columns
  (esp. `title, expectedImpactScore, confidenceLabel, dimension, status, auditId, organizationId`).

### 4. Is the data even populated for this audit?
Run this against the DB (adjust column names to the REAL ones from step 3):
```sql
SELECT id, audit_number, status, score_composite, score_frequency, score_position,
       score_sentiment_numeric, score_context_numeric, score_accuracy,
       score_confidence_low, score_confidence_high, confidence_intervals,
       engines, prompts_count, runs_per_prompt, total_cost_usd
FROM audits ORDER BY created_at DESC LIMIT 1;
```
Report which fields are NULL vs populated. (If the dimension/CI columns exist but are NULL, the rich
sections would render empty/hidden even after a correct rebuild — that points to the Sprint-3 scoring
step not writing them, which is a separate fix.)

### 5. Does it compile, and is the dev server serving the current code?
- Run: `pnpm typecheck` (or `npx tsc --noEmit`). Report ANY error that mentions the audit page or a
  schema column — a type error here means `next dev` may be serving the last good build.
- Run `pnpm lint` on the audit page file.

### → REPORT a concise summary of steps 1–5 before doing anything in Phase 2.
State the single root cause you believe explains the unchanged screen (wrong file / missing columns /
null data / build error / edit-never-landed).

═══════════════════════════════════════════════════════════════════════════════
## PHASE 2 — FIX, using ONLY what Phase 1 found
═══════════════════════════════════════════════════════════════════════════════

Rewrite the **correct** file identified in step 1 (if there are two audit-detail routes, fix the one
this screen uses — and tell me if the other should be removed/redirected to avoid this confusion).

Rules:
- Use the EXACT column names from Phase 1 step 3. Do not invent columns.
- **Every section must always render its shell.** For any dimension/metric whose column is MISSING or
  whose value is NULL, render an em dash "—" with a muted "not yet available" hint. NEVER omit a
  section or let a null throw — that is exactly how the page silently stayed simplified.
- If the per-dimension score columns genuinely do **not** exist (only a composite score does), then:
  keep the composite-score + 95% CI header; in the multidimensional card, show the dimensions you CAN
  derive from `citations` (e.g. Frequency = mentions / total calls); mark the remaining dimensions as
  "available once Sprint-3 scoring is wired" — and flag this clearly in your summary as a schema gap.
- Per-engine performance and sentiment: compute by grouping the `citations` table by engine and by
  sentiment, using the real column names.
- Engine display names via a map (so "chatgpt" → "ChatGPT", etc.).
- Breadcrumb last crumb = `Audit #${<realAuditNumberColumn>}` (not "Detail").
- Keep all existing auth / `setRlsContext` / UUID-guard / fetch wiring intact.

Visual structure to build (sections, top to bottom):
1. Header — two columns: left = success badge ("Complete · N engines · M prompts") + brand name (h1)
   + meta line (Audit #, date, cost to 2 decimals, total LLM calls); right = big composite score
   (5xl, mono) with "95% CI: low — high" beneath it.
2. Multidimensional breakdown — ONE card, `grid-cols-5`: Frequency / Position / Sentiment / Context /
   Accuracy, each with score, a thin track with a dot marker + CI band, and a weight label.
3. Three-column grid: Per-engine performance | Sentiment | Competitor context.
4. Sprint-6 "Recommended actions" — top-3 open action items, each linking to `/action-center/[id]`,
   with a "View all" link to `/action-center` (only if the action-items table exists; otherwise omit
   this one section and say so).
5. The existing Citations list can remain below.

Use exact design tokens (`var(--…)`) and Tailwind scale values throughout; no bare hex. This page is a
server component — no JS event handlers (CSS hover only). No N+1: the per-engine/sentiment counts must
be grouped queries, not per-row loops.

(If the detailed rich JSX from the earlier `fix-audit-results-rich-page.md` prompt is available in this
session, reuse its markup as the visual spec — but adapt every column reference to the real names from
Phase 1.)

═══════════════════════════════════════════════════════════════════════════════
## PHASE 3 — PROVE THE CHANGE IS LIVE (don't skip)
═══════════════════════════════════════════════════════════════════════════════

- Stop `next dev`, run `rm -rf .next`, restart the dev server (clears stale server-component builds).
- Hard-refresh the browser.
- Open the audit page and confirm the new sections render. If they STILL don't appear, the cause is
  one of the Phase 1 findings (wrong file / build error) — fix THAT specific thing and report.

## Final report back to me
Summarise: (a) the file that renders this screen and whether a second audit route exists; (b) which
schema columns were missing vs present; (c) which audit fields were NULL; (d) any typecheck error;
(e) the single root cause; (f) what you changed; (g) confirmation the rich sections now render after
the cache clear. Paste the Phase 1 SQL result and the typecheck output.
