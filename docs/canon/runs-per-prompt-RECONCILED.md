# Runs-per-prompt — Canonical Reference

Reconciled 2026-06-23. Supersedes conflicting values in Sprint 3 spec,
prototype JSX, and earlier build defaults.

## Single source of truth

`lib/llm/tier-engines.ts` → `TIER_RUNS_PER_PROMPT`

| Tier       | Default | Env override         |
|------------|---------|----------------------|
| free       | 5       | `TIER_RUNS_FREE`     |
| starter    | 5       | `TIER_RUNS_STARTER`  |
| growth     | 5       | `TIER_RUNS_GROWTH`   |
| agency     | 5       | `TIER_RUNS_AGENCY`   |
| agency_pro | 5       | `TIER_RUNS_AGENCY_PRO` |
| enterprise | 5       | `TIER_RUNS_ENTERPRISE` |

Hard clamp: `RUNS_MIN = 1`, `RUNS_MAX = 5`. Any env value outside this
range is clamped silently after rounding.

## Related constants

| Constant            | Value | File                       |
|---------------------|-------|----------------------------|
| `PROMPTS_PER_AUDIT` | 10    | `lib/llm/tier-engines.ts`  |
| `TIER_ENGINES.free`  | `["chatgpt", "perplexity"]` | same file |
| `TIER_ENGINES.*`     | `["chatgpt", "claude", "gemini", "perplexity"]` | same file |

## Free-tier total calls

`2 engines × 10 prompts × 5 runs = 100 LLM calls`

## Prior conflicting values

| Source             | Stated calls | Implied runs | Status       |
|--------------------|-------------|--------------|--------------|
| Sprint 3 spec      | 100         | 5            | **Matches**  |
| Prototype JSX      | 40          | 2            | Superseded   |
| Build (pre-fix)    | 20          | 1            | Superseded   |
