import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const migrationSrc = readFileSync(
  resolve(__dirname, "../../../db/migrations/0020_phase2_sprint7_discovery.sql"),
  "utf-8",
);

describe("cascade deletion rules", () => {
  it("journey_run_results cascades on journey deletion (journey_id ON DELETE CASCADE)", () => {
    const lines = migrationSrc.split("\n");
    const journeyIdLine = lines.find(
      (l) => l.includes("journey_id") && l.includes("REFERENCES"),
    );
    expect(journeyIdLine).toBeDefined();
    expect(journeyIdLine).toContain("ON DELETE CASCADE");
  });

  it("comparison_prompt_results cascades on audit deletion (audit_id ON DELETE CASCADE)", () => {
    const lines = migrationSrc.split("\n");
    const auditIdLine = lines.find(
      (l) => l.includes("audit_id") && l.includes("REFERENCES"),
    );
    expect(auditIdLine).toBeDefined();
    expect(auditIdLine).toContain("ON DELETE CASCADE");
  });

  it("migration has 3 CREATE TABLE IF NOT EXISTS", () => {
    const matches = migrationSrc.match(/CREATE TABLE IF NOT EXISTS/g);
    expect(matches).toHaveLength(3);
  });

  it("migration has 3 DROP POLICY IF EXISTS for idempotent RLS", () => {
    const matches = migrationSrc.match(/DROP POLICY IF EXISTS/g);
    expect(matches).toHaveLength(3);
  });
});
