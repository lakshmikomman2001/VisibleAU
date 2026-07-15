# FIX Gate 3 F-6 [MED] — Mount the orphaned `PromptTrendSparkline` (IF the data exists)

## The situation
`components/domain/autopilot/prompt-trend-sparkline.tsx` is **built, tested, grep-green — and imported
by zero pages.** It has been orphaned since S9. **Decision: mount it now, IF the data it needs actually
exists.**

⚠️ **The catch that made this a carry:** the sparkline shows **prompt-level trend history** — how a
single prompt's result has moved over time. The Gate 3 note flagged that its **host table may never
have been built.** A component with no data source can't be meaningfully mounted. **So this is
data-first: prove the data exists, THEN mount.**

## STEP 1 — Does the data exist? (decides everything)
```bash
cd c:/startup/VisibleAU/src
# What does the sparkline consume? Read its props/query:
cat components/domain/autopilot/prompt-trend-sparkline.tsx
# Is there a table / query / route that provides PER-PROMPT trend history?
grep -rn "prompt.*trend\|trend.*prompt\|promptTrend\|prompt_trend" lib/ app/ db/ --include=*.ts | head
# Does an API route feed it?
find app/api -iname "*trend*" -o -iname "*prompt*" | head
```
**Then check the DB for real per-prompt history** (Metropolitan = `418f321f-…`, 19 audits now):
```bash
# Whatever table holds per-prompt-over-time results — does it have rows for a real brand?
psql "$PROD" -c "\dt" | grep -i "prompt\|trend"
# and count rows for a brand that has 19 audits
```
⚠️ **Report what you find. Two outcomes:**
- **Data EXISTS** (a table with per-prompt history + a way to query it) → **proceed to Step 2, mount
  it.**
- **Data does NOT exist** (no host table, or empty) → ⚠️ **STOP. Do not mount an empty component.**
  Report the gap: what table would need to exist, and confirm this is genuinely an **S10** build item,
  not an S9 miss. **A sparkline rendering a flat/empty line is worse than no sparkline** — it's the F11
  class (shows "no movement" when the truth is "no data").

## STEP 2 — Mount it (only if Step 1 found real data)
1. Find the right home — per the S9 canon, the sparkline belongs on the **Autopilot prompt list / prompt
   detail**, next to each prompt's current result.
2. Wire it to the real query (the one Step 1 confirmed).
3. ⚠️ **Handle the empty/insufficient case explicitly:** a prompt with <2 data points must render
   "not enough history yet" — **NOT a flat line at zero.** (This is the honesty rule from S9 §4.0,
   applied to the sparkline.)
4. **Update the component-mount guard** (the S9 guard that catches orphaned components) so the sparkline
   is now expected-mounted, and the guard would go RED if it's un-mounted again.

## Break-proof
```
If mounted:
  - a prompt WITH ≥2 history points → renders a real trend line
  - a prompt with <2 points → renders "not enough history", NOT a zero line
  - component-mount guard: sparkline is imported by a page (RED if removed)
If NOT mounted (data absent):
  - the finding is documented, ownership confirmed as S10, and the component-mount
    guard is updated to EXEMPT it with a comment (so it's not falsely flagged, but the
    exemption is visible and reviewable)
```

## Constraints
- ⚠️ **Do NOT mount it against a non-existent or empty data source.** Data-first. An empty sparkline is
  an F11-class lie.
- If mounting, the <2-points case must say "no history yet", never a flat zero line.
- Don't fabricate a host table to make this work — if the table doesn't exist, that's S10's build.

## Report back
1. ⚠️ **Does per-prompt trend data EXIST?** (table + query + real rows?) — the deciding fact.
2. **If mounted:** where, wired to what, and the empty-case handling.
3. **If not mounted:** the documented gap + confirmed S10 ownership + the visible guard exemption.
4. The break-proof result.
