import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLLMService } from "@/lib/llm";

describe("getLLMService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns MockLLM when LLM_MODE=mock", () => {
    vi.stubEnv("LLM_MODE", "mock");
    const service = getLLMService();
    expect(service).toBeDefined();
    expect(service.complete).toBeTypeOf("function");
  });

  it("returns MockLLM in test environment", () => {
    vi.stubEnv("NODE_ENV", "test");
    const service = getLLMService();
    expect(service).toBeDefined();
  });

  it("returns a fresh MockLLM instance each call (not cached)", () => {
    vi.stubEnv("LLM_MODE", "mock");
    const s1 = getLLMService();
    const s2 = getLLMService();
    expect(s1).not.toBe(s2);
  });
});
