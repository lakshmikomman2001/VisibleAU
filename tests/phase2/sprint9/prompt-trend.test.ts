import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const routeSource = readFileSync(
  path.resolve("app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts"),
  "utf-8",
);

describe("prompt-trend route (v8.16 JOIN + tier gate + brand access)", () => {
  it("uses audits JOIN, NOT citations.brand_id (v8.16 fix)", () => {
    expect(routeSource).toContain("JOIN audits");
    expect(routeSource).not.toContain("citations.brand_id");
    expect(routeSource).not.toContain("c.brand_id");
  });

  it("weekly buckets via DATE_TRUNC", () => {
    expect(routeSource).toMatch(/DATE_TRUNC.*week/i);
  });

  it("mention_rate = mentioned/total with NULLIF guard", () => {
    expect(routeSource).toMatch(/NULLIF\s*\(\s*COUNT\s*\(\s*\*\s*\)/);
  });

  it("<2 weeks returns 'not enough history' message", () => {
    expect(routeSource).toMatch(/rows\.length\s*<\s*2/);
    expect(routeSource).toContain("Not enough history yet");
  });

  it("Growth+ tier gated (isTierAtLeast growth)", () => {
    expect(routeSource).toContain("isTierAtLeast");
    expect(routeSource).toMatch(/growth/);
  });

  it("calls assertBrandAccess", () => {
    expect(routeSource).toContain("assertBrandAccess");
  });

  it("returns 404 on BrandAccessDeniedError (out-of-scope brand)", () => {
    expect(routeSource).toContain("BrandAccessDeniedError");
    expect(routeSource).toMatch(/404/);
  });

  it("uses withRlsContext", () => {
    expect(routeSource).toContain("withRlsContext");
  });
});
