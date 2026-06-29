import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSelectWhere = vi.fn();
const mockUpdateWhere = vi.fn();
const mockDistinct = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockSelectWhere,
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: mockDistinct,
      }),
    }),
    update: () => ({
      set: () => ({
        where: mockUpdateWhere.mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  audits: { id: "id", qualityStatus: "quality_status" },
  citations: { auditId: "audit_id", engine: "engine" },
}));

vi.mock("@/db/schema/metric-quality-gates", () => ({
  metricQualityGates: { metricKey: "metric_key", marketCode: "market_code" },
}));

vi.mock("@/lib/platform/observability.service", () => ({
  ObservabilityService: { emit: vi.fn() },
}));

import { QualityGateService } from "@/lib/platform/quality-gate.service";

describe("QualityGateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions pending → sufficient when sample thresholds met", async () => {
    let callCount = 0;
    mockSelectWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "audit-1", qualityStatus: "pending" }]; // audit
      if (callCount === 2) {
        // quality gates
        return [
          { metricKey: "frequency", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "sentiment", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "accuracy", minimumSamples: 5, minimumProviderCount: 2 },
          { metricKey: "position", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "context", minimumSamples: 10, minimumProviderCount: 2 },
        ];
      }
      return [{ count: 50 }]; // citation count — meets all thresholds
    });

    mockDistinct.mockResolvedValue([
      { engine: "chatgpt" },
      { engine: "claude" },
      { engine: "gemini" },
    ]);

    const status = await QualityGateService.evaluate("audit-1");
    expect(status).toBe("sufficient");
    expect(mockUpdateWhere).toHaveBeenCalled();
  });

  it("transitions pending → insufficient when below all thresholds", async () => {
    let callCount = 0;
    mockSelectWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "audit-1", qualityStatus: "pending" }];
      if (callCount === 2) {
        return [
          { metricKey: "frequency", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "sentiment", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "accuracy", minimumSamples: 5, minimumProviderCount: 2 },
          { metricKey: "position", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "context", minimumSamples: 10, minimumProviderCount: 2 },
        ];
      }
      return [{ count: 2 }]; // too few samples
    });

    mockDistinct.mockResolvedValue([{ engine: "chatgpt" }]); // only 1 provider

    const status = await QualityGateService.evaluate("audit-1");
    expect(status).toBe("insufficient");
  });

  it("transitions pending → partial when some thresholds met", async () => {
    let callCount = 0;
    mockSelectWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "audit-1", qualityStatus: "pending" }];
      if (callCount === 2) {
        return [
          { metricKey: "frequency", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "accuracy", minimumSamples: 5, minimumProviderCount: 2 },
        ];
      }
      return [{ count: 8 }]; // meets accuracy (5) but not frequency (10)
    });

    mockDistinct.mockResolvedValue([
      { engine: "chatgpt" },
      { engine: "claude" },
    ]);

    const status = await QualityGateService.evaluate("audit-1");
    expect(status).toBe("partial");
  });

  it("returns pending when no audit found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const status = await QualityGateService.evaluate("nonexistent");
    expect(status).toBe("pending");
  });

  it("returns pending when no quality gates exist", async () => {
    let callCount = 0;
    mockSelectWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "audit-1", qualityStatus: "pending" }];
      return []; // no gates
    });

    const status = await QualityGateService.evaluate("audit-1");
    expect(status).toBe("pending");
  });

  it("treats metrics without a matching gate as sufficient", async () => {
    let callCount = 0;
    mockSelectWhere.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [{ id: "audit-1", qualityStatus: "pending" }];
      if (callCount === 2) {
        // only 2 gates, not 5 — the other 3 metrics have no gate → counted as sufficient
        return [
          { metricKey: "frequency", minimumSamples: 10, minimumProviderCount: 2 },
          { metricKey: "accuracy", minimumSamples: 5, minimumProviderCount: 2 },
        ];
      }
      return [{ count: 50 }];
    });

    mockDistinct.mockResolvedValue([{ engine: "chatgpt" }, { engine: "claude" }]);

    const status = await QualityGateService.evaluate("audit-1");
    expect(status).toBe("sufficient");
  });
});
