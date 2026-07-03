import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  withRlsContext: vi.fn(),
  serviceDb: {},
}));

describe("citation-failure-diagnosis", () => {
  it("returns CitationDiagnosis[] matching the component type shape", { timeout: 15000 }, async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  topicCluster: "emergency_plumbing",
                  topicLabel: "Emergency Plumbing",
                  vertical: "tradies",
                  brandHasContent: false,
                  crossPromptImpact: 3,
                  competitorCoverage: [
                    { domain: "comp.com.au", depth: 80 },
                  ],
                },
              ]),
            }),
          }),
        }),
      }),
      execute: vi.fn().mockResolvedValue([{ exists: false }]),
    };

    const result = await diagnose(mockTx as never, {
      brandId: "brand-1",
    });

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);

    const d = result[0];
    expect(d).toHaveProperty("patternKey");
    expect(d).toHaveProperty("severity");
    expect(d).toHaveProperty("evidence");
    expect(["high", "medium", "low"]).toContain(d.severity);
    expect(d.patternKey).toBe("missing_topic_coverage");
  });

  it("diagnoses from topical gaps alone when S5/S7 tables absent (no error)", async () => {
    const { diagnose } = await import("@/lib/visibility/citation-failure-diagnosis");

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  topicCluster: "test_topic",
                  topicLabel: "Test Topic",
                  vertical: "saas",
                  brandHasContent: false,
                  crossPromptImpact: 2,
                  competitorCoverage: [],
                },
              ]),
            }),
          }),
        }),
      }),
      execute: vi.fn().mockResolvedValue([{ exists: false }]),
    };

    const result = await diagnose(mockTx as never, { brandId: "brand-1" });

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((d) => d.patternKey === "missing_topic_coverage")).toBe(true);
  });
});
