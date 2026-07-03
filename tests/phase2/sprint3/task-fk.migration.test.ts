import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("task-fk migration (0014)", () => {
  const migrationPath = path.resolve(
    __dirname,
    "../../../db/migrations/0014_phase2_sprint3_task_fks.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");

  it("adds fk_fan_out_gap constraint", () => {
    expect(sql).toContain("fk_fan_out_gap");
    expect(sql).toContain("REFERENCES query_fan_out_results(id)");
  });

  it("adds fk_topical_gap constraint", () => {
    expect(sql).toContain("fk_topical_gap");
    expect(sql).toContain("REFERENCES topical_coverage_gaps(id)");
  });

  it("both use ON DELETE SET NULL", () => {
    const setNullCount = (sql.match(/ON DELETE SET NULL/g) || []).length;
    expect(setNullCount).toBe(2);
  });

  it("uses pg_constraint guard for idempotency (MI-01)", () => {
    const constraintChecks = (sql.match(/FROM pg_constraint/g) || []).length;
    expect(constraintChecks).toBe(2);
  });

  it("is re-runnable (wrapped in DO blocks)", () => {
    const doBlocks = (sql.match(/DO \$\$/g) || []).length;
    expect(doBlocks).toBe(2);
  });
});
