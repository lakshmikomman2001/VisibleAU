/**
 * Regression follow-ups (9 Nov), part 5 -- one answer for a brand that isn't the caller's, from one place
 * (docs/ops/post-launch-db-hardening.md, "the 403-vs-404 policy"): 404 Not found when the brand doesn't
 * exist or is another workspace's -- never confirming it exists -- and 403 only for a brand in the member's
 * own workspace that their role doesn't extend to. 51 API routes built their own answer (403 for both, or
 * 404 for both); every one now answers through brandAccessErrorResponse. The real routes:
 * tests/integration/brand-not-found.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import { BrandAccessDeniedError, brandAccessErrorResponse } from "@/lib/governance";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

describe("brandAccessErrorResponse", () => {
  it("another workspace's brand, or none: 404 Not found", async () => {
    const res = brandAccessErrorResponse(new BrandAccessDeniedError("not_found"));
    expect(res?.status).toBe(404);
    expect(await res?.json()).toEqual({ error: "Not found" });
  });

  it("a brand in the member's own workspace their role doesn't reach: 403", async () => {
    const res = brandAccessErrorResponse(new BrandAccessDeniedError("role_restricted"));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Brand access denied" });
  });

  it("anything else isn't its to answer: null, so the route rethrows", () => {
    expect(brandAccessErrorResponse(new Error("boom"))).toBeNull();
  });
});

describe("every API route answers the brand check through it", () => {
  readSourcesBeforeAll(["app/api"]);
  const routes = () => sourcePaths(["app/api"], /\/route\.ts$/);

  it("no route builds its own answer for a BrandAccessDeniedError", () => {
    expect(routes().length).toBeGreaterThan(100);
    expect(
      routes().filter((f) => /instanceof\s+BrandAccessDeniedError/.test(sourceText(f))),
    ).toEqual([]);
  });

  it("every route that checks brand access maps the refusal with brandAccessErrorResponse", () => {
    const checking = routes().filter((f) => /\bassertBrandAccess\(/.test(sourceText(f)));
    expect(checking.length).toBeGreaterThanOrEqual(60);
    expect(checking.filter((f) => !sourceText(f).includes("brandAccessErrorResponse(e)"))).toEqual(
      [],
    );
  });
});
