/**
 * Follow-ups from d247ba7..f13411d, part 3 -- a page whose URL can carry a token (an invite link, the sign-in
 * and sign-up pages it passes through as ?redirectTo=, a password reset link) sends no Referer, so the token
 * never reaches another site or a log. The middleware sets it wherever the app answers; vercel.json sets it
 * on Vercel, compiled here the way Vercel compiles a rule's source (as in
 * tests/unit/branding/report-branding-production-settings.test.ts), with exactly one policy per path.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const { pathToRegexp } = createRequire(import.meta.url)("next/dist/compiled/path-to-regexp") as {
  pathToRegexp: (
    source: string,
    keys: unknown[],
    options: { strict: boolean; sensitive: boolean; delimiter: string },
  ) => RegExp;
};

const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};

function referrerPolicies(path: string): string[] {
  return vercel.headers
    .filter((rule) =>
      pathToRegexp(rule.source, [], { strict: true, sensitive: true, delimiter: "/" }).test(path),
    )
    .flatMap((rule) =>
      rule.headers.filter((h) => h.key.toLowerCase() === "referrer-policy").map((h) => h.value),
    );
}

const INVITE =
  "/invite/0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a/AbC_-12345xyzAbC_-12345xyzAbC_-12345xyz12";
const TOKEN_PAGES = [INVITE, "/sign-in", "/sign-up", "/sign-up/sso", "/reset-password"];
const OTHER_PAGES = [
  "/",
  "/dashboard",
  "/pricing",
  "/settings/team",
  "/api/invites/x/y",
  "/api/brands",
];

describe("on Vercel (vercel.json)", () => {
  it.each(TOKEN_PAGES)("%s: no-referrer, and nothing else", (path) => {
    expect(referrerPolicies(path)).toEqual(["no-referrer"]);
  });

  it.each(OTHER_PAGES)("%s: strict-origin-when-cross-origin, as before", (path) => {
    expect(referrerPolicies(path)).toEqual(["strict-origin-when-cross-origin"]);
  });
});

describe("from the app (middleware.ts)", () => {
  const visit = async (url: string, cookie?: string) =>
    middleware(
      new NextRequest(`http://localhost:3000${url}`, {
        headers: cookie ? { cookie } : {},
      }),
    );

  it("an invite link, signed out (sent to sign in): no-referrer", async () => {
    const res = await visit(INVITE);
    expect(res.headers.get("location")).toContain("/sign-in?redirectTo=");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("an invite link, signed in: no-referrer", async () => {
    const res = await visit(INVITE, "better-auth.session_token=test-session");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each([
    `/sign-in?redirectTo=${encodeURIComponent(INVITE)}`,
    `/sign-up?redirectTo=${encodeURIComponent(INVITE)}`,
    "/reset-password?token=reset-token-in-the-url",
  ])("%s: no-referrer", async (url) => {
    expect((await visit(url)).headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["/pricing", "/dashboard"])("%s: left to the site-wide policy", async (url) => {
    const res = await visit(url, "better-auth.session_token=test-session");
    expect(res.headers.get("referrer-policy")).toBeNull();
  });
});
