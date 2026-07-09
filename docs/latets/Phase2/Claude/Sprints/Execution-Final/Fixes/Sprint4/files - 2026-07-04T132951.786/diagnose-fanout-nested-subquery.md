# Claude Code — DIAGNOSE (report-first, NO fixes): fan-out sub-queries are NESTED/malformed

The generated report shows malformed sub-query text:
`"What are the best options for Who are the best plumbers in Bondi, NSW??"` — a template
(`"What are the best options for {X}"`) wrapped around an ALREADY-complete question
(`"Who are the best plumbers in Bondi, NSW?"`), producing a doubled `??`. The fan-out sub-query generation is applying
a template to a value that's already a full prompt. This is UPSTREAM (Sprint 3 fan-out data that S4's report reads).

**DIAGNOSE ONLY. Find where the nesting happens. Change NO source.**

## STEP 1 — Where are fan-out sub-queries generated?
```bash
grep -rn "What are the best options for\|Compare top providers\|Reviews and recommendations\|generateSubQueries\|sub.?query\|subQuery" lib/visibility/ inngest/functions/simulate-query-fan-out.ts lib/communication/ 2>/dev/null | head
cat lib/visibility/fan-out-simulator.ts 2>/dev/null | head -80
# The mock/generation of sub-queries (these template strings):
grep -rn "best options for\|Compare top\|Reviews and\|template\|\\\${" lib/visibility/*.ts inngest/functions/simulate-query-fan-out.ts 2>/dev/null | head
```
Report: where do the sub-query TEMPLATES live (`"What are the best options for {X}"` etc.)? What is `{X}` filled
with — the base PROMPT (a full question like "Who are the best plumbers in Bondi, NSW?"), or a TOPIC/keyword (like
"plumbers in Bondi")?

## STEP 2 — The nesting: template applied to a full prompt vs a topic
The bug: `"What are the best options for {X}"` where X = "Who are the best plumbers in Bondi, NSW?" →
"What are the best options for Who are the best plumbers in Bondi, NSW??". The template EXPECTS a topic/noun-phrase
("plumbers in Bondi"), but is getting a full QUESTION.
```bash
# What's passed as the substitution value?
grep -n "resolvedPrompt\|basePrompt\|prompt\|topic\|\\\${" inngest/functions/simulate-query-fan-out.ts lib/visibility/fan-out-simulator.ts 2>/dev/null | head
```
Report: is the sub-query template being filled with the full prompt text (→ nesting) instead of an extracted
topic/subject? Where does that value come from?

## STEP 3 — Is this the MOCK path or real generation?
The report was generated with real-LLM in production mode earlier, but this may be mock sub-queries. Confirm:
```bash
grep -n "generateMockSubQueries\|LLM_MODE\|mock\|selectModel\|getLLMService" inngest/functions/simulate-query-fan-out.ts lib/visibility/fan-out-simulator.ts 2>/dev/null | head
```
Report: are these nested sub-queries from the MOCK generator (hardcoded templates) or the real LLM path? (If mock →
the mock templates naively wrap the full prompt; if real → the LLM prompt is malformed.) Which env/DB produced this
report's fan-out data?

## VERDICT (report)
- **Mock templates wrap the full prompt** → the mock sub-query generator applies "What are the best options for {X}"
  to the whole prompt instead of a topic. Fix direction: extract a topic/subject, OR use templates that read
  naturally with a full question, OR make the mock sub-queries standalone questions.
- **Real LLM path malformed** → the sub-query generation prompt nests. Fix direction: fix the generation prompt.
- Report which, where the template + substitution live, and the fix direction (for approval).

## REPORT
- Where sub-query templates live + what fills the placeholder (full prompt vs topic).
- Mock vs real path; which produced this data.
- The nesting mechanism (template × full-prompt) + fix direction.
- No source/data changed; which DB.

## NOTE
This is a Sprint 3 fan-out data-quality bug surfacing in the S4 report (S4 reads S3's query_fan_out_results). The
report's prose-formatting fix (separate) will format whatever sub-query strings exist — but the STRINGS themselves
are malformed (nested). This diagnosis finds where the nesting originates so the sub-queries read naturally. Lower
urgency than the pipeline (which now works) but part of "fully functional" — a customer report showing
"What are the best options for Who are the best plumbers...??" looks broken.
