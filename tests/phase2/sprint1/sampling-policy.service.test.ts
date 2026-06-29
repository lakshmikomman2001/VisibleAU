import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWhere = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockWhere,
      }),
    }),
  },
}));

vi.mock("@/db/schema/metric-quality-gates", () => ({
  metricQualityGates: { metricKey: "metric_key", marketCode: "market_code" },
}));

vi.mock("@/db/schema/sampling-policies", () => ({
  samplingPolicies: { marketCode: "market_code", segment: "segment", useCase: "use_case" },
}));

import { SamplingPolicyService } from "@/lib/platform/sampling-policy.service";

describe("SamplingPolicyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getQualityLabel", () => {
    it("returns 'Insufficient data' below minimum_samples", async () => {
      mockWhere.mockResolvedValueOnce([{ minimumSamples: 10, minimumProviderCount: 2 }]);
      const result = await SamplingPolicyService.getQualityLabel("frequency", 3);
      expect(result.label).toBe("Insufficient data");
    });

    it("returns 'Hypothesis' at exactly minimum_samples", async () => {
      mockWhere.mockResolvedValueOnce([{ minimumSamples: 10, minimumProviderCount: 2 }]);
      const result = await SamplingPolicyService.getQualityLabel("frequency", 10);
      expect(result.label).toBe("Hypothesis");
    });

    it("returns 'Likely' at 2x minimum_samples", async () => {
      mockWhere.mockResolvedValueOnce([{ minimumSamples: 10, minimumProviderCount: 2 }]);
      const result = await SamplingPolicyService.getQualityLabel("frequency", 20);
      expect(result.label).toBe("Likely");
    });

    it("returns 'Confirmed' at 3x+ minimum_samples", async () => {
      mockWhere.mockResolvedValueOnce([{ minimumSamples: 10, minimumProviderCount: 2 }]);
      const result = await SamplingPolicyService.getQualityLabel("frequency", 30);
      expect(result.label).toBe("Confirmed");
    });

    it("returns 'Insufficient data' when no gate exists", async () => {
      mockWhere.mockResolvedValueOnce([]);
      const result = await SamplingPolicyService.getQualityLabel("unknown_metric", 100);
      expect(result.label).toBe("Insufficient data");
    });
  });

  describe("validate", () => {
    it("validates sample count against minimum", async () => {
      const policy = {
        id: "p1",
        marketCode: "AU_EN",
        segment: "smb",
        useCase: "brand_audit",
        minimumPromptCount: 10,
        recommendedPromptCount: 50,
        minimumRepeatedSamples: 3,
        confidenceDisplayThreshold: "0.60",
        createdAt: new Date(),
      };

      const invalid = await SamplingPolicyService.validate(5, policy);
      expect(invalid.valid).toBe(false);
      expect(invalid.reason).toContain("below minimum");

      const valid = await SamplingPolicyService.validate(15, policy);
      expect(valid.valid).toBe(true);
      expect(valid.reason).toBeUndefined();
    });

    it("passes at exactly the minimum", async () => {
      const policy = {
        id: "p1",
        marketCode: "AU_EN",
        segment: "smb",
        useCase: "brand_audit",
        minimumPromptCount: 10,
        recommendedPromptCount: 50,
        minimumRepeatedSamples: 3,
        confidenceDisplayThreshold: "0.60",
        createdAt: new Date(),
      };

      const result = await SamplingPolicyService.validate(10, policy);
      expect(result.valid).toBe(true);
    });
  });

  describe("getPolicy", () => {
    it("returns a policy when found", async () => {
      const policy = { id: "p1", marketCode: "AU_EN", segment: "smb", useCase: "brand_audit" };
      mockWhere.mockResolvedValueOnce([policy]);
      const result = await SamplingPolicyService.getPolicy("AU_EN", "smb", "brand_audit");
      expect(result).toEqual(policy);
    });

    it("returns undefined when no policy found", async () => {
      mockWhere.mockResolvedValueOnce([]);
      const result = await SamplingPolicyService.getPolicy("XX_XX", "unknown", "unknown");
      expect(result).toBeUndefined();
    });
  });
});
