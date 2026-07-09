import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Sprint 6 RLS policies", () => {
  const migration = readFileSync(
    join(__dirname, "../../../db/migrations/0018_phase2_sprint6_retrieval.sql"),
    "utf-8",
  );

  it("has RLS enabled on all 4 tables", () => {
    for (const table of [
      "crawler_visit_logs",
      "content_structure_audits",
      "llmstxt_versions",
      "agent_readiness_scores",
    ]) {
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("all policies check organization_id via current_setting", () => {
    const policyMatches = migration.match(/current_setting\('app\.current_org_id'/g);
    expect(policyMatches).not.toBeNull();
    expect(policyMatches!.length).toBeGreaterThanOrEqual(8);
  });

  it("MI-01: all tables guarded with IF NOT EXISTS", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS crawler_visit_logs");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS content_structure_audits");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS llmstxt_versions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS agent_readiness_scores");
  });

  it("partial unique index on llmstxt_versions for one-current-per-brand", () => {
    expect(migration).toContain("llmstxt_one_current_per_brand");
    expect(migration).toContain("WHERE is_current = true");
  });
});
