/**
 * Team follow-ups (31 Oct), item 3 -- `redirectTo` only ever leads to a page on this site.
 *
 * Follow-ups from d247ba7..f13411d, part 4 -- encoded tricks too: a path that becomes another site, a
 * backslash or a control character once decoded (once, twice) falls back to the safe default, in case
 * anything between here and the browser decodes it again. Paths with ordinary queries still work.
 */
import { describe, expect, it } from "vitest";
import { authPagePath, safeRedirectPath } from "@/lib/auth/paths";

describe("safeRedirectPath", () => {
  it.each([
    ["/invite/7f0c2a/AbC_-123xyz"],
    ["/dashboard"],
    ["/brands/123?tab=audits#latest"],
    ["/invite/abc?x=1"],
    ["/reports?q=100%25"],
    ["/settings/team?from=%2Fdashboard"],
    ["/brands/caf%C3%A9"],
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

  // Sri's list (8 Nov), each falling back to the safe default.
  it.each([
    ["%2F%2Fevil.com"],
    ["/%2Fevil.com"],
    ["/%5Cevil.com"],
    ["%5C%5Cevil.com"],
    ["/\\tevil.com"],
    ["/\tevil.com"],
    ["HTTPS://evil.com"],
    ["hTtP://evil.com"],
    ["javascript:alert(1)"],
    ["/%0d%0aLocation:evil.com"],
    ["%252F%252Fevil.com"],
  ])("refuses an encoded trick: %j", (value) => {
    expect(safeRedirectPath(value)).toBeNull();
  });

  it.each([
    // Decoded once these are "//..." or "///...": another site to anything that decodes again.
    ["/%252F%252Fevil.com"],
    ["/%2F%2Fstill-a-path-here"],
    ["/%2f%2fevil.com"],
    ["/%5c%5cevil.com"],
    ["/%09/evil.com"],
    ["/%00evil.com"],
    // A path that won't decode.
    ["/%E0%A4%A"],
    ["/%zz"],
  ])("refuses the rest of the family: %j", (value) => {
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
