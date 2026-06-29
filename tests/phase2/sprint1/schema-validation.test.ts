import { describe, expect, it } from "vitest";
import { getTableName, getTableColumns } from "drizzle-orm";
import { configBundleCache } from "@/db/schema/config-bundle-cache";
import { marketAiBudgetPolicies } from "@/db/schema/market-ai-budget-policies";
import { samplingPolicies } from "@/db/schema/sampling-policies";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";
import { promptPackCoverage } from "@/db/schema/prompt-pack-coverage";
import { providerMarketCapabilities } from "@/db/schema/provider-market-capabilities";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";

describe("Sprint 1 schema definitions", () => {
  describe("config_bundle_cache", () => {
    it("has the correct table name", () => {
      expect(getTableName(configBundleCache)).toBe("config_bundle_cache");
    });

    it("has all required columns", () => {
      const cols = getTableColumns(configBundleCache);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("id");
      expect(colNames).toContain("market_code");
      expect(colNames).toContain("locale");
      expect(colNames).toContain("segment");
      expect(colNames).toContain("bundle_version");
      expect(colNames).toContain("config_digest");
      expect(colNames).toContain("resolved_config");
      expect(colNames).toContain("is_active");
      expect(colNames).toContain("created_at");
    });
  });

  describe("market_ai_budget_policies", () => {
    it("has the correct table name", () => {
      expect(getTableName(marketAiBudgetPolicies)).toBe("market_ai_budget_policies");
    });

    it("has all required columns including max_fan_out_sub_queries", () => {
      const cols = getTableColumns(marketAiBudgetPolicies);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("max_prompts_per_audit");
      expect(colNames).toContain("max_models_per_audit");
      expect(colNames).toContain("max_repeated_samples");
      expect(colNames).toContain("max_estimated_cost_cents");
      expect(colNames).toContain("max_fan_out_sub_queries");
      expect(colNames).toContain("hard_stop_on_budget");
    });
  });

  describe("sampling_policies", () => {
    it("has the correct table name", () => {
      expect(getTableName(samplingPolicies)).toBe("sampling_policies");
    });

    it("has minimum_repeated_samples column", () => {
      const cols = getTableColumns(samplingPolicies);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("minimum_repeated_samples");
      expect(colNames).toContain("confidence_display_threshold");
    });
  });

  describe("metric_quality_gates", () => {
    it("has the correct table name", () => {
      expect(getTableName(metricQualityGates)).toBe("metric_quality_gates");
    });

    it("has all required columns", () => {
      const cols = getTableColumns(metricQualityGates);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("metric_key");
      expect(colNames).toContain("market_code");
      expect(colNames).toContain("minimum_samples");
      expect(colNames).toContain("minimum_provider_count");
      expect(colNames).toContain("insufficient_data_label");
    });
  });

  describe("prompt_pack_coverage", () => {
    it("has the correct table name", () => {
      expect(getTableName(promptPackCoverage)).toBe("prompt_pack_coverage");
    });

    it("has coverage_status and coverage_ratio columns", () => {
      const cols = getTableColumns(promptPackCoverage);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("coverage_ratio");
      expect(colNames).toContain("coverage_status");
      expect(colNames).toContain("required_template_keys");
      expect(colNames).toContain("available_template_keys");
    });
  });

  describe("provider_market_capabilities", () => {
    it("has the correct table name", () => {
      expect(getTableName(providerMarketCapabilities)).toBe("provider_market_capabilities");
    });

    it("has all capability boolean columns", () => {
      const cols = getTableColumns(providerMarketCapabilities);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("supports_web_retrieval");
      expect(colNames).toContain("supports_citations");
      expect(colNames).toContain("supports_location_context");
      expect(colNames).toContain("supports_query_fan_out");
      expect(colNames).toContain("max_fan_out_sub_queries");
      expect(colNames).toContain("is_enabled");
    });
  });

  describe("audit_cost_snapshots", () => {
    it("has the correct table name", () => {
      expect(getTableName(auditCostSnapshots)).toBe("audit_cost_snapshots");
    });

    it("has organization_id (tenant column — RLS target)", () => {
      const cols = getTableColumns(auditCostSnapshots);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("organization_id");
      expect(colNames).toContain("audit_id");
      expect(colNames).toContain("budget_policy_id");
      expect(colNames).toContain("estimated_cost_cents");
      expect(colNames).toContain("actual_cost_cents");
    });
  });

  describe("RLS posture", () => {
    it("6 config tables have NO organization_id column", () => {
      const configTables = [
        configBundleCache,
        marketAiBudgetPolicies,
        samplingPolicies,
        metricQualityGates,
        promptPackCoverage,
        providerMarketCapabilities,
      ];
      for (const table of configTables) {
        const cols = getTableColumns(table);
        const colNames = Object.values(cols).map((c) => c.name);
        expect(colNames).not.toContain("organization_id");
      }
    });

    it("audit_cost_snapshots HAS organization_id (tenant data — RLS enabled)", () => {
      const cols = getTableColumns(auditCostSnapshots);
      const colNames = Object.values(cols).map((c) => c.name);
      expect(colNames).toContain("organization_id");
    });
  });
});
