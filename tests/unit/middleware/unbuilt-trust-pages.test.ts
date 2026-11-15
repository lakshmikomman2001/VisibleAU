/**
 * 17 Nov (part 2 follow-up): a trust check that isn't built has no page. Part 2 gave each such page a layout that
 * calls notFound(); in Playwright (dev server), a notFound() under the brand layout drew the signed-in shell twice on
 * 10 of 40 loads (two <main data-app-main>, one empty). The middleware now answers those URLs with the app's 404
 * before anything renders (32 of 32 loads: a 404 status, one not-found page, no shell).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  isUnbuiltTrustPage,
  TRUST_CHECK_IMPLEMENTED,
  TRUST_PAGE_CHECK,
  type TrustCheckKey,
} from "@/lib/trust/stub-implementation-status";
import { middleware, NO_SUCH_PAGE_PATH } from "@/middleware";

const TRUST_DIR = join(process.cwd(), "app/(auth)/brands/[brandId]/trust");
const BRAND = "3ed7f357-3ddf-4ecd-8116-a6c232cccf27";
const SIGNED_IN = { cookie: "better-auth.session_token=abc.def" };

const visit = (url: string, headers: Record<string, string> = {}) =>
  middleware(new NextRequest(`http://localhost:3000${url}`, { headers }));

describe("isUnbuiltTrustPage", () => {
  it("the pages of the checks that aren't built: Consensus, Hallucinations, LinkedIn presence", () => {
    for (const page of ["consensus", "hallucinations", "linkedin-presence"]) {
      expect(isUnbuiltTrustPage(`/brands/${BRAND}/trust/${page}`), page).toBe(true);
      expect(isUnbuiltTrustPage(`/brands/${BRAND}/trust/${page}/`), `${page}/`).toBe(true);
    }
  });

  it("not a built check's page (YouTube presence), another trust page, the hub, or anything else", () => {
    for (const path of [
      `/brands/${BRAND}/trust/youtube-presence`,
      `/brands/${BRAND}/trust/evidence`,
      `/brands/${BRAND}/trust/entity-score`,
      `/brands/${BRAND}/trust/citation-sources`,
      `/brands/${BRAND}/trust`,
      `/brands/${BRAND}/trust/consensus/extra`,
      `/brands/${BRAND}/visibility`,
      `/api/brands/${BRAND}/consensus-score`,
      "/brands",
      "/dashboard",
    ]) {
      expect(isUnbuiltTrustPage(path), path).toBe(false);
    }
  });

  it("follows the flags: a page is unbuilt exactly while its check's flag is false", () => {
    for (const [page, check] of Object.entries(TRUST_PAGE_CHECK)) {
      expect(isUnbuiltTrustPage(`/brands/${BRAND}/trust/${page}`), page).toBe(
        !TRUST_CHECK_IMPLEMENTED[check],
      );
    }
  });

  it("every page in the map is a trust page, and every trust page gated on a check is in the map", () => {
    for (const page of Object.keys(TRUST_PAGE_CHECK)) {
      expect(existsSync(join(TRUST_DIR, page, "page.tsx")), page).toBe(true);
    }
    const flags = Object.keys(TRUST_CHECK_IMPLEMENTED) as TrustCheckKey[];
    for (const page of readdirSync(TRUST_DIR, { withFileTypes: true })) {
      if (!page.isDirectory()) continue;
      const layout = join(TRUST_DIR, page.name, "layout.tsx");
      if (!existsSync(layout)) continue;
      const source = readFileSync(layout, "utf8");
      const gated = flags.filter((flag) => source.includes(`TRUST_CHECK_IMPLEMENTED.${flag}`));
      if (gated.length === 0) continue;
      expect(gated.map((flag) => [page.name, flag])).toEqual([
        [page.name, TRUST_PAGE_CHECK[page.name]],
      ]);
    }
  });
});

describe("the middleware answers an unbuilt check's page with the app's 404", () => {
  it("signed in: rewritten to a path no route matches (app/not-found.tsx, a 404 status)", async () => {
    for (const page of ["consensus", "hallucinations", "linkedin-presence"]) {
      const res = await visit(`/brands/${BRAND}/trust/${page}`, SIGNED_IN);
      expect(res.headers.get("x-middleware-rewrite"), page).toBe(
        `http://localhost:3000${NO_SUCH_PAGE_PATH}`,
      );
    }
  });

  it("no route matches the path it rewrites to (no such folder, no dynamic segment at the top)", () => {
    const app = join(process.cwd(), "app");
    // The top level, and the top of each route group ("(auth)", "(marketing)"): a URL's first segment.
    const tops = [
      app,
      ...readdirSync(app)
        .filter((entry) => entry.startsWith("("))
        .map((group) => join(app, group)),
    ];
    for (const dir of tops) {
      expect(existsSync(join(dir, NO_SUCH_PAGE_PATH.slice(1))), dir).toBe(false);
      expect(
        readdirSync(dir).filter((entry) => entry.startsWith("[")),
        dir,
      ).toEqual([]);
    }
  });

  it("a built check's page and the other trust pages go through as before", async () => {
    for (const page of ["youtube-presence", "evidence", "entity-score"]) {
      const res = await visit(`/brands/${BRAND}/trust/${page}`, SIGNED_IN);
      expect(res.headers.get("x-middleware-rewrite"), page).toBeNull();
      expect(res.headers.get("x-middleware-next"), page).toBe("1");
    }
  });

  it("signed out: the sign-in redirect, as for every signed-in page", async () => {
    const res = await visit(`/brands/${BRAND}/trust/consensus`);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/sign-in?redirectTo=");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
