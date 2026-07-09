import { describe, it, expect, vi } from "vitest";
import { computeLocalAiTrustScore } from "@/lib/platform/local-ai-trust-scorer";

describe("computeLocalAiTrustScore", () => {
  it("returns null for vertical='saas' without hitting DB", async () => {
    const tx = { execute: vi.fn() };
    const result = await computeLocalAiTrustScore(tx as any, "brand-1", "saas");
    expect(result.localAiTrustScore).toBeNull();
    expect(result.reason).toContain("not applicable");
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it("returns null when local_seo_results table absent (Sprint 8 forward dep)", async () => {
    const tx = { execute: vi.fn().mockResolvedValue([{ exists: null }]) };
    const result = await computeLocalAiTrustScore(tx as any, "brand-1", "tradies");
    expect(result.localAiTrustScore).toBeNull();
    expect(result.reason).toContain("Sprint 8");
  });

  it("breakdown is all-null for saas", async () => {
    const tx = { execute: vi.fn() };
    const result = await computeLocalAiTrustScore(tx as any, "brand-1", "saas");
    expect(result.breakdown.gmb).toBeNull();
    expect(result.breakdown.directory).toBeNull();
    expect(result.breakdown.abn).toBeNull();
    expect(result.breakdown.nap).toBeNull();
    expect(result.breakdown.citation).toBeNull();
  });
});
