import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/schema", () => ({
  brandEntityScores: {
    brandId: "brand_id",
    id: "id",
  },
}));

function createMockTx(existingRow: Record<string, unknown> | null) {
  const writtenUpdates: Record<string, unknown>[] = [];

  const chainable = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () =>
      existingRow ? Promise.resolve([existingRow]) : Promise.resolve([]);
    chain.set = (vals: Record<string, unknown>) => {
      writtenUpdates.push(vals);
      return chain;
    };
    return chain;
  };

  return {
    select: chainable,
    update: () => chainable(),
    writtenUpdates,
  };
}

describe("entity-checker — refreshEntityScore (mock mode)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LLM_MODE = "mock";
  });

  it("returns expected EntityCheckResult for brand with no existing ABN", async () => {
    const { refreshEntityScore } = await import("@/lib/trust/entity-checker");

    const tx = createMockTx({ id: "row-1", abnVerified: false, abnNumber: null });
    const result = await refreshEntityScore(tx as any, "brand-1", "org-1", "AU_EN");

    expect(result.knowledgePanelPresent).toBe(false);
    expect(result.knowledgePanelAccurate).toBeNull();
    expect(result.knowledgePanelUrl).toBeNull();
    expect(result.wikidataEntryPresent).toBe(false);
    expect(result.wikidataEntryUrl).toBeNull();
    expect(result.localRegVerified).toBe(false);
    expect(result.localRegNumber).toBeNull();
    expect(result.directoryUpdates).toEqual({
      hipagesPresent: false,
      hipagesRating: null,
      yellowPagesPresent: false,
      serviceSeekingPresent: false,
      wordOfMouthPresent: false,
      wordOfMouthRating: null,
      localDirectoryCount: 0,
    });
  });

  it("returns localRegVerified=true when ABN exists and is verified", async () => {
    const { refreshEntityScore } = await import("@/lib/trust/entity-checker");

    const tx = createMockTx({
      id: "row-2",
      abnVerified: false,
      abnNumber: "12345678901",
    });
    const result = await refreshEntityScore(tx as any, "brand-2", "org-2", "AU_EN");

    expect(result.localRegVerified).toBe(true);
    expect(result.localRegNumber).toBe("12345678901");
  });

  it("skips registry check when ABN already verified", async () => {
    const { refreshEntityScore } = await import("@/lib/trust/entity-checker");

    const tx = createMockTx({
      id: "row-3",
      abnVerified: true,
      abnNumber: "99999999999",
    });
    const result = await refreshEntityScore(tx as any, "brand-3", "org-3", "AU_EN");

    expect(result.localRegVerified).toBe(true);
    expect(result.localRegNumber).toBe("99999999999");
  });

  it("writes updates to DB when existing row found", async () => {
    const { refreshEntityScore } = await import("@/lib/trust/entity-checker");

    const tx = createMockTx({ id: "row-4", abnVerified: false, abnNumber: null });
    await refreshEntityScore(tx as any, "brand-4", "org-4", "AU_EN");

    expect(tx.writtenUpdates.length).toBe(1);
    const written = tx.writtenUpdates[0];
    expect(written).toHaveProperty("organizationId", "org-4");
    expect(written).toHaveProperty("marketCode", "AU_EN");
    expect(written).toHaveProperty("knowledgePanelPresent", false);
    expect(written).toHaveProperty("wikidataEntryPresent", false);
  });
});
