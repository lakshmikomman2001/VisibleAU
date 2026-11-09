import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

const routeSource = readFileSync(
  path.resolve("app/api/brands/[brandId]/action-progress/route.ts"),
  "utf-8",
);

describe("action-progress route (canonical helper + tier gate + honesty rule)", () => {
  it("calls the canonical getProgressSummary helper (not a hand-rolled query)", () => {
    expect(routeSource).toContain("getProgressSummary");
    expect(routeSource).toContain("progress-summary");
  });

  it("uses completedAt (via helper), NOT updatedAt", () => {
    expect(routeSource).not.toContain("updatedAt");
  });

  it("month boundary is UTC date_trunc (via helper), NOT JS setHours", () => {
    expect(routeSource).not.toContain("setHours");
    expect(routeSource).not.toContain("setDate(1)");
  });

  it("Growth+ tier gated", () => {
    expect(routeSource).toContain("isTierAtLeast");
    // 8 Nov (brand-feature locks, part 1): the route reads its plan from lib/pricing/brand-features.ts.
    expect(routeSource).toContain('brandFeaturePlan("action_progress")');
    expect(brandFeaturePlan("action_progress")).toBe("growth");
  });

  it("calls assertBrandAccess (S8b-01 gate)", () => {
    expect(routeSource).toContain("assertBrandAccess");
    // Since bb69f3d the refusal goes through the one helper (404 another workspace's brand, 403 role).
    expect(routeSource).toContain("brandAccessErrorResponse(e)");
  });

  it("uses withRlsContext for RLS enforcement", () => {
    expect(routeSource).toContain("withRlsContext");
  });

  it("returns completedThisMonth/totalTasks/measuredImpact/validationPending shape", () => {
    expect(routeSource).toContain("completedThisMonth");
    expect(routeSource).toContain("totalTasks");
    expect(routeSource).toContain("measuredImpact");
    expect(routeSource).toContain("validationPending");
  });
});
