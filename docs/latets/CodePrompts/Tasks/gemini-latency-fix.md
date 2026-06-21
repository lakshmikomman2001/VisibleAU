# VisibleAU — Gemini API Latency Fix — Claude Code prompt

**Created:** 2026-06-21
**Priority:** Medium (not blocking, but degrades audit UX)
**Sprint scope:** Post-Sprint 8 polish (can be applied any time)

---

## Context

During Sprint 8 prod testing, Gemini API calls take 5-15x longer than ChatGPT, Claude,
and Perplexity. Root cause identified: `gemini-2.5-flash` and `gemini-2.5-pro` are
**thinking models** — they run internal chain-of-thought before generating output. The other
engines use standard (non-thinking) models.

Evidence from a real audit run (Employment Hero, Agency tier, 4 engines × 9 prompts × 5 runs):
- ChatGPT (gpt-4.1): 45/45 complete while Gemini at 5/45
- Claude (claude-sonnet-4-6): 45/45 complete
- Perplexity (sonar-pro): 45/45 complete
- Gemini (gemini-2.5-pro): 5/45 (11%) — ~9x slower

Secondary issue: only `openai-impl.ts` implements response caching (`getCached`/`setCached`).
Anthropic, Google, and Perplexity impls all skip the cache layer (CLAUDE.md §3 Layer 1).

---

## Scope

Two fixes, both additive, both independently shippable:

1. **FIX 1 — Gemini model selection** (model-selector.ts): switch to non-thinking models
   or disable thinking via API config.
2. **FIX 2 — Response caching parity** (anthropic-impl.ts, google-impl.ts, perplexity-impl.ts):
   add the same `getCached`/`setCached` pattern that openai-impl.ts already uses.

---

## FIX 1 — Gemini model selection

### Option A: Switch to non-thinking models (recommended)

In `lib/llm/model-selector.ts`, change Gemini models:

| Tier | Current (thinking) | Proposed (non-thinking) |
|------|-------------------|------------------------|
| Free/Starter/Growth | `gemini-2.5-flash` | `gemini-2.0-flash` |
| Agency/Agency Pro/Enterprise | `gemini-2.5-pro` | `gemini-2.0-flash` |
| DERIVED_TASK_MODELS | `gemini-2.5-flash` | `gemini-2.0-flash` |

**Why `gemini-2.0-flash`:** Non-thinking, fast (~1-3s), good quality for brand-mention
detection. `gemini-2.0-flash-lite` is even faster but lower quality — not recommended
for the primary brand_mention task.

**Validation:**
- Run a mock audit and verify Gemini completes within the same time window as other engines.
- Run a real audit on a test brand and compare Gemini latency before/after.
- Update `tests/unit/llm/model-selector.test.ts` — change expected Gemini models.

### Option B: Keep 2.5 models but disable thinking

In `lib/llm/google-impl.ts`, add thinking budget config:

```typescript
const result = await generateText({
  model: google(modelId),
  prompt: input.prompt,
  temperature: 0.7,
  maxTokens: 800,
  providerOptions: {
    google: { thinkingConfig: { thinkingBudget: 0 } },
  },
} as Parameters<typeof generateText>[0]);
```

**Trade-off:** Keeps 2.5 model intelligence but disables the thinking that causes latency.
May not be supported on all 2.5 variants — test before shipping.

### Option C: Offer both (tier-based)

- Free/Starter/Growth: `gemini-2.0-flash` (speed priority)
- Agency/Agency Pro: `gemini-2.5-flash` with `thinkingBudget: 1024` (quality, moderate speed)
- Enterprise: `gemini-2.5-pro` with full thinking (quality priority, latency acceptable)

This matches the tier-aware model dispatch philosophy (CLAUDE.md §3, §4).

### Decision guidance

Pick Option A unless Sri specifically wants Gemini thinking quality for higher tiers.
Option A is simplest, fastest, and aligns with how the other engines are configured
(cheapest-competent model for the task).

---

## FIX 2 — Response caching parity

### Current state

Only `openai-impl.ts` implements CLAUDE.md §3 Layer 1 (response cache):

```
openai-impl.ts    → getCached / setCached ✅
anthropic-impl.ts → NO CACHE ❌
google-impl.ts    → NO CACHE ❌
perplexity-impl.ts→ NO CACHE ❌
```

### What to do

Add the same caching pattern to all three missing impls. The pattern (from openai-impl.ts):

```typescript
import { getCached, setCached } from "./cache";

// Before API call:
if (!input.metadata?.bypassCache) {
  const hit = await getCached(input.prompt, modelId);
  if (hit) return hit;
}

// After API call, before return:
if (!input.metadata?.bypassCache) {
  await setCached(input.prompt, modelId, output).catch(() => {});
}
```

### Files to modify

1. `lib/llm/anthropic-impl.ts` — add `getCached`/`setCached` import + cache check/store
2. `lib/llm/google-impl.ts` — add `getCached`/`setCached` import + cache check/store
3. `lib/llm/perplexity-impl.ts` — add `getCached`/`setCached` import + cache check/store

### Validation

- Verify `lib/llm/cache.ts` exists and exports `getCached`/`setCached`.
- Run two back-to-back audits for the same brand with the same prompts.
- Second audit should show significantly lower latency + cost (cache hits).
- `LLM_MODE=mock` should still work (mock-impl.ts bypasses cache, which is correct).
- No test changes needed — caching is transparent to callers.

### Anti-pattern check

- Do NOT cache when `input.metadata?.bypassCache` is true (canary prompts use this).
- Do NOT cache errors or empty responses.
- Cache key is `(prompt, modelId)` tuple — verified by reading `cache.ts`.

---

## Verification checklist

- [ ] Gemini audit calls complete within ~2x of ChatGPT/Claude (not 9x)
- [ ] `model-selector.test.ts` updated if model strings changed
- [ ] `tsc --noEmit` passes
- [ ] `vitest run` passes (all existing tests)
- [ ] Cache hits visible in second audit run (check DB or logs)
- [ ] `LLM_MODE=mock` still works correctly
- [ ] No changes to scoring logic, audit flow, or API routes

---

## Files touched

- `lib/llm/model-selector.ts` (FIX 1)
- `lib/llm/google-impl.ts` (FIX 1 Option B + FIX 2)
- `lib/llm/anthropic-impl.ts` (FIX 2)
- `lib/llm/perplexity-impl.ts` (FIX 2)
- `tests/unit/llm/model-selector.test.ts` (if model strings change)
