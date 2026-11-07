/**
 * Team follow-ups (31 Oct), item 3 -- `redirectTo` only ever leads to a page on this site.
 */
import { describe, expect, it } from "vitest";
import { authPagePath, safeRedirectPath } from "@/lib/auth/paths";

describe("safeRedirectPath", () => {
  it.each([
    ["/invite/7f0c2a/AbC_-123xyz"],
    ["/dashboard"],
    ["/brands/123?tab=audits#latest"],
    ["/%2F%2Fstill-a-path-here"],
  ])("keeps a path on this site: %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    ["https://evil.example/invite"],
    ["http://evil.example"],
    ["//evil.example/x"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["javascript:alert(1)"],
    ["evil.example"],
    [" /dashboard"],
    [""],
    [null],
    [undefined],
  ])("refuses anything else: %j", (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });
});

describe("authPagePath", () => {
  it("carries the destination to sign-in or sign-up, encoded", () => {
    expect(authPagePath("/sign-in", "/invite/o/t")).toBe("/sign-in?redirectTo=%2Finvite%2Fo%2Ft");
    expect(authPagePath("/sign-up", "/invite/o/t")).toBe("/sign-up?redirectTo=%2Finvite%2Fo%2Ft");
  });

  it("is the bare page without one", () => {
    expect(authPagePath("/sign-in", null)).toBe("/sign-in");
  });
});
