# Claude Code — FIX (P0): engine routing — all 4 engines resolve to OpenAI. Then re-validate. (Do NOT skip to Jim's first.)

## The bug (Claude Code diagnosed it correctly — this is a serious regression)
`run-audit.ts:40` calls `getLLMService()` ONCE with no engine arg → resolves to OpenAIImpl → **every one of the 205
"citations" was gpt-4.1-mini**, regardless of the engine label at line 157. Claude / Gemini / Perplexity were NEVER
actually called. This is P0 and it contaminates ALL prior audit data (every audit ran one engine wearing four labels).

**Why this blocks validation (and why NOT to jump to Jim's yet):** "Metropolitan is invisible" and "Jim's = 22%" are
**single-engine (GPT-4.1-mini) findings**, not four-engine reality. Metropolitan may be well-cited by Perplexity (live
web search — likely surfaces a national franchise) and you'd never see it. Picking Jim's off a contaminated 22% is
reasoning from broken data. Fix routing FIRST; re-audit; THEN decide the validation brand on real four-engine numbers.

## Canon (the intended architecture — verified; this is a regression against spec)
- CLAUDE.md 142: `lib/llm/LLMService` is a unified interface over all 4 providers with SEPARATE impl files
  (`openai-impl.ts`, `anthropic-impl.ts`, `google-impl.ts`, and a Perplexity impl). Per-engine impls are the design.
- CLAUDE.md 143 / LLD 143: `selectModel(tier, engine, task)` returns a model string **per tier × engine × task** —
  Agency Pro maps to GPT-4o / Sonnet / 1.5-pro / sonar-pro (four DIFFERENT models). One engine for all four is wrong.
- LLD 7697 canonical call: `LLMService.complete({ task, engine, prompt })` — engine is passed to complete(), and
  complete() must DISPATCH to the matching impl. Engine must drive BOTH the impl AND the model string.

## STEP 1 — Read the routing seam
```bash
sed -n '30,60p' inngest/functions/run-audit.ts
sed -n '150,165p' inngest/functions/run-audit.ts
# The service factory + how (if at all) it takes an engine:
grep -rn "getLLMService\|LLMService\|OpenAIImpl\|AnthropicImpl\|GoogleImpl\|PerplexityImpl\|ClaudeImpl\|GeminiImpl\|SonarImpl\|switch.*engine\|case 'openai'\|case 'anthropic'\|case 'google'\|case 'perplexity'" lib/llm/ | head -40
sed -n '1,80p' lib/llm/index.ts 2>/dev/null || find lib/llm -name "*.ts" | head
```
Report:
- Does `getLLMService()` take an engine param at all? Does it `switch` on engine to return the right impl, or always
  return OpenAIImpl?
- At run-audit.ts:40, is the service resolved ONCE (outside the per-engine loop) and reused? (That's the bug.)
- Does `complete()` receive `engine` and use it to pick the impl + model, or ignore it?

## STEP 2 — Fix: resolve the impl PER ENGINE (route on the engine argument)
Two valid shapes — pick the one that fits the existing factory; do NOT hardcode models (use selectModel):
**Option A — factory takes engine:** `getLLMService(engine)` switches to the correct impl:
```ts
// lib/llm factory:
export function getLLMService(engine: Engine): LLMService {
  switch (engine) {
    case 'openai':     return openAIImpl;
    case 'anthropic':  return anthropicImpl;   // 'claude'
    case 'google':     return googleImpl;      // 'gemini'
    case 'perplexity': return perplexityImpl;  // 'sonar'
    default: throw new Error(`Unknown engine: ${engine}`);
  }
}
```
Then in run-audit, resolve INSIDE the per-engine loop: `const svc = getLLMService(engine); await svc.complete({ task, engine, prompt, model: selectModel(tier, engine, task) })`.
**Option B — complete() dispatches internally:** a single facade whose `complete({ engine, ... })` selects the impl from
`params.engine`. Either way: **the engine argument must select BOTH the provider impl AND the model string
(`selectModel(tier, engine, task)`).**
- Confirm each impl actually calls its provider via the Vercel AI SDK provider (`@ai-sdk/openai` / `@ai-sdk/anthropic` /
  `@ai-sdk/google` / the Perplexity provider) — not all wrapping the OpenAI SDK.
- Map the engine label ↔ provider correctly (claude→anthropic, gemini→google, perplexity→sonar) per your Engine type.
- Do NOT move the service resolution outside the loop again — it must be per-engine.

## STEP 3 — Check API keys for all 4 providers exist in .env.prod (else 3 engines will throw)
```bash
grep -nE "OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_.*KEY|GEMINI_API_KEY|PERPLEXITY_API_KEY" .env.prod | sed -E 's/=.*/=<set>/'
```
Report which provider keys are present. If Anthropic/Google/Perplexity keys are missing, the fix will surface real auth
errors (correctly) — you'll need those keys set for a genuine 4-engine audit. Report missing keys; don't invent them.

## STEP 4 — Restart, re-audit METROPOLITAN on the fixed pipeline (before concluding it's invisible)
Restart the Inngest dev server (function/lib edits need a restart). Run a NEW audit for Metropolitan Plumbing. Watch the
Inngest terminal: confirm calls actually go to 4 DIFFERENT providers now (log the model per engine, or check the
citations' engine + model columns).
```bash
psql "$DATABASE_URL" -c "SELECT engine, COUNT(*) FROM citations c JOIN audits a ON c.audit_id=a.id WHERE a.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au') AND a.created_at > now() - interval '1 hour' GROUP BY engine;"
psql "$DATABASE_URL" -c "SELECT DISTINCT engine, model FROM citations c JOIN audits a ON c.audit_id=a.id WHERE a.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au') AND a.created_at > now() - interval '1 hour';"
```
Report: are there now citations across openai/anthropic/google/perplexity with 4 DIFFERENT models? And crucially —
**is Metropolitan mentioned by any engine now (especially Perplexity)?** Its "invisible" status may have been a
single-engine artifact. Re-check mention_rate/citation_rate for the new audit.

## STEP 5 — Decide the validation brand on REAL 4-engine data
- If Metropolitan now shows NON-zero mention/citation (e.g. Perplexity cites it) → validate the display path with
  Metropolitan; no need for Jim's. Confirm `citation_rate ≤ mention_rate` and open the PDF (rates ≤ 100%, sections
  populated).
- If Metropolitan is STILL invisible across all 4 engines → that's a real, correct finding; add **Jim's Plumbing**
  (`jimsplumbing.net.au`, vertical `tradies`, same org, real competitors) as the validation brand and audit it — it
  should now show genuine multi-engine mention_rate. (Use the same insert pattern as
  add-real-brand-metropolitan-plumbing.md, swapping name/domain.)

## STEP 6 — Fold in bug 10b (fan-out STILL 0 rows) while in the pipeline
Fan-out returned 0 again → it still never runs. This is the same trigger/runtime question from earlier (both fan-out and
SoV bind to `audit.complete`; SoV got 12 rows this run, fan-out 0 → fan-out fails at RUNTIME, not the trigger). With the
Inngest dashboard open during STEP 4's audit, capture WHERE simulate-query-fan-out fails: LLM call (now routed to the
right engine?) / `\n`-split parse / embedding step / budget hard-stop. Report the exact step + error. (Don't fix here
unless trivial — report so it can be scoped; but note the routing fix may change fan-out's behaviour if it was erroring
on an engine mismatch.)

## VERDICT / report back
- Routing: are 4 distinct providers+models now hit (STEP 4)? 
- Metropolitan on 4 engines: still invisible, or now visible (Perplexity)?
- Chosen validation brand + its real mention_rate/citation_rate with citation ≤ mention, and the PDF sections.
- Fan-out: the exact failing step (STEP 6).

## Constraints
- Engine must drive BOTH impl selection AND `selectModel(tier, engine, task)` — no hardcoded models, no single impl for
  all engines.
- Resolve the impl PER ENGINE inside the loop — never once outside it.
- Restart the Inngest dev server before re-auditing. Real 4-engine spend — one audit validates; don't loop.
- Don't delete Metropolitan or prior data; additive. Missing provider keys → report, don't fabricate.

## NOTE
This is the highest-value fix on the board: it's P0, it retroactively means ALL prior audits ran a single engine, and it
contaminates the exact validation you're doing. "Metropolitan invisible / Jim's 22%" are GPT-4.1-mini-only facts — after
routing is fixed and Perplexity/Claude/Gemini actually run, both may change. Fix routing → re-audit Metropolitan → only
then pick the validation brand on real 4-engine data. And Metropolitan being flagged "invisible" is the PRODUCT WORKING
(accurate finding), just not useful for validating the NON-zero display path — which is why we need a genuinely-visible
brand, chosen from real multi-engine results, not a contaminated single-engine 22%.
