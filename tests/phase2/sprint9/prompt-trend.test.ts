import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

const routeSource = readFileSync(
  path.resolve("app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts"),
  "utf-8",
);

describe("prompt-trend route (v8.16 JOIN + tier gate + brand access)", () => {
  // 17 Nov, part 3: one point per audit, as the audit page counts answers (lib/visibility/question-trend.ts) --
  // it grouped every citations row by calendar week, unverified mentions and every run counted.
  const libSource = readFileSync(path.resolve("lib/visibility/question-trend.ts"), "utf-8");

  it("the route takes the shared question trend (no SQL of its own; citations has no brand_id)", () => {
    expect(routeSource).toContain("questionTrend(tx, brandId, decodeURIComponent(promptId))");
    expect(routeSource).not.toContain("citations.brand_id");
    expect(routeSource).not.toMatch(/DATE_TRUNC/i);
  });

  it("per audit, by the audit page's rules: run 1, everyday answers, verified mentions; comparable audits only", () => {
    expect(libSource).toContain("ORGANIC_ONLY");
    expect(libSource).toContain("eq(citations.runNumber, 1)");
    expect(libSource).toContain("EXCLUDE_UNVERIFIED");
    expect(libSource).toContain("includedInTrends");
    expect(libSource).toContain("driftBaseline(latestRow, [a], models, countsGoogle)");
  });

  it("fewer than 2 comparable audits → 'Not enough comparable audits'", () => {
    expect(routeSource).toMatch(/trend\.length\s*<\s*2/);
    expect(routeSource).toContain("Not enough comparable audits");
  });

  it("Growth+ tier gated (isTierAtLeast growth)", () => {
    expect(routeSource).toContain("isTierAtLeast");
    // 8 Nov (brand-feature locks, part 1): the route reads its plan from lib/pricing/brand-features.ts.
    expect(routeSource).toContain('brandFeaturePlan("prompt_trends")');
    expect(brandFeaturePlan("prompt_trends")).toBe("growth");
  });

  it("calls assertBrandAccess", () => {
    expect(routeSource).toContain("assertBrandAccess");
  });

  // Since bb69f3d the refusal goes through brandAccessErrorResponse: 404 for another workspace's brand.
  // S04B part 6 (LLD amendment 108): the first import of lib/governance in a cold worker can pass the 5 s default in
  // the large guard batches (S04 saw it in every part; it passed alone), so the test sets its own time.
  it("returns 404 for an out-of-scope brand, through brandAccessErrorResponse", async () => {
    const { BrandAccessDeniedError, brandAccessErrorResponse } = await import("@/lib/governance");
    expect(routeSource).toContain("brandAccessErrorResponse(e)");
    expect(brandAccessErrorResponse(new BrandAccessDeniedError("not_found"))?.status).toBe(404);
  }, 30_000);

  it("uses withRlsContext", () => {
    expect(routeSource).toContain("withRlsContext");
  });
});
