import { describe, expect, it } from "vitest";
import type {
  AuditParams,
  CostEstimate,
  EnforcementResult,
  ObservabilityEvent,
  ObservabilityEventName,
  QualityLabel,
  QualityLabelValue,
  ValidationResult,
} from "@/lib/platform/types";

describe("Platform types", () => {
  it("AuditParams has required fields", () => {
    const params: AuditParams = {
      brandId: "b1",
      organizationId: "o1",
      promptCount: 10,
      engineCount: 4,
    };
    expect(params.brandId).toBe("b1");
    expect(params.organizationId).toBe("o1");
    expect(params.promptCount).toBe(10);
    expect(params.engineCount).toBe(4);
  });

  it("CostEstimate has required fields", () => {
    const est: CostEstimate = {
      estimatedCostCents: 200,
      maxAllowedCents: 500,
      withinBudget: true,
      policyId: "p1",
    };
    expect(est.withinBudget).toBe(true);
  });

  it("EnforcementResult reason is one of the allowed values", () => {
    const allowed: EnforcementResult["reason"][] = [
      "budget_exceeded",
      "policy_disabled",
      "ok",
      undefined,
    ];
    const result: EnforcementResult = { allowed: false, reason: "budget_exceeded" };
    expect(allowed).toContain(result.reason);
  });

  it("QualityLabelValue covers all four levels", () => {
    const labels: QualityLabelValue[] = [
      "Confirmed",
      "Likely",
      "Hypothesis",
      "Insufficient data",
    ];
    expect(labels).toHaveLength(4);
  });

  it("QualityLabel wraps a label value", () => {
    const ql: QualityLabel = { label: "Confirmed" };
    expect(ql.label).toBe("Confirmed");
  });

  it("ValidationResult has valid boolean and optional reason", () => {
    const valid: ValidationResult = { valid: true };
    const invalid: ValidationResult = { valid: false, reason: "Below threshold" };
    expect(valid.valid).toBe(true);
    expect(invalid.reason).toBeDefined();
  });

  it("ObservabilityEventName is a union of 17 event types", () => {
    const events: ObservabilityEventName[] = [
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
    expect(events).toHaveLength(17);
  });

  it("ObservabilityEvent has name and data", () => {
    const evt: ObservabilityEvent = {
      name: "audit_budget_estimated",
      data: { cost: 100 },
    };
    expect(evt.name).toBe("audit_budget_estimated");
    expect(evt.data).toHaveProperty("cost");
  });
});
