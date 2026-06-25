# VisibleAU — Investigation ONLY: Free-tier audit shape + RUNS_PER_PROMPT
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
**DO NOT change any code, schema, env, or data. This is read-only. Report findings only.**

---

## Why
A first-audit result for a Free-tier brand showed **"2 engines · 10 prompts · 20 LLM calls"** and a
score with confidence intervals. Canon (Sprint 3) says a Free-tier audit should be **2 engines × 10
prompts × 5 runs = 100 LLM calls**, with Wilson 95% CIs computed across the 5 runs. The displayed
"20 calls" implies runs-per-prompt is effectively **1**, which (if true) makes the confidence
intervals statistically invalid (a 95% CI from n=1 is meaningless).

There is also a **canon conflict** on the Free-tier numbers (Sprint 3 says 100 calls / ~US$1.50;
the prototype says 40 calls / ~A$0.30–0.50; the build did 20). Before fixing anything, the operator
needs the FACTS from the actual code + DB to decide the canonical number. Your job is to surface
those facts precisely. **Do not fix, do not pick a number, do not edit. Investigate and report.**

---

## Tasks (read-only — run each, paste the raw output, then summarise)

### 1. Where is the runs-per-prompt constant, and what is its value?
```bash
grep -rniE "RUNS_PER_PROMPT|runsPerPrompt|runs_per_prompt|RUNS\b" lib inngest app db 2>/dev/null
```
- Open the file(s) that DEFINE it. Report the literal value (e.g. `= 5` or `= 1`).
- Report EVERY place it is read/used. If it's defined as 5 but a different value is passed into the
  audit loop, show that override. Quote the actual loop, e.g. the `for (let r = 1; r <= ...; r++)`.

### 2. How does the audit job compute total calls + iterate runs?
```bash
grep -rniE "totalCalls|total_calls|engines.length|prompts.length|for \(let r|for \(const r|\* 5|\* RUNS" lib/audit inngest 2>/dev/null
```
- Open the main audit job (likely `lib/audit/run-audit.ts` or an Inngest function under
  `inngest/functions/`). Quote the section that loops engines × prompts × runs and the line that
  computes `totalCalls`. State plainly: **how many runs per prompt does the code actually execute?**

### 3. What did the most recent audit RECORD in the DB?
Use the repo's DB access (drizzle / a psql script / `.env` `DATABASE_URL`). Run:
```sql
SELECT id, status, engine_count, prompt_count, total_calls, total_cost_usd,
       score_composite, score_confidence_low, score_confidence_high, created_at
FROM audits
ORDER BY created_at DESC
LIMIT 3;
```
- If a `runs_per_prompt` column exists, include it. If a column doesn't exist, drop it and note that.
- Also count the actual citation/response rows for the latest audit to cross-check calls:
```sql
-- adjust table name to the real one (citations / audit_responses / llm_calls):
SELECT audit_id, COUNT(*) AS row_count
FROM citations
WHERE audit_id = '<the latest audit id from above>'
GROUP BY audit_id;
```
Report whether `total_calls` (and the row count) = 20, 40, or 100 for the latest Free-tier audit.

### 4. Confirm the LLM mode the latest audit ran in.
```bash
grep -niE "LLM_MODE|SAMPLE_AUDIT_USE_REAL_LLM" .env .env.local .env.dev 2>/dev/null
```
- Report mock vs real. (This tells the operator whether the score itself is a mock artifact or a
  genuine result — context for, but separate from, the runs question.)

### 5. How is the Wilson CI computed — and does it depend on runs?
```bash
grep -rniE "wilson|confidence.*interval|95% CI|trials|n =|sampleSize|sample_size" lib 2>/dev/null
```
- Open the Wilson CI util. Report what it uses as the trial/sample count `n`. State explicitly:
  **if runs-per-prompt is 1, what does the CI math receive as n, and is that statistically valid?**
  (Do not fix — just report the dependency.)

### 6. What do the Free-tier numbers say across canon vs build? (read-only cross-check)
Search the wizard Step 4 callout + cost line in the built component:
```bash
grep -rniE "engines.*prompts.*runs|LLM calls|first audit cost|A\\$0\.3|A\\$2\.5|100 calls|40 calls|20 calls|US\\$1\.50" app components lib 2>/dev/null
```
- Quote the EXACT built string (the "2 engines × 10 prompts × N runs = N calls" line) and the cost
  line. This is what the user sees on the confirm screen.

### 7. (If the repo also contains the canon docs) quote the three conflicting sources verbatim.
```bash
grep -rniE "2 engines.*(10|20) prompts.*(1|5) runs|= (20|40|100) calls|~US\\$1\.50|~A\\$0\.30|~A\\$1\.50" \
  04-sprint-prompts 03-prototype 01-foundational 2>/dev/null
```
- If those paths don't exist in this repo, skip (the operator has them elsewhere).

---

## Output format (this is the whole deliverable)

Produce a short report with exactly these sections — **facts only, no fixes, no recommendation on
which number is "right" unless asked:**

1. **RUNS_PER_PROMPT** — where defined, its literal value, and the value the audit loop ACTUALLY
   executes (note any override).
2. **Latest audit (DB)** — `total_calls`, `total_cost_usd`, `engine_count`, `prompt_count`,
   score + CI bounds, and the cross-checked row count. State: 20 / 40 / 100?
3. **LLM mode** — mock or real for that audit.
4. **Wilson CI dependency** — what `n` the CI math uses, and whether runs=1 makes it degenerate.
5. **Built confirm-screen copy** — the exact call-count string + cost line the user sees.
6. **The three Free-tier numbers** — a 3-row table: {Sprint 3 spec} vs {prototype} vs {actual build},
   each with formula + call count + cost, exactly as found.

Do not modify anything. Do not generate a migration. Do not "fix while you're there." Report and stop.
