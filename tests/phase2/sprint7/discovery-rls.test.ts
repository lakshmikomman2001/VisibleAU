import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const migrationSrc = readFileSync(
  resolve(__dirname, "../../../db/migrations/0020_phase2_sprint7_discovery.sql"),
  "utf-8",
);

const journeysRouteSrc = readFileSync(
  resolve(__dirname, "../../../app/api/brands/[brandId]/journeys/route.ts"),
  "utf-8",
);

const comparisonsRouteSrc = readFileSync(
  resolve(__dirname, "../../../app/api/brands/[brandId]/comparisons/route.ts"),
  "utf-8",
);

describe("discovery RLS", () => {
  it("all 3 tables have RLS enabled in migration", () => {
    const tables = [
      "conversation_journeys",
      "journey_run_results",
      "comparison_prompt_results",
    ];
    for (const table of tables) {
      expect(migrationSrc).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      );
    }
  });

  it("all 3 tables have org_isolation policy using app.current_org_id", () => {
    const policyMatches = migrationSrc.match(/CREATE POLICY "org_isolation"/g);
    expect(policyMatches).toHaveLength(3);
    expect(migrationSrc).toContain("current_setting('app.current_org_id'");
  });

  it("journeys route uses withRlsContext (setRlsContext equivalent)", () => {
    expect(journeysRouteSrc).toContain("withRlsContext");
  });

  it("comparisons route uses withRlsContext", () => {
    expect(comparisonsRouteSrc).toContain("withRlsContext");
  });

  it("journeys API is gated to Agency tier", () => {
    expect(journeysRouteSrc).toContain("AGENCY_PLUS");
    expect(journeysRouteSrc).toContain("agency");
  });

  it("comparisons API is gated to Growth tier", () => {
    expect(comparisonsRouteSrc).toContain("GROWTH_PLUS");
    expect(comparisonsRouteSrc).toContain("growth");
  });

  it("cross-org read blocked via brand ownership check (organizationId match)", () => {
    expect(journeysRouteSrc).toContain("currentUser.organizationId");
    expect(comparisonsRouteSrc).toContain("currentUser.organizationId");
  });
});
