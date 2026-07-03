import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("visibility RLS migration (0013)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../db/migrations/0013_phase2_sprint3_visibility.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("creates 7 tables with IF NOT EXISTS (plus 1 in comment header)", () => {
    const createCount = (sql.match(/^CREATE TABLE IF NOT EXISTS/gm) || []).length;
    expect(createCount).toBe(7);
  });

  it("enables RLS on 6 tenant tables (not prompt_volume_estimates)", () => {
    const enableRls = (sql.match(/ENABLE ROW LEVEL SECURITY/g) || []).length;
    expect(enableRls).toBe(6);
  });

  it("disables RLS on prompt_volume_estimates (global seed table)", () => {
    expect(sql).toContain("prompt_volume_estimates DISABLE ROW LEVEL SECURITY");
  });

  it("has DROP POLICY IF EXISTS before each CREATE POLICY", () => {
    const dropPolicies = (sql.match(/^DROP POLICY IF EXISTS/gm) || []).length;
    expect(dropPolicies).toBe(6);
  });

  it("uses USING + WITH CHECK on all tenant policies", () => {
    const withCheck = (sql.match(/^\s+WITH CHECK/gm) || []).length;
    expect(withCheck).toBe(6);
  });

  it("includes citations ALTER for source_type columns", () => {
    expect(sql).toContain("cited_source_type");
    expect(sql).toContain("cited_source_engine_affinity");
  });

  it("includes notification_preferences ALTER for alert toggles", () => {
    expect(sql).toContain("email_on_hallucination");
    expect(sql).toContain("email_on_consensus");
    expect(sql).toContain("email_on_volatility");
  });

  it("includes vertical_pack_prompts ALTER for persona/intent/source", () => {
    expect(sql).toContain("persona_tag");
    expect(sql).toContain("branded_intent");
    expect(sql).toContain("source");
  });
});
