# Web search / grounding per engine

Vunnara Build 1, Part G.1. Researched live (not from training-data
memory) against each provider's current official docs, and cross-
checked against the exact npm packages installed in this repo
(`ai@6.0.195`, `@ai-sdk/openai@3.0.67`, `@ai-sdk/anthropic@3.0.81`,
`@ai-sdk/google@3.0.80`) by reading their shipped `.d.ts` files
directly — not just the public docs sites, which sometimes describe a
newer SDK major than what's actually installed here.

**Last verified: 2026-10-18.**

## Summary table

| Engine | Tool | AI SDK helper (installed version) | Model support | Location biasing | Price |
|---|---|---|---|---|---|
| ChatGPT (gpt-4.1-mini) | `web_search` (Responses API, GA) | `openai.tools.webSearch({...})` | Explicitly listed, supported | Yes (`userLocation`) | $10/1,000 calls + ~8,000 input tokens/call (fixed block for this model) |
| Claude (claude-haiku-4-5) | `web_search_20250305` | `anthropic.tools.webSearch_20250305({...})` | Not explicitly confirmed for this model in docs — verify with a real call before relying on it | Yes (`userLocation`) | $10/1,000 searches + normal token costs; errored searches not billed |
| Gemini (gemini-2.5-flash) | `google_search` | `google.tools.googleSearch({})` | Explicitly listed, supported | **Not supported/undocumented** for this tool (the `latLng` field in the schema is for the separate Maps-grounding tool) | Free: 500 RPD. Paid: 1,500 RPD free, then $35/1,000 grounded prompts |
| Perplexity (sonar-pro) | N/A — always grounded already | Direct `fetch()` (no AI SDK provider compatible with this project's `ai` version — see perplexity-impl.ts's own comment) | N/A | Not used (no change) | Unchanged, already in normal per-token pricing |

No `@ai-sdk/*` package needs a version bump for this feature — all
three tool helpers are already present in the versions this project
has installed.

## ChatGPT (OpenAI)

- Source: https://developers.openai.com/api/docs/guides/tools-web-search
  (OpenAI's current docs host; `platform.openai.com/docs/*` now
  redirects here) and https://developers.openai.com/api/docs/pricing.
- Tool type `"web_search"` (GA) on the **Responses API** — the older
  `"web_search_preview"` type still works but lacks `filters`/
  `external_web_access`/`return_token_budget`. The Chat-Completions
  "search preview" models (`gpt-4o-mini-search-preview` etc.) are being
  phased out; Responses API is the supported path going forward.
- **Must call `openai.responses(modelId)`, not `openai(modelId)`** —
  `web_search` is Responses-API-only.
- AI SDK usage (confirmed present in the installed `@ai-sdk/openai@
  3.0.67`):
  ```ts
  import { openai } from "@ai-sdk/openai";
  const result = await generateText({
    model: openai.responses("gpt-4.1-mini"),
    prompt,
    tools: {
      web_search: openai.tools.webSearch({
        searchContextSize: "medium",
        userLocation: { type: "approximate", country: "AU", city, region },
      }),
    },
  });
  result.sources; // Array<{ type: "source", sourceType: "url", id, url, title? }>
  ```
  The installed 3.0.67's `filters` option only exposes
  `allowedDomains` (no `blockedDomains` until `@ai-sdk/openai@3.0.130`+)
  — not used here, so irrelevant to this build.
- `gpt-4.1-mini` is explicitly named in OpenAI's own Responses-API
  limitations table for this tool and in its pricing page's
  web-search billing example — no model swap needed.
- User location: `userLocation: { type: "approximate", country, city,
  region, timezone }` — all optional sub-fields, `country` should be a
  2-letter code.
- Pricing: $10.00 / 1,000 calls, plus search-result content billed as
  input tokens at the model's normal rate — for `gpt-4.1-mini`
  specifically, OpenAI fixes this at an 8,000-input-token block per
  call regardless of how much content was actually fetched. So each
  grounded ChatGPT call costs roughly: $0.01 (tool fee) + 8,000 input
  tokens × gpt-4.1-mini's input rate.
- Rate limits: no web-search-specific RPM/TPM ceiling found in
  OpenAI's rate-limits docs — it consumes the normal per-model
  request/token budget.

## Claude (Anthropic)

- Source: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
  (Anthropic's current docs host).
- Three tool versions are live simultaneously: `web_search_20250305`
  (basic), `web_search_20260209` (adds dynamic result filtering,
  requires Claude 4.6+), `web_search_20260318` (adds
  `response_inclusion` for agentic workflows). This build uses the
  basic `web_search_20250305` — the installed `@ai-sdk/anthropic@
  3.0.81` only ships helpers for `_20250305` and `_20260209` (confirmed
  by reading its `.d.ts`); `_20260318` doesn't exist in this version.
- AI SDK usage:
  ```ts
  import { anthropic } from "@ai-sdk/anthropic";
  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    prompt,
    tools: {
      web_search: anthropic.tools.webSearch_20250305({
        maxUses: 5,
        userLocation: { type: "approximate", city, region, country, timezone },
      }),
    },
  });
  result.sources; // same shape as OpenAI's, above
  ```
- **Model support caveat**: Anthropic's Models API exposes a
  `capabilities.server_tools.web_search.supported` field per model,
  which is the authoritative way to check, but no docs page states
  outright whether `claude-haiku-4-5` (a pre-4.6 model) supports the
  basic `_20250305` tool. Third-party cost calculators list Haiku 4.5
  with web search at the standard rate, consistent with support, but
  this is not a first-party confirmation. The implementation below
  treats a web-search failure (including an unsupported-model
  response) as a real, surfaced error per Part G.6 — it does not
  silently fall back to a memory-only answer, so if this model
  genuinely doesn't support it in production, the failure will be
  visible rather than quietly wrong.
- User location: `{ type: "approximate", city, region, country,
  timezone }` — `country` must be a 2-letter ISO 3166-1 alpha-2 code
  (an unsupported code returns a 400).
- Pricing: $10 per 1,000 searches, plus normal token costs for
  search-result content (counted as input tokens, including on later
  turns that still carry the result). Errored searches are not billed.
- `maxUses` caps searches per request; exceeding it or hitting a rate
  limit comes back as an in-band error block (`web_search_tool_result_
  error`, HTTP 200) rather than a thrown exception — the implementation
  treats that error block as a real error (Part G.6), not a mention
  outcome.

## Gemini (Google)

- Source: https://ai.google.dev/gemini-api/docs/grounding,
  https://ai.google.dev/gemini-api/docs/pricing,
  https://ai.google.dev/gemini-api/docs/rate-limits.
- Tool name `google_search` (current). `google_search_retrieval` is
  the legacy tool for older (1.5-era) models — `gemini-2.5-flash` uses
  `google_search`.
- AI SDK usage (confirmed in installed `@ai-sdk/google@3.0.80`):
  ```ts
  import { google } from "@ai-sdk/google";
  const result = await generateText({
    model: google("gemini-2.5-flash"),
    prompt,
    tools: { google_search: google.tools.googleSearch({}) },
  });
  result.sources; // same generic shape as the other two providers
  result.providerMetadata?.google?.groundingMetadata; // webSearchQueries, groundingChunks, etc.
  ```
  No `useSearchGrounding` boolean exists in this installed version —
  that name is stale/from a different SDK convention; use
  `google.tools.googleSearch({})`.
- `gemini-2.5-flash` is explicitly listed in Google's own grounding
  pricing table — supported, no model swap needed.
- **User location is NOT supported for this tool.** The schema has a
  `retrievalConfig.latLng` field, but every documented use of it is
  for the separate Google Maps grounding tool; the Grounding-with-
  Google-Search doc never mentions location biasing. Treated as
  unsupported here — Gemini calls never pass a location, regardless of
  how much the brand's own location is confirmed.
- Pricing: free tier 500 requests/day (shared with Flash-Lite's RPD
  quota); paid tier 1,500 RPD free, then $35 per 1,000 grounded
  prompts.
- Rate limits: no grounding-specific limit beyond the RPD figures
  above, which double as the free daily allowance.
- One restriction found (Vertex AI docs, not confirmed Gemini-API-
  specific): search grounding reportedly can't be combined with
  non-search function-calling tools in the same request — not a
  concern here since no other tool is used alongside it.

## Perplexity

Already always grounded — every Perplexity answer already cites real
web sources (`lib/llm/perplexity-impl.ts`'s existing `citations`/
`search_results` parsing). No change for this build; there is no
"turn search off" toggle to offer, since the model is inherently
search-backed regardless.

## Cost impact estimate (before vs after Part G)

Assumptions: growth tier (4 engines — chatgpt, claude, gemini,
perplexity), 10 organic questions, `RUNS_PER_PROMPT=1` (Part F.1), all
four engines web-search-enabled (the Part G default). Branded extras
are excluded here to keep the before/after comparison pinned to a
fixed base — in a real audit they add a variable ~4–8 more prompts on
top. **These are modeled estimates from each provider's published
pricing, not measured production spend** — actual spend is read from
`audit_cost_snapshots.actual_cost_cents`, never from this table.

| | Before (memory-only, pre-Part G) | After (web-grounded, Part G default ON) |
|---|---|---|
| Per-audit calls | 10 prompts × 4 engines × 1 run = 40 calls | same 40 calls; each one now also carries a provider-side search |
| ChatGPT (10 calls) | ~$0.015/call canon rate → $0.15 | + $0.01/call search fee, + a fixed 8,000-input-token block per call billed at gpt-4.1-mini's own input rate |
| Claude (10 calls) | ~$0.015/call canon rate → $0.15 | + $0.01/call search fee, + input tokens for the fetched result content |
| Gemini (10 calls) | ~$0.015/call canon rate → $0.15 | $0 while inside the 500 RPD free tier; $35/1,000 grounded prompts if it spills into the paid tier |
| Perplexity (10 calls) | already grounded — unchanged | unchanged |
| **Audit total, canon-rate basis** | 40 × $0.015 = **$0.60 USD** (≈92 AUD cents, growth tier — matches the existing `BudgetPolicyService` test) | canon-rate total is unchanged at **$0.60 USD / 92 AUD cents**; add ~$0.03 USD (3 engines × $0.01 search fee) plus each engine's own extra input-token cost for the fetched search content |

### `estimate()` gap — flagged, not fixed in this build

`BudgetPolicyService.estimate()` still prices every call at the flat
$0.015 Phase 2 canon rate — it does not yet add the $10/1,000-search
fee or the extra input-token cost that grounding introduces (per the
per-provider sections above). So the pre-flight estimate stored on
`audits.estimatedCostCents`, and checked by `enforce()`, will run a
little low on a grounded audit. `BudgetPolicyService.record()` (the
*actual* cost, from what the provider call really reports) is
unaffected by this gap. Part G.8's `checkDailySpend()` guard (see
`lib/platform/budget-policy.service.ts`) reads only actual recorded
spend (`auditCostSnapshots.actualCostCents`), not the estimate, so it
still catches real overspend even though the pre-flight estimate
itself doesn't yet model the search premium. Making `estimate()`
grounding-aware is follow-up work, not done in this build.

## Cross-provider implementation note

All three new providers expose the same AI SDK-normalized
`result.sources: Array<{ type: "source", sourceType: "url", id, url,
title? }>` field (confirmed by reading `@ai-sdk/provider@3.0.10`'s
shared `LanguageModelV3Source` type, which is what all three installed
provider packages decode into) — one shared helper extracts
`citedUrls` from it identically across chatgpt/claude/gemini, the same
shape `CompleteOutput.citedUrls` already uses for Perplexity.
