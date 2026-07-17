import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();

vi.mock("@/db/client", () => ({
  serviceDb: {
    select: () => ({ from: (table: unknown) => ({ where: mockWhere }) }),
  },
}));

vi.mock("@/db/schema/ai-bot-registry", () => ({
  aiBotRegistry: { isActive: "is_active" },
}));

import {
  lookupByUserAgent,
  clearRegistryCache,
  type RegistryMatch,
} from "@/lib/agent-analytics/bot-registry";

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    uaToken: "GPTBot",
    matchMode: "substring",
    vendor: "openai",
    crawlerTier: "must_allow",
    defaultPurpose: "indexing",
    isAgentUa: false,
    aiPlatform: "openai",
    verificationPaths: ["cidr", "fcrdns"],
    cidrSourceUrl: "https://openai.com/gptbot-ranges.json",
    ptrDomainSuffix: ".openai.com",
    expectedAsns: [394161],
    respectsRobots: true,
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  clearRegistryCache();
  vi.clearAllMocks();
});

// ── Group B: Registry Lookup ──

describe("B1: substring match mode", () => {
  it("matches GPTBot substring inside a full UA string", async () => {
    mockWhere.mockResolvedValue([fakeRow()]);

    const result = await lookupByUserAgent(
      "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)",
    );

    expect(result).not.toBeNull();
    expect(result!.uaToken).toBe("GPTBot");
    expect(result!.vendor).toBe("openai");
  });
});

describe("B2: exact match mode", () => {
  it("only matches when UA is identical to uaToken", async () => {
    mockWhere.mockResolvedValue([
      fakeRow({ uaToken: "Claude-User", matchMode: "exact", vendor: "anthropic" }),
    ]);

    const exactHit = await lookupByUserAgent("Claude-User");
    expect(exactHit).not.toBeNull();
    expect(exactHit!.uaToken).toBe("Claude-User");

    clearRegistryCache();
    mockWhere.mockResolvedValue([
      fakeRow({ uaToken: "Claude-User", matchMode: "exact", vendor: "anthropic" }),
    ]);

    const partialMiss = await lookupByUserAgent(
      "Mozilla/5.0 Claude-User/1.0",
    );
    expect(partialMiss).toBeNull();
  });
});

describe("B3: NULL cidrSourceUrl → FCrDNS-primary path", () => {
  it("returns null cidrSourceUrl but non-empty ptrDomainSuffix for Anthropic bots", async () => {
    mockWhere.mockResolvedValue([
      fakeRow({
        uaToken: "ClaudeBot",
        vendor: "anthropic",
        cidrSourceUrl: null,
        ptrDomainSuffix: ".anthropic.com",
        verificationPaths: ["fcrdns", "asn"],
      }),
    ]);

    const result = await lookupByUserAgent("ClaudeBot/1.0");

    expect(result).not.toBeNull();
    expect(result!.cidrSourceUrl).toBeNull();
    expect(result!.ptrDomainSuffix).toBe(".anthropic.com");
    expect(result!.verificationPaths).toContain("fcrdns");
    expect(result!.verificationPaths).not.toContain("cidr");
  });
});

describe("B4: registry emits canon enum values", () => {
  it("crawlerTier and defaultPurpose match allowed enums", async () => {
    const validTiers = ["must_allow", "emerging", "data"];
    const validPurposes = ["retrieval", "indexing", "training", null];

    mockWhere.mockResolvedValue([
      fakeRow({ crawlerTier: "must_allow", defaultPurpose: "indexing" }),
      fakeRow({
        id: "row-2",
        uaToken: "ChatGPT-User",
        crawlerTier: "must_allow",
        defaultPurpose: "retrieval",
        isAgentUa: true,
      }),
      fakeRow({
        id: "row-3",
        uaToken: "Bytespider",
        crawlerTier: "data",
        defaultPurpose: "training",
      }),
    ]);

    for (const ua of ["GPTBot/1.0", "ChatGPT-User", "Bytespider/1.0"]) {
      clearRegistryCache();
      mockWhere.mockResolvedValue([
        ua.includes("GPTBot")
          ? fakeRow()
          : ua.includes("ChatGPT")
            ? fakeRow({
                id: "row-2",
                uaToken: "ChatGPT-User",
                crawlerTier: "must_allow",
                defaultPurpose: "retrieval",
                isAgentUa: true,
              })
            : fakeRow({
                id: "row-3",
                uaToken: "Bytespider",
                crawlerTier: "data",
                defaultPurpose: "training",
              }),
      ]);

      const result = await lookupByUserAgent(ua);
      expect(result).not.toBeNull();
      expect(validTiers).toContain(result!.crawlerTier);
      expect(validPurposes).toContain(result!.defaultPurpose);
    }
  });
});
