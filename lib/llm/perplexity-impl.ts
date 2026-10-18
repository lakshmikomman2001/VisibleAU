import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";

/**
 * Task #43: Perplexity's real cited sources were being discarded.
 * generateText() via @ai-sdk/openai's generic OpenAI-compatible client
 * only surfaces OpenAI-shaped fields (choices[].message.content, usage)
 * -- Perplexity's `citations` (plain URL array) and `search_results`
 * ({url, title, date}[]) are non-standard top-level fields the OpenAI
 * schema doesn't define, so they were never read.
 *
 * The official @ai-sdk/perplexity provider was evaluated first (per
 * Part A's instruction to prefer it when compatible) and found
 * INCOMPATIBLE with this project's installed AI SDK generation: every
 * published version (checked 1.x through 5.0.10) depends on
 * @ai-sdk/provider 1.x or 4.x+ / @ai-sdk/provider-utils 2.x or 5.x+,
 * while the installed `ai@6.0.195` core (and @ai-sdk/openai@3.0.67,
 * already used by the other three engines) requires
 * @ai-sdk/provider@3.x / @ai-sdk/provider-utils@4.x -- no released
 * version targets that generation. Installing it would mean a provider
 * implementing a different LanguageModel interface version than what
 * `ai@6.0.195`'s generateText() expects, a real type/runtime mismatch,
 * not a style preference. Falls back to a direct fetch() to Perplexity's
 * chat/completions endpoint instead, parsing citations/search_results
 * directly from the JSON body.
 *
 * See docs/ops/post-launch-db-hardening.md section 43.
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const FETCH_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2; // matches generateText()'s own default (parity)

interface PerplexityApiResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  citations?: string[];
  search_results?: Array<{ url?: string }>;
}

async function callPerplexityApi(prompt: string, modelId: string): Promise<PerplexityApiResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(PERPLEXITY_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Perplexity API ${res.status}: ${body.slice(0, 500)}`);
      }

      return (await res.json()) as PerplexityApiResponse;
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Perplexity's `citations` is a plain URL array; `search_results`
 * (newer API versions) carries {url, title, date} objects alongside it
 * -- merge and de-duplicate both into one list, preserving order
 * (citations first, since it's the longer-standing/more complete field). */
function mergeStructuredUrls(data: PerplexityApiResponse): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of data.citations ?? []) {
    if (typeof url === "string" && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  for (const r of data.search_results ?? []) {
    if (typeof r.url === "string" && !seen.has(r.url)) {
      seen.add(r.url);
      urls.push(r.url);
    }
  }
  return urls;
}

export class PerplexityImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "sonar-pro";

    // Vunnara Build 1, Part G.4: Perplexity has no on/off toggle --
    // it's always grounded (see docs/ops/web-search-engines.md), so
    // the cache key always reflects that explicitly rather than an
    // implicit "memory_only" that would be wrong for this engine.
    if (!input.metadata?.bypassCache) {
      const hit = await getCached(input.prompt, modelId, input.engine, "grounded");
      if (hit) return hit;
    }

    const data = await callPerplexityApi(input.prompt, modelId);

    const text = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? inputTokens + outputTokens;

    const output: CompleteOutput = {
      response: text,
      model: data.model ?? modelId,
      tokensUsed: totalTokens || 0,
      costEstimateUsd: computeCostUsd(modelId, inputTokens, outputTokens),
      citedUrls: mergeStructuredUrls(data),
      isCacheHit: false,
    };

    if (!input.metadata?.bypassCache) {
      await setCached(input.prompt, modelId, output, "grounded").catch(() => {});
    }

    return output;
  }
}
