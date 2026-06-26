import type { InferSelectModel } from "drizzle-orm";
import type { configBundleCache } from "@/db/schema/config-bundle-cache";
import type { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import type { providerMarketCapabilities } from "@/db/schema/provider-market-capabilities";
import type { samplingPolicies } from "@/db/schema/sampling-policies";

export type ConfigBundle = InferSelectModel<typeof configBundleCache>;
export type BudgetPolicy = InferSelectModel<typeof marketAiBudgetPolicies>;
export type Provider = InferSelectModel<typeof providerMarketCapabilities>;
export type SamplingPolicyRow = InferSelectModel<typeof samplingPolicies>;

export interface AuditParams {
  brandId: string;
  organizationId: string;
  promptCount: number;
  engineCount: number;
}

export interface CostEstimate {
  estimatedCostCents: number;
  maxAllowedCents: number;
  withinBudget: boolean;
  policyId: string;
}

export interface EnforcementResult {
  allowed: boolean;
  reason?: "budget_exceeded" | "policy_disabled" | "ok";
}

export type QualityLabelValue =
  | "Confirmed"
  | "Likely"
  | "Hypothesis"
  | "Insufficient data";

export interface QualityLabel {
  label: QualityLabelValue;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export type ObservabilityEventName =
  | "market_context_resolved"
  | "config_bundle_loaded"
  | "config_fallback_used"
  | "prompt_pack_coverage_failed"
  | "provider_market_disabled"
  | "audit_budget_estimated"
  | "audit_budget_exceeded"
  | "score_quality_gate_failed"
  | "report_confidence_downgraded"
  | "frontend_market_changed"
  | "fan_out_simulated"
  | "agent_readiness_scored"
  | "mcp_check_completed"
  | "topical_gap_calculated"
  | "citation_source_classified"
  | "linkedin_presence_audited"
  | "consensus_score_calculated";

export interface ObservabilityEvent {
  name: ObservabilityEventName;
  data: Record<string, unknown>;
  timestamp?: Date;
}
