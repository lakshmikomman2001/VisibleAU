import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-analytics/bot-registry", () => ({
  lookupByUserAgent: vi.fn(),
  clearRegistryCache: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  serviceDb: {},
}));

vi.mock("@/db/schema/ai-bot-registry", () => ({
  aiBotRegistry: { isActive: "is_active" },
}));

import { classifyWithRegistry } from "@/lib/retrieval/visit-classifier";
import { lookupByUserAgent } from "@/lib/agent-analytics/bot-registry";
import type { RegistryMatch } from "@/lib/agent-analytics/bot-registry";

const mockedLookup = lookupByUserAgent as ReturnType<typeof vi.fn>;

const GPTBOT_MATCH: RegistryMatch = {
  uaToken: "GPTBot",
  vendor: "openai",
  crawlerTier: "must_allow",
  defaultPurpose: "indexing",
  isAgentUa: false,
  aiPlatform: "openai",
  verificationPaths: ["cidr", "fcrdns"],
  cidrSourceUrl: "https://openai.com/gptbot-ranges.json",
  ptrDomainSuffix: ".openai.com",
  expectedAsns: [394161],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedLookup.mockResolvedValue(GPTBOT_MATCH);
});

// ── Group D: Verify-before-classify ordering ──

describe("D1: spoofed rows get visitPurpose=null and isActiveAgent=false", () => {
  it("classifyWithRegistry nullifies purpose when verificationStatus is spoofed", async () => {
    const result = await classifyWithRegistry(
      "Mozilla/5.0 (compatible; GPTBot/1.1)",
      5,
      "spoofed",
    );

    expect(result.visitPurpose).toBeNull();
    expect(result.isActiveAgent).toBe(false);
    expect(result.crawlerName).toBe("GPTBot");
    expect(result.crawlerTier).toBe("must_allow");
  });

  it("classifyWithRegistry assigns purpose normally when verified", async () => {
    const result = await classifyWithRegistry(
      "Mozilla/5.0 (compatible; GPTBot/1.1)",
      5,
      "verified",
    );

    expect(result.visitPurpose).not.toBeNull();
    expect(result.visitPurpose).toBe("indexing");
  });

  it("classifyWithRegistry assigns purpose normally when unverified", async () => {
    const result = await classifyWithRegistry(
      "Mozilla/5.0 (compatible; GPTBot/1.1)",
      5,
      "unverified",
    );

    expect(result.visitPurpose).not.toBeNull();
  });

  // KNOWN: parse-crawler-log.ts line 44 uses registryMatch.defaultPurpose directly,
  // NOT classifyVisitPurpose. The session-based classifier is dead code in the upload path.
  // This D1 test validates the classifyWithRegistry guard in the LIVE-query path only.
});
