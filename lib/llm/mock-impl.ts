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

export class MockLLM implements LLMService {
  private fixtures: Map<Engine, Map<MockScenario, FixtureEntry[]>> = new Map();
  private callCount = 0;

  constructor(private scenario: MockScenario = "happy_path") {}

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
    const fixtures = this.loadFixtures(input.engine, scenario);
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
    };
  }
}
