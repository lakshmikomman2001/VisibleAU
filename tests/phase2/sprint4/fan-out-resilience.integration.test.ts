import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, seedOrganization, seedBrand, seedVerticalPack, seedPrompt, truncateAll, queryFanOutResults, audits } from "./helpers/test-db";
import { fanOutEngineLoop } from "@/lib/visibility/fan-out-engine-loop";

vi.mock("@/lib/llm", () => {
  const subQueryResponse = "plumber near me\nemergency plumber Melbourne\nbest local plumber";
  const mentionResponse = "TestBrand is a highly rated plumber serving Melbourne.";
  return {
    getLLMService: (engine: string) => {
      if (engine === "gemini") {
        // Throw at getLLMService() level — this is outside the inner generateSubQueries
        // try/catch, so it triggers the OUTER per-engine catch → failedEngines
        throw new Error("429 Too Many Requests");
      }
      return {
        complete: async (input: { prompt: string }) => ({
          response: input.prompt.includes("Generate exactly") ? subQueryResponse : mentionResponse,
          costEstimateUsd: 0.001,
          tokensUsed: 50,
          model: "mock-model",
        }),
      };
    },
    getRealImpl: (engine: string) => {
      if (engine === "gemini") {
        throw new Error("429 Too Many Requests");
      }
      return {
        complete: async (input: { prompt: string }) => ({
          response: input.prompt.includes("Generate exactly") ? subQueryResponse : mentionResponse,
          costEstimateUsd: 0.001,
          tokensUsed: 50,
          model: "mock-model",
        }),
      };
    },
  };
});

describe("fan-out-resilience integration (REAL DB + fanOutEngineLoop — bug 5a: 429 graceful-skip)", () => {
  let org: { id: string };
  let brand: { id: string };
  let auditId: string;
  let promptId: string;
  let promptId2: string;

  beforeAll(async () => {
    await truncateAll();

    org = await seedOrganization({
      clerkOrgId: "org_fanout_resilience",
      name: "Fan-out Resilience Org",
    });

    brand = await seedBrand({
      organizationId: org.id,
      name: "TestBrand",
      domain: "testbrand.com.au",
    });

    const pack = await seedVerticalPack();
    const p1 = await seedPrompt(pack.id, "best plumber in {location}");
    const p2 = await seedPrompt(pack.id, "top rated electrician {location}");
    promptId = p1.id;
    promptId2 = p2.id;
  });

  beforeEach(async () => {
    // Clean fan-out results between tests
    await testDb.delete(queryFanOutResults).where(eq(queryFanOutResults.organizationId, org.id));
    await testDb.delete(audits).where(eq(audits.organizationId, org.id));

    // Seed an audit for FK reference
    const [audit] = await testDb
      .insert(audits)
      .values({
        brandId: brand.id,
        organizationId: org.id,
        status: "running",
        auditNumber: 1,
      })
      .returning();
    auditId = audit.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("surviving engines write rows when one engine throws 429", async () => {
    const result = await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt", "gemini", "perplexity"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    // gemini threw → only chatgpt + perplexity succeeded
    expect(result.failedEngines).toContain("gemini");
    expect(result.failedEngines).not.toContain("chatgpt");
    expect(result.failedEngines).not.toContain("perplexity");
    expect(result.inserted).toBeGreaterThan(0);
  });

  it("rows from surviving engines are actually persisted in DB", async () => {
    await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt", "gemini", "perplexity"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    const rows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.auditId, auditId));

    const engines = [...new Set(rows.map((r) => r.engine))];
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("perplexity");
    expect(engines).not.toContain("gemini");
  });

  it("gemini (429-throwing engine) writes ZERO rows", async () => {
    await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt", "gemini"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    const geminiRows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.engine, "gemini"));

    expect(geminiRows).toHaveLength(0);
  });

  it("does NOT throw to caller — returns gracefully with failedEngines list", async () => {
    // If all engines fail, it still returns (doesn't throw)
    const result = await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["gemini"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    expect(result.inserted).toBe(0);
    expect(result.failedEngines).toEqual(["gemini"]);
  });

  it("multiple prompts: failure on one prompt/engine combo doesn't stop others", async () => {
    const result = await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt", "gemini"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [
        { id: promptId, promptTemplate: "best plumber in {location}" },
        { id: promptId2, promptTemplate: "top rated electrician {location}" },
      ],
      location: "Melbourne",
    });

    // chatgpt should succeed for BOTH prompts, gemini fails for both
    expect(result.inserted).toBeGreaterThan(0);
    expect(result.failedEngines).toContain("gemini");

    const rows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.auditId, auditId));

    const chatgptRows = rows.filter((r) => r.engine === "chatgpt");
    expect(chatgptRows.length).toBeGreaterThan(0);
  });

  it("inserted count matches actual DB row count for surviving engines", async () => {
    const result = await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt", "perplexity"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    const rows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.auditId, auditId));

    expect(rows.length).toBe(result.inserted);
  });

  it("rows written have correct brandId and organizationId", async () => {
    await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    const rows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.auditId, auditId));

    for (const row of rows) {
      expect(row.brandId).toBe(brand.id);
      expect(row.organizationId).toBe(org.id);
      expect(row.auditId).toBe(auditId);
    }
  });

  it("subQueryRank is sequential and 1-indexed in persisted rows", async () => {
    await fanOutEngineLoop(testDb as any, {
      auditId,
      brandId: brand.id,
      organizationId: org.id,
      engines: ["chatgpt"],
      tier: "starter",
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      prompts: [{ id: promptId, promptTemplate: "best plumber in {location}" }],
      location: "Melbourne",
    });

    const rows = await testDb
      .select()
      .from(queryFanOutResults)
      .where(eq(queryFanOutResults.auditId, auditId));

    if (rows.length > 0) {
      const ranks = rows.map((r) => r.subQueryRank).sort((a, b) => a - b);
      expect(ranks[0]).toBe(1);
      for (let i = 1; i < ranks.length; i++) {
        expect(ranks[i]).toBe(i + 1);
      }
    }
  });
});
