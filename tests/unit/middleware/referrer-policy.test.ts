/**
 * Follow-ups from d247ba7..f13411d, part 3 -- a page whose URL can carry a token (an invite link, the sign-in
 * and sign-up pages it passes through as ?redirectTo=, a password reset link) sends no Referer, so the token
 * never reaches another site or a log.
 *
 * Follow-ups from 6e27afc..01a6a8c, part 5 -- and every response carries exactly one Referrer-Policy. The
 * middleware sets no-referrer on those pages and nothing elsewhere; vercel.json sets
 * strict-origin-when-cross-origin on every other path and nothing on those. (vercel.json set no-referrer on
 * them too, so on Vercel a token page's response could carry the header twice.) Checked as Vercel serves a
 * page: the vercel.json rules that match its path, compiled the way Vercel compiles a rule's source (as in
 * tests/unit/branding/report-branding-production-settings.test.ts), plus what the middleware's own response
 * sets.
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

/** What vercel.json adds to a response for `path`. */
function vercelPolicies(path: string): string[] {
  return vercel.headers
    .filter((rule) =>
      pathToRegexp(rule.source, [], { strict: true, sensitive: true, delimiter: "/" }).test(path),
    )
    .flatMap((rule) =>
      rule.headers.filter((h) => h.key.toLowerCase() === "referrer-policy").map((h) => h.value),
    );
}

const visit = async (url: string, cookie?: string) =>
  middleware(
    new NextRequest(`http://localhost:3000${url}`, {
      headers: cookie ? { cookie } : {},
    }),
  );

/** Every Referrer-Policy a response for `url` carries on Vercel: vercel.json's, then the middleware's. */
async function served(url: string, cookie?: string): Promise<string[]> {
  const fromApp = (await visit(url, cookie)).headers.get("referrer-policy");
  return [...vercelPolicies(new URL(url, "http://x").pathname), ...(fromApp ? [fromApp] : [])];
}

const INVITE =
  "/invite/0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a/AbC_-12345xyzAbC_-12345xyzAbC_-12345xyz12";
const TOKEN_PAGES = [
  INVITE,
  `/sign-in?redirectTo=${encodeURIComponent(INVITE)}`,
  `/sign-up?redirectTo=${encodeURIComponent(INVITE)}`,
  "/sign-up/sso",
  "/reset-password?token=reset-token-in-the-url",
];
const OTHER_PAGES = [
  "/",
  "/dashboard",
  "/pricing",
  "/nz/pricing",
  "/nz/sign-in",
  "/invites",
  "/settings/team",
  "/api/invites/x/y",
  "/api/brands",
];
const SIGNED_IN = "better-auth.session_token=test-session";

describe("every response carries exactly one Referrer-Policy", () => {
  it.each(TOKEN_PAGES)("%s, signed out: no-referrer, once", async (url) => {
    expect(await served(url)).toEqual(["no-referrer"]);
  });

  it.each(TOKEN_PAGES)("%s, signed in: no-referrer, once", async (url) => {
    expect(await served(url, SIGNED_IN)).toEqual(["no-referrer"]);
  });

  it.each(OTHER_PAGES)("%s: strict-origin-when-cross-origin, once", async (url) => {
    expect(await served(url, SIGNED_IN)).toEqual(["strict-origin-when-cross-origin"]);
    expect(await served(url)).toEqual(["strict-origin-when-cross-origin"]);
  });
});

describe("who sets it", () => {
  it("on a token page, only the middleware: vercel.json sets nothing there", async () => {
    for (const url of TOKEN_PAGES) {
      expect(vercelPolicies(new URL(url, "http://x").pathname), url).toEqual([]);
    }
  });

  it("an invite link, signed out, is sent to sign in, and that answer carries no-referrer", async () => {
    const res = await visit(INVITE);
    expect(res.headers.get("location")).toContain("/sign-in?redirectTo=");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each([
    "/pricing",
    "/dashboard",
    "/nz/sign-in",
  ])("%s: the middleware leaves it to vercel.json", async (url) => {
    expect((await visit(url, SIGNED_IN)).headers.get("referrer-policy")).toBeNull();
  });
});
