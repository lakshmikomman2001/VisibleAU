# Claude Code — FIX: fan-out sub-queries are malformed (preamble + numbering + markdown as data) — THIS is bug 10b, still open

## Scope correction
Bug 10b was never "does fan-out crash" — it is **"are the fan-out sub-queries clean under a real LLM"** (the original
nested-question malformation, deferred to prod specifically to check quality). The crash fix is verified and good (240
rows written, no crash). But the verify run's STEP 3 found the sub-queries are MALFORMED on real data:
- **Every engine's rank-1 sub_query is LLM PREAMBLE** — "Certainly! Here are 12 search sub-queries..." — the `\n`-split
  captures the intro line as sub-query #1.
- **Numbering + markdown leak into the text** — `1. Top rated plumbers Melbourne VIC`, `### Reputation & Reviews`,
  `---`, `**bold**` — the split stores the LLM's formatting as data.
So 10b is **NOT closed** — it's confirmed broken on real data. (The crash fix and this parse bug are two different
things; fixing the crash doesn't close a ticket that was always about sub-query quality.)

## Why this is not cosmetic
1. These `sub_query` rows feed the REPORT's fan-out coverage section → it would render "Certainly! Here are 12 search
   sub-queries..." and "### Reputation & Reviews" as real queries on a client "Professional Report".
2. They feed the SIMILARITY SCORING — you embed + cosine-score an intro sentence and markdown headers against brand
   content (LLD 6640-6647). Junk rows produce meaningless scores → pollutes the GAP-1 coverage metric the feature
   depends on. (Part of why all scores sit below the 0.88 threshold — you're scoring garbage.)

Env: local PROD DB, real LLMs (4 engines). Fix in `inngest/functions/simulate-query-fan-out.ts` (the generateSubQueries
callback + the `\n`-split, ~lines 94-101).

## The fix — BOTH sides (prompt reduces the mess; post-processing catches what leaks)

### Part 1 — tighten the generation prompt (stop the preamble/numbering at source)
Current: `Generate ${subQueryCount} search sub-queries for: ${p}` → LLMs add intros + numbered/markdown lists.
Change to an explicit, format-locked instruction, e.g.:
```
Generate exactly ${subQueryCount} short search queries a person might type to find businesses like this, for: "${p}".
Return ONLY the queries, one per line. No preamble, no numbering, no bullet points, no markdown, no commentary.
Each line is a single standalone search query.
```
(Adjust wording to the codebase's voice — the key constraints: ONLY queries, one per line, no preamble/numbering/
markdown.)

### Part 2 — robust parsing (never trust the LLM to obey format)
Replace the naive `result.response.split("\n").filter(Boolean).slice(0, subQueryCount)` with a cleaning pass:
```ts
const lines = result.response
  .split("\n")
  .map(l => l.trim())
  .map(l => l.replace(/^\s*\d+[.)]\s*/, ""))      // strip "1. " / "2) "
  .map(l => l.replace(/^\s*[-*•]\s*/, ""))         // strip bullet markers
  .map(l => l.replace(/\*\*/g, "").replace(/^#+\s*/, "")) // strip **bold** and ### headers
  .map(l => l.replace(/^["'`]|["'`]$/g, "").trim())       // strip wrapping quotes/backticks
  .filter(Boolean)
  .filter(l => !/^-{2,}$/.test(l))                 // drop "---" rules
  .filter(l => !/^(certainly|here are|sure|below are|these are)\b/i.test(l)) // drop preamble lines
  .filter(l => l.length >= 3 && l.length <= 120)   // drop stray fragments / overly long prose
  .filter(l => !l.endsWith(":"));                  // drop section labels like "Reputation & Reviews:"
const subQueries = lines.slice(0, subQueryCount);
```
- Tune the regexes to what STEP 3 actually showed; the goal is: NO preamble line, NO leading numbers/bullets, NO
  markdown headers/rules/bold, NO trailing-colon section labels — only clean standalone queries.
- Keep `.slice(0, subQueryCount)` so you still cap per prompt. Note: aggressive filtering may drop below subQueryCount
  for some prompts — that's acceptable (fewer, clean queries > padded garbage). Don't back-fill with junk to hit 12.
- Leave the try/catch (crash fix) intact — do not regress it.

## STEP 1 — Apply, restart, re-audit Metropolitan
Restart the Inngest dev server (function edit needs rebuild). Re-audit Metropolitan. Watch fan-out complete.

## STEP 2 — VERIFY the rows are now clean
```bash
psql "$DATABASE_URL" -c "
  SELECT f.engine, f.sub_query_rank, f.sub_query
  FROM query_fan_out_results f
  JOIN audits a ON f.audit_id=a.id
  WHERE f.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au')
    AND a.created_at > now() - interval '1 hour'
  ORDER BY f.engine, f.sub_query_rank LIMIT 40;"
```
Acceptance — check EVERY row:
- rank-1 is a real query, NOT "Certainly! Here are..." preamble.
- NO leading `1.`/`2)`/bullets, NO `###`/`---`/`**` anywhere in sub_query.
- No trailing-colon section labels ("Reputation & Reviews:").
- Each sub_query is a clean standalone search query, differs from original_prompt, 3–12 per prompt.
Also spot-check similarity: with clean queries, `content_similarity_score` should be meaningful (some may now exceed
0.88 for a genuinely-cited brand like Metropolitan on Perplexity).
```bash
psql "$DATABASE_URL" -c "SELECT engine, COUNT(*) rows, COUNT(*) FILTER (WHERE sub_query ~ '^\s*(\d+[.)]|#|-{2,}|\*\*)' OR sub_query ~* '^(certainly|here are|sure|below are)') AS malformed FROM query_fan_out_results f JOIN audits a ON f.audit_id=a.id WHERE f.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au') AND a.created_at > now() - interval '1 hour' GROUP BY engine;"
```
`malformed` must be 0 for every engine.

## STEP 3 — Confirm the REPORT's fan-out section renders clean
Generate a report for Metropolitan for the current period and OPEN the PDF. The fan-out coverage section (if it renders
for this brand) must show real sub-queries, NOT preamble/markdown. Report what it shows.

## VERDICT
- **10b CLOSED:** STEP 2 malformed=0 across engines, rows are clean standalone queries, report section renders clean.
- **NOT CLOSED:** any preamble/numbering/markdown remains → tighten the strip regexes to the residual cases + report.

## Constraints
- Both the prompt AND the parse must change — prompt alone won't guarantee format (LLMs disobey); strip alone leaves the
  prompt inviting mess. Belt and suspenders.
- Do NOT regress the try/catch crash fix.
- Fewer-but-clean sub-queries is fine; never pad to subQueryCount with junk lines.
- Restart the dev server before re-auditing. Real 4-engine spend — one audit verifies.

## NOTE
This IS bug 10b — sub-query quality under a real LLM — and the verify run confirmed it's broken (preamble as row 1,
numbering + markdown in the text), exactly the naive `split("\n")` failure predicted. The crash fix is a separate, real
win, but it doesn't close 10b. Fix both the prompt and the parse, re-audit, and confirm malformed=0 in STEP 2 — that's
the actual close. Don't let "writes 240 rows" stand in for "writes 240 CLEAN rows"; 239 of them polluted is still a
broken feature on a client report.
