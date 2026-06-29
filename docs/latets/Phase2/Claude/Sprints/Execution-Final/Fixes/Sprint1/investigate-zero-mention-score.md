# Claude Code — INVESTIGATE: is 13.8 for a 0%-mention brand a bug, or canon-intended?

Audit #28 (Sydney Plumbing Solutions) completed with **0% mention rate on ALL 4 engines** (ChatGPT/Claude/
Gemini/Perplexity all 0.0) yet a **composite visibility score of 13.8**. Frequency 0.0, Position 0.0, Accuracy
0.0 — but **Sentiment 50.0** and **Context 25.0** (and sentiment shows 192 Neutral / 0 Positive / 0 Negative).
Determine whether the 13.8 is **correct-by-design** or a **scoring bug**.

> **Investigate only. Make NO code changes.** Read the CANON first to find the INTENDED behaviour, then read the
> ACTUAL code/data, then judge. Report findings + a recommendation. Do not "fix" anything in this task.

---

## THE QUESTION TO ANSWER
When a brand is mentioned in **0%** of responses, what SHOULD the Sentiment dimension, the Context dimension,
and the composite score be — **null/0**, or a **default (50/25)**? And does the current code match that intent?

## STEP 1 — Read the CANON intent (the scoring spec)
The scoring is specified in Sprint 3. Read the dimension-calculator specs and the null convention:
```bash
# The dimension formulas + the null-when-not-mentioned convention:
grep -rniE "null = not mentioned|positions.*null|mention.*null|null.*mention|SENTIMENT_SCORE_MAP|CONTEXT_SCORE_MAP|neutral.*50|mentionedCount|scoreSentiment|scoreContext|classifySentiment|classifyContext|per mention" docs/ *.md 04-sprint*/ 2>/dev/null | head -30

# Open the actual dimension calculator files:
find . -path "*/node_modules" -prune -o \( -name "sentiment.ts" -o -name "context.ts" -o -name "frequency.ts" -o -name "position.ts" -o -name "accuracy.ts" \) -print 2>/dev/null
```
**Find and report:**
- Does canon say a non-mentioned brand's dimensions are **null** (the schema has `scoreSentiment ... | null` etc.)?
- Are `classifySentiment()` / `classifyContext()` specified to run **per MENTION row** (only on responses that
  actually mention the brand)? If so, 0 mentions → 0 classification rows → sentiment/context should be **null**,
  NOT 50/25.
- What is `neutral: 50` / the SENTIMENT_SCORE_MAP intended for — a genuinely-neutral MENTION, or a non-mention?

## STEP 2 — Read the ACTUAL code: what does sentiment/context score OVER?
The core question: do sentiment & context compute over **all responses** (192) or only **mention rows** (0)?
```bash
# How sentiment.ts / context.ts select their input rows:
grep -rniE "mention|mentioned|where|filter|rows|responses|classifySentiment|classifyContext|neutral|50|25|default" lib/**/sentiment.ts lib/**/context.ts lib/**/*sentiment* lib/**/*context* 2>/dev/null | head -30

# Where the composite is assembled from the 5 dimensions (does it treat null dims correctly?):
grep -rniE "composite|scoreComposite|weight|0.25|0.20|0.15|null|coalesce|\?\?|default" lib/**/*score* lib/**/*composite* lib/**/finalize* 2>/dev/null | head -20
```
**Determine:** does the code filter to mention rows before classifying sentiment/context, or does it classify
ALL 192 responses (defaulting non-mentions to neutral=50)? The 192-Neutral reading on a 0%-mention brand
suggests it's classifying non-mention responses — confirm in code.

## STEP 3 — Inspect the ACTUAL audit #28 data
```sql
-- Audit #28's stored dimension scores + mention count:
SELECT score_composite, score_frequency, score_position, score_sentiment_numeric,
       score_context_numeric, score_accuracy
FROM audits WHERE id = '155f35bf-b3ec-46c5-a9ba-a3e495e00419';

-- How many citation/response rows actually MENTIONED the brand vs total?
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE mentioned = true) AS mention_rows   -- adjust 'mentioned' to the real column
FROM citations WHERE audit_id = '155f35bf-b3ec-46c5-a9ba-a3e495e00419';

-- The sentiment values stored per row (are 192 non-mention rows tagged 'neutral'?):
SELECT sentiment, count(*) FROM citations
WHERE audit_id = '155f35bf-b3ec-46c5-a9ba-a3e495e00419'
GROUP BY sentiment;   -- adjust column name
```
**Report:** mention_rows (expect 0), and whether 192 non-mention rows carry a 'neutral' sentiment that's
feeding the 50.0.

## STEP 4 — Compute the verdict
With the canon intent (Step 1) + actual behaviour (Steps 2-3), determine which is true:

- **BUG** if: canon says non-mention dimensions should be **null** (and the composite should treat them as
  null → composite ~0 or null), but the code is **defaulting** sentiment to 50 / context to 25 by classifying
  non-mention rows. → A 0%-mention brand is getting ~13.8 it shouldn't. The honest score for "AI never mentions
  this brand" should be ~0 (or null with a "not enough data" state).
- **INTENDED** if: canon explicitly specifies a neutral baseline (50/25) for unmentioned brands as a deliberate
  design choice (e.g. "absence of negative sentiment = neutral 50"). → 13.8 is by design; document why.

Show the arithmetic: with weights Frequency 25% · Position 25% · Sentiment 20% · Context 15% · Accuracy 15%,
confirm `0×.25 + 0×.25 + 50×.20 + 25×.15 + 0×.15 = 13.75 ≈ 13.8` — i.e. the entire 13.8 comes from the
sentiment(50) + context(25) defaults. If those should be null, the composite should be ~0 (or null).

## REPORT (no code changes)
1. **Canon intent** (Step 1): null vs default for unmentioned dimensions — quote the spec line.
2. **Actual behaviour** (Steps 2-3): what sentiment/context score over; the audit #28 data; mention_rows count.
3. **Verdict:** BUG or INTENDED, with the reasoning and the 13.8 arithmetic.
4. **If BUG:** the precise location (which file defaults instead of nulling) and a one-line description of the
   fix — but DO NOT apply it. Sri will decide.
5. **If INTENDED:** note where canon specifies the neutral baseline, so it's documented rather than re-questioned.
