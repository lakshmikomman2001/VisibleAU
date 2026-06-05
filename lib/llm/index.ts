import { AnthropicImpl } from "./anthropic-impl";
import { GoogleImpl } from "./google-impl";
import type { Engine, LLMService, MockScenario } from "./interface";
import { MockLLM } from "./mock-impl";
import { OpenAIImpl } from "./openai-impl";
import { PerplexityImpl } from "./perplexity-impl";

const implCache: Partial<Record<Engine, LLMService>> = {};

function getRealImpl(engine: Engine): LLMService {
  if (!implCache[engine]) {
    switch (engine) {
      case "chatgpt":
        implCache[engine] = new OpenAIImpl();
        break;
      case "claude":
        implCache[engine] = new AnthropicImpl();
        break;
      case "gemini":
        implCache[engine] = new GoogleImpl();
        break;
      case "perplexity":
        implCache[engine] = new PerplexityImpl();
        break;
    }
  }
  return implCache[engine]!;
}

export function getLLMService(engine?: Engine): LLMService {
  if (process.env.LLM_MODE === "mock" || process.env.NODE_ENV === "test") {
    return new MockLLM((process.env.MOCK_SCENARIO as MockScenario | undefined) ?? "happy_path");
  }
  return getRealImpl(engine ?? "chatgpt");
}

export type {
  CompleteInput,
  CompleteOutput,
  Engine,
  LLMService,
  MockScenario,
  ModelTask,
} from "./interface";
