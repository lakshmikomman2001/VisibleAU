import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObservabilityService } from "@/lib/platform/observability.service";
import type { ObservabilityEvent, ObservabilityEventName } from "@/lib/platform/types";

describe("ObservabilityService", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("emits events to console with event name and JSON data", () => {
    ObservabilityService.emit({
      name: "audit_budget_estimated",
      data: { organizationId: "org-1", estimatedCostCents: 200 },
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const [prefix, jsonStr] = consoleSpy.mock.calls[0];
    expect(prefix).toContain("[observability]");
    expect(prefix).toContain("audit_budget_estimated");
    expect(jsonStr).toContain("org-1");
  });

  it("includes timestamp in emitted data", () => {
    const ts = new Date("2026-01-01T00:00:00Z");
    ObservabilityService.emit({
      name: "config_bundle_loaded",
      data: { market: "AU_EN" },
      timestamp: ts,
    });

    const [, jsonStr] = consoleSpy.mock.calls[0];
    expect(jsonStr).toContain("2026-01-01T00:00:00.000Z");
  });

  it("supports all LLD-specified event names", () => {
    const requiredEvents: ObservabilityEventName[] = [
      "market_context_resolved",
      "config_bundle_loaded",
      "config_fallback_used",
      "prompt_pack_coverage_failed",
      "provider_market_disabled",
      "audit_budget_estimated",
      "audit_budget_exceeded",
      "score_quality_gate_failed",
      "report_confidence_downgraded",
      "frontend_market_changed",
      "fan_out_simulated",
      "agent_readiness_scored",
      "mcp_check_completed",
      "topical_gap_calculated",
      "citation_source_classified",
      "linkedin_presence_audited",
      "consensus_score_calculated",
    ];

    for (const eventName of requiredEvents) {
      const event: ObservabilityEvent = { name: eventName, data: {} };
      expect(() => ObservabilityService.emit(event)).not.toThrow();
    }
    expect(consoleSpy).toHaveBeenCalledTimes(requiredEvents.length);
  });
});
