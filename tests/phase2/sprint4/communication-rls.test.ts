import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("MI-01: Sprint 4 migration idempotency", () => {
  const migrationPath = resolve(
    __dirname,
    "../../../db/migrations/0015_phase2_sprint4_communication.sql",
  );
  const sql = readFileSync(migrationPath, "utf-8");

  it("uses CREATE TABLE IF NOT EXISTS for all 3 tables", () => {
    const matches = sql.match(/CREATE TABLE IF NOT EXISTS/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(3);
  });

  it("uses DROP POLICY IF EXISTS before CREATE POLICY for all 3 RLS policies", () => {
    const drops = sql.match(/DROP POLICY IF EXISTS/g);
    const creates = sql.match(/CREATE POLICY/g);
    expect(drops).not.toBeNull();
    expect(creates).not.toBeNull();
    expect(drops!.length).toBe(3);
    expect(creates!.length).toBe(3);
  });

  it("uses CREATE INDEX IF NOT EXISTS", () => {
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS");
  });

  it("creates report_templates table", () => {
    expect(sql).toContain("report_templates");
  });

  it("creates generated_reports table", () => {
    expect(sql).toContain("generated_reports");
  });

  it("creates report_delivery_schedules table", () => {
    expect(sql).toContain("report_delivery_schedules");
  });

  it("generated_reports has NO status column", () => {
    const tableSection = sql.substring(
      sql.indexOf("CREATE TABLE IF NOT EXISTS generated_reports"),
      sql.indexOf("CREATE INDEX"),
    );
    expect(tableSection).not.toMatch(/\bstatus\b/i);
  });

  it("generated_reports has NO UNIQUE constraint", () => {
    const tableSection = sql.substring(
      sql.indexOf("CREATE TABLE IF NOT EXISTS generated_reports"),
      sql.indexOf("CREATE INDEX"),
    );
    expect(tableSection).not.toMatch(/UNIQUE/i);
  });

  it("RLS policies filter on organization_id via current_setting", () => {
    const policyMatches = sql.match(/organization_id.*current_setting/g);
    expect(policyMatches).not.toBeNull();
    expect(policyMatches!.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Schema exports", () => {
  it("db/schema/index.ts exports report tables", async () => {
    const indexPath = resolve(__dirname, "../../../db/schema/index.ts");
    const indexContent = readFileSync(indexPath, "utf-8");

    expect(indexContent).toContain("report-templates");
    expect(indexContent).toContain("generated-reports");
    expect(indexContent).toContain("report-delivery-schedules");
  });
});
