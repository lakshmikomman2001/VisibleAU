import fs from "node:fs";
import path from "node:path";
import type { CompleteInput, CompleteOutput, Engine, LLMService, MockScenario } from "./interface";

interface FixtureEntry {
  prompt_pattern: string;
  response: string;
  tokens_used: number;
  cost_estimate_usd: number;
  error_status?: number;
  delay_ms?: number;
}

/**
 * 2 Nov: the mock answers from test fixtures and test-only failure
 * scenarios -- never a real engine's answer. lib/llm/index.ts picks it for
 * LLM_MODE=mock or the test runner, and nothing stopped a deployment with
 * LLM_MODE=mock set by mistake from showing fixtures as audit results. It
 * refuses to run in production (NODE_ENV, or Vercel's VERCEL_ENV); local
 * `next dev`, CI and vitest aren't production.
 */
export class MockInProductionError extends Error {
  constructor() {
    super(
      "The mock LLM (LLM_MODE=mock) refuses to run in production: it answers from test fixtures, never a real engine. Set LLM_MODE=real, or remove it, in this deployment's environment.",
    );
    this.name = "MockInProductionError";
  }
}

export function assertMockAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new MockInProductionError();
  }
}

export class MockLLM implements LLMService {
  private fixtures: Map<Engine, Map<MockScenario, FixtureEntry[]>> = new Map();
  private callCount = 0;

  constructor(private scenario: MockScenario = "happy_path") {
    assertMockAllowed();
  }

  private loadFixtures(engine: Engine, scenario: MockScenario): FixtureEntry[] {
    if (!this.fixtures.has(engine)) this.fixtures.set(engine, new Map());
    const cache = this.fixtures.get(engine)!;
    if (!cache.has(scenario)) {
      const fp = path.join(process.cwd(), "lib/llm/mock-responses", engine, `${scenario}.json`);
      cache.set(scenario, JSON.parse(fs.readFileSync(fp, "utf-8")));
    }
    return cache.get(scenario)!;
  }

  async complete(input: CompleteInput): Promise<CompleteOutput> {
    this.callCount++;
    const scenario = input.metadata?.mockScenario ?? this.scenario;
    // Engine-failure follow-ups (1 Nov), item 2: an engine that's down --
    // every call fails with a 500, its one retry included (partial_failure
    // fails only some calls on one instance, so a retry could pass).
    if (scenario === "engine_down") throw new Error("Mock error 500");
    // Out-of-quota follow-up (1 Nov): an OpenAI account out of quota --
    // every ChatGPT call fails as OpenAI's 429 insufficient_quota arrives
    // from the AI SDK (an APICallError: statusCode, and the parsed body as
    // data); the other engines answer as usual.
    if (scenario === "openai_out_of_quota" && input.engine === "chatgpt") {
      const message =
        "You exceeded your current quota, please check your plan and billing details.";
      throw Object.assign(new Error(message), {
        name: "AI_APICallError",
        statusCode: 429,
        data: {
          error: { message, type: "insufficient_quota", param: null, code: "insufficient_quota" },
        },
      });
    }
    const fixtures = this.loadFixtures(
      input.engine,
      scenario === "openai_out_of_quota" ? "happy_path" : scenario,
    );
    // Rate limited: throw on first call only, then use non-error fixtures
    if (scenario === "rate_limited" && this.callCount === 1) {
      const errorFixture = fixtures.find((f) => f.error_status);
      if (errorFixture) {
        if (errorFixture.delay_ms) await new Promise((r) => setTimeout(r, errorFixture.delay_ms));
        throw new Error(`Mock rate limit ${errorFixture.error_status}`);
      }
    }

    // Partial failure: throw on ~40% of calls
    if (scenario === "partial_failure" && this.callCount % 5 < 2) {
      const errorFixture = fixtures.find((f) => f.error_status);
      if (errorFixture) throw new Error(`Mock error ${errorFixture.error_status}`);
    }

    // For non-error path, prefer fixtures without error_status
    const successFixtures = fixtures.filter((f) => !f.error_status);
    const allFixtures = successFixtures.length > 0 ? successFixtures : fixtures;
    const match =
      allFixtures.find(
        (f) =>
          f.prompt_pattern && input.prompt.toLowerCase().includes(f.prompt_pattern.toLowerCase()),
      ) ?? allFixtures[0];

    if (match.delay_ms) await new Promise((r) => setTimeout(r, match.delay_ms));
    return {
      response: match.response,
      model: "gpt-4o-mini-mock",
      tokensUsed: match.tokens_used,
      costEstimateUsd: match.cost_estimate_usd,
      isCacheHit: false,
    };
  }
}
