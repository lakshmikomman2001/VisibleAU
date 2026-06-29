# Claude Code — FIX sentiment-breakdown display (0-mention) + INVESTIGATE the 200-vs-197 response gap

Two issues from audit #31 (Lighting Up Melbourne Electrical, 0% mentions, score correctly 0.0):
1. **FIX (confirmed bug):** the Sentiment breakdown panel shows **197 Neutral / 0 / 0** — it's counting ALL
   responses, but canon computes sentiment only over MENTION citations. For a 0%-mention brand it should show
   **0 / 0 / 0** (or a "no mentions" state), matching the (correct) 0.0 score.
2. **INVESTIGATE (unknown — do NOT fix blindly):** 200 LLM calls but "Responses (197)" — 3 fewer. Determine
   whether this is graceful failed-call handling (fine) or a silent drop (bug). Report before any change.

---

## CANON (confirms Issue 1 is a bug)
Sprint 3 §7 computes sentiment ONLY over mention citations:
- `.filter(c => c.brandMentioned && c.sentimentLabel)` then `sentimentDimensionScore(sentimentLabels)`.
- `scoreSentiment` = "majority label across all **mention** citations" (mention citations, not all responses).

So the SCORE correctly filters to mentions (→ empty → 0 for this brand). The breakdown PANEL showing 197
Neutral is counting all 197 responses instead of the 0 mention citations — it's not applying the same
`brandMentioned` filter. That's the bug.

---

## PART 1 — FIX the sentiment breakdown display

### 1a. Find where the breakdown counts Positive/Neutral/Negative
```bash
grep -rniE "neutral|positive|negative|sentiment.*count|sentimentBreakdown|breakdown" components/ app/ lib/ --include=*.tsx --include=*.ts | grep -iE "sentiment|neutral|positive|negative|count|breakdown" | head -20
```
Find the component/query that produces the Positive/Neutral/Negative tallies on the audit detail page.

### 1b. The bug + the fix
The breakdown is almost certainly counting **all response/citation rows** (197) and labeling non-mentions
"neutral". Fix it to count sentiment **only over rows where the brand was mentioned** (`brandMentioned === true`
/ `c.found` — match the real field), exactly as the SCORE does (canon `.filter(c => c.brandMentioned ...)`).
- For a 0%-mention brand → 0 mention rows → breakdown shows **0 / 0 / 0**.
- Ideally also show a "not mentioned — no sentiment data" empty state instead of three zero bars, so a user
  understands there was nothing to measure (not "we measured and found it neutral"). If an empty state is more
  than a trivial change, at minimum make the counts 0/0/0.
- Do NOT change how the SCORE is computed (it's already correct). Only the breakdown TALLY's input set changes.

### 1c. Verify
After the fix, reload audit #31 (or re-run): the Sentiment breakdown shows **0 / 0 / 0** (or "no mentions"),
not 197 Neutral. Confirm a MENTIONED brand still shows correct non-zero P/N/N counts (don't break the normal
case) — check against an audit that has mentions, or a unit test over mention rows.

---

## PART 2 — INVESTIGATE the 200 calls / 197 responses gap (NO fix yet)

The question: are 3 responses **gracefully dropped** (a call errored/timed-out/rate-limited and the audit
correctly proceeded with 197) or **silently lost** (a bug)?

```bash
# How responses are collected vs how calls are counted; where a failed call is handled:
grep -rniE "responses|response.*count|llm.*call|catch|timeout|error.*status|partial_failure|rate_limit|push.*response|skip" lib/**/run-audit-inline.ts lib/llm/ --include=*.ts | head -30
```
```sql
-- For audit #31, how many response/citation rows exist, and are any marked failed/errored?
SELECT count(*) AS total_rows FROM citations WHERE audit_id = 'd9686bac-5dac-4024-9c92-9cb80996c277';
-- If there's a status/error column on responses:
SELECT status, count(*) FROM citations WHERE audit_id = 'd9686bac-5dac-4024-9c92-9cb80996c277' GROUP BY status;
```
**Determine and REPORT:**
- Were the 3 missing responses **failed calls** (timeout / non-200 / rate-limit) that the code caught and
  skipped? → that's GRACEFUL handling = working as designed (the `catch {}` blocks + partial_failure scenario
  in canon are exactly this). Confirm the audit *intended* to proceed with 197.
- Or are 3 responses being **dropped silently** somewhere they shouldn't be (parsed away, lost in aggregation)?
  → that's a bug; describe where.
- **Cost note:** if the 3 were failed calls, was the brand still charged for them? Check whether cost is
  recorded per successful response or per attempted call. (Minor, but worth knowing — you don't want to bill
  for calls that returned nothing.)

**Do NOT change anything for Part 2 — just report the finding** so Sri can decide if a fix is needed.

---

## REPORT
1. **Part 1:** the breakdown component fixed (now filters to mention rows); audit #31 shows 0/0/0; mentioned-
   brand case still correct.
2. **Part 2:** the cause of the 200→197 gap (graceful failed-call skip vs silent drop), whether the audit
   handled it deliberately, and the cost-per-call-vs-per-response finding. Recommendation: bug or working-as-intended.
