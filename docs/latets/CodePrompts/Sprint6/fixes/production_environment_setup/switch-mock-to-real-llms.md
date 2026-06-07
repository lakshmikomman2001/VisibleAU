# Claude Code — switch LLM calls from MOCK to REAL, fix per-dimension CIs, add meta-line cost details

## Context

Audits currently run against MOCK fixtures (`LLM_MODE=mock`, `happy_path`) — every engine returns
the same canned text, the brand is "mentioned" 100% of the time, and cost is fake. The pipeline,
scoring, run count (200 calls), and the rich results page all work now. This task makes the audits
hit the **real** LLM APIs, and folds in two follow-ups:
- **(B) per-dimension confidence intervals are partly wrong** — Position (93.5) and Context (50.0)
  show a CI of 98–100, which does not bracket their scores. The composite CI is fine; only the
  per-dimension CIs are off. Fix the CI computation so each dimension's CI brackets its own score.
- **(C) meta-line cosmetics** — the audit results header is missing the audit **duration** and the
  **AUD** conversion next to the USD cost.

Do all of this **diagnostic-first**: investigate and report, then change, then verify on ONE fresh
real audit at the end. Do not hardcode env-var names, the non-mock mode value, or model strings —
read them from the code.

PREREQUISITE for Sri: real API keys are required for all four providers (OpenAI for ChatGPT,
Anthropic for Claude, Google AI for Gemini, Perplexity). If any are missing, Phase 2 will stop and
ask for them — that is expected, not an error.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 1 — INVESTIGATE AND REPORT (no code changes)
═══════════════════════════════════════════════════════════════════════════════

### Mock → real
1. Open `getLLMService()` (search: `grep -rn "getLLMService\|LLM_MODE" --include=*.ts`). Report the
   EXACT value of `LLM_MODE` that selects the REAL service (e.g. `live` / `real` / "anything not
   'mock'"). Quote the code.
2. Confirm the four real engine implementations exist and which provider + env key + model each uses
   (search `lib/llm/`): the ChatGPT/OpenAI impl, `anthropic-impl.ts`, `google-impl.ts`,
   `perplexity-impl.ts`. For each, report the exact env-var name it reads
   (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `PERPLEXITY_API_KEY`).
3. Open the model selector (`lib/llm/model-selector.ts`). Report which model strings the **Agency**
   tier resolves to for each engine in real mode (e.g. gpt-4o-mini / claude-… / gemini-1.5-flash /
   sonar). Confirm they are not hardcoded elsewhere.
4. Report current env state WITHOUT printing secret values — just present/absent for `LLM_MODE`,
   `MOCK_SCENARIO`, and each of the four API keys (e.g. `OPENAI_API_KEY: set` / `: MISSING`).
5. **Critical:** does `getLLMService()` (or the impls) silently FALL BACK to mock / to empty when a
   key is missing or a call fails? Report exactly what happens on a missing key or an API error.
   (We must NOT silently serve mock data in real mode.)

### (B) Per-dimension CIs
6. Find where per-dimension confidence intervals are computed and written to
   `audits.confidence_intervals` (search: `confidence_intervals\|confidenceInterval\|wilson\|CI`).
   Report the method used per dimension. Identify WHY Position and Context end up with 98–100
   (copied from Frequency? a shared default? wrong key mapping?). Read
   `03-sprint-prompts/sri-visibleau-sprint-3-prompt.md` for the canonical CI method per dimension.

### (C) Meta line
7. Report the audit timestamp columns available for a duration (e.g. `started_at` / `created_at`
   and `completed_at`). Report whether any USD→AUD rate mechanism exists in the codebase (a config
   constant, env var, or fetch). If none, note that — we'll add a documented constant.

### → REPORT items 1–7 before any change.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 2 — SWITCH TO REAL (config + keys, then prove live calls)
═══════════════════════════════════════════════════════════════════════════════

1. Set `LLM_MODE` to the real value from Phase 1 (in `.env` / `.env.local`). Leave `MOCK_SCENARIO`
   in place but unused.
2. Ensure all four API keys are present. You cannot create secret keys — if any are MISSING from
   Phase 1, STOP here and tell Sri exactly which env vars to add and in which file, then wait. Do
   not proceed with missing keys.
3. **Harden the real path:** if a key is missing or an API call errors in real mode, the service must
   FAIL LOUDLY (throw / mark the audit `failed` with an error message) — it must NEVER silently fall
   back to mock fixtures or to empty results. If Phase 1 found a silent fallback, remove it for real
   mode.
4. **Prove each engine makes a LIVE call.** Add (or run) a tiny one-off check that invokes each of
   the four engines with a trivial prompt through the real service and prints the first ~80 chars of
   the genuine response + the model used. Confirm all four return real, distinct text (not fixture
   text). Report the four outputs. Remove any throwaway script afterward.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 3 — FIX PER-DIMENSION CONFIDENCE INTERVALS (B)
═══════════════════════════════════════════════════════════════════════════════

- Compute EACH dimension's CI for that dimension (per the Sprint-3 method, Phase 1 item 6) and write
  correct `{lower, upper}` per dimension into `confidence_intervals`. Position and Context must use
  their own CIs and must bracket their own scores — they must NOT inherit Frequency's interval.
- Invariant to enforce in code: for every dimension, `lower ≤ score ≤ upper` (clamp to [0,100]). If
  a dimension's CI cannot be computed for a given input, fall back to a symmetric interval around the
  score, not to another dimension's value.
- (This will be validated on real data in Phase 5, where the dimensions are no longer all-100.)

═══════════════════════════════════════════════════════════════════════════════
## PHASE 4 — META-LINE COSMETICS (C)
═══════════════════════════════════════════════════════════════════════════════

In the audit results header meta line (`app/(auth)/audits/[auditId]/page.tsx`), currently
"Audit #N · {date} · US${cost} cost · {N} LLM calls", add:
- **Duration**: computed from the timestamps in Phase 1 item 7 (`completed_at − started_at`/`created_at`),
  formatted compactly as `Xm Ys` (or `Xs` under a minute). Insert after the date.
- **AUD conversion** next to the USD cost: `US$0.84 cost (≈ A$1.30)`. Use the codebase's USD→AUD
  mechanism if one exists; if not, add a single documented constant
  `const AUD_PER_USD = 1.55; // approximate display rate` in a sensible shared location, and a brief
  comment that it's a display estimate. Round AUD to 2 decimals.
- Keep the line in the same style/tokens; this is display-only.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 5 — VERIFY ON ONE FRESH REAL AGENCY AUDIT
═══════════════════════════════════════════════════════════════════════════════

Trigger a new audit on the Agency-tier brand and confirm ALL of the following — this is the proof
you've actually left mock mode:

1. **Responses VARY** — the "Bondi" vs "Sydney CBD" prompts now return DIFFERENT text (not identical),
   and an HVAC question returns an HVAC-relevant answer (not plumbing boilerplate).
2. **The fake brand scores realistically** — "Bondi Plumbing" is a made-up test brand not in any real
   model's knowledge, so expect a LOW score and a mention rate well under 100% (likely near zero).
   A non-100 score here is the correct, honest result and the strongest proof real calls ran.
3. **Real cost** — non-zero, derived from real token usage; and `audits.metadata` does NOT contain a
   `mockScenario` for this audit. Confirm `total_calls = 200`.
4. **Per-dimension CIs now bracket their scores** — for the new audit, verify in the DB and on screen
   that for every dimension `lower ≤ score ≤ upper` (no more 98–100 on a 50-point dimension):
   ```sql
   SELECT score_frequency, score_position, score_sentiment_numeric, score_context_numeric,
          score_accuracy, confidence_intervals
   FROM audits ORDER BY created_at DESC LIMIT 1;
   ```
5. **Meta line** shows the duration and `(≈ A$…)` next to the USD cost.
6. `pnpm typecheck` and `pnpm lint` clean.

## Final report
Summarise: (a) the exact `LLM_MODE` real value and which keys were present/missing; (b) the four
live-call outputs proving real responses; (c) confirmation no silent mock fallback remains; (d) the
per-dimension CI fix and the bracket-check result; (e) the meta-line change; (f) the Phase 5 audit's
score + mention rate for the fake brand (expected low). Paste the SQL output and the four live-call snippets.
