/**
 * Leftovers task, part 1 (17 Nov): no loading.tsx above the signed-in shell or a brand's layout.
 *
 * The root app/loading.tsx wrapped the whole app in one Suspense boundary. Every page then started streaming before
 * it could say "not found" or fail, so every 404 and error answered 200, and a notFound() or error inside the
 * boundary switched it to client rendering: on some loads the copy of the shell that had already streamed was left
 * in the page, hidden (<div hidden id="S:0">). Playwright on the e2e dev server: Consensus (its layout's notFound())
 * 10 of 40 loads doubled; a throwing page 2 of 12; a deleted brand 1 of 40. Without it: 0, with 404 and 500.
 * tests/e2e/10-not-found-and-errors.spec.ts loads them 40 times each.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(process.cwd(), "app");

function filesNamed(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesNamed(full, name));
    else if (entry === name) out.push(relative(process.cwd(), full).split(sep).join("/"));
  }
  return out;
}

/**
 * The loading.tsx files allowed, each wrapping only its own page. A not-found or error on such a page still answers
 * 200 and could leave a hidden copy of that page's body (never the shell): schedule's notFound() is reachable only
 * if the brand is deleted between the brand layout's check and the page's query.
 */
const ALLOWED_LOADING = ["app/(auth)/brands/[brandId]/schedule/loading.tsx"];

describe("no Suspense boundary from a loading.tsx above the shell or a brand's layout", () => {
  it("there's no app/loading.tsx, nor one in (auth), brands or [brandId]", () => {
    for (const dir of ["", "(auth)", "(auth)/brands", "(auth)/brands/[brandId]"]) {
      expect(existsSync(join(APP, dir, "loading.tsx")), `app/${dir}/loading.tsx`).toBe(false);
    }
  });

  it("every loading.tsx in the app is one that wraps only its own page (a new one needs this review)", () => {
    expect(filesNamed(APP, "loading.tsx").sort()).toEqual(ALLOWED_LOADING);
    for (const file of ALLOWED_LOADING) {
      const dir = file.slice(0, file.lastIndexOf("/"));
      // A leaf: no page below it but its own.
      expect(filesNamed(join(process.cwd(), dir), "page.tsx"), file).toEqual([`${dir}/page.tsx`]);
    }
  });
});

describe("a not-found or error inside the app renders inside the one shell", () => {
  it("app/(auth)/error.tsx: a client error boundary under the shell, not a full-screen page", () => {
    const source = readFileSync(join(APP, "(auth)/error.tsx"), "utf8");
    expect(source.startsWith('"use client";')).toBe(true);
    expect(source).toContain("Sentry.captureException(error)");
    expect(source).not.toContain("min-h-screen");
    expect(source).toContain("Something went wrong");
  });

  it("a URL under a brand that isn't one of its pages is a 404 page, after the brand layout's check", () => {
    const source = readFileSync(join(APP, "(auth)/brands/[brandId]/[...missing]/page.tsx"), "utf8");
    expect(source).toMatch(/notFound\(\);/);
    expect(existsSync(join(APP, "(auth)/brands/[brandId]/layout.tsx"))).toBe(true);
  });

  it("the middleware no longer answers trust pages itself (the layouts' 404 is a real one now)", () => {
    const source = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");
    expect(source).not.toMatch(/isUnbuiltTrustPage|NO_SUCH_PAGE_PATH|rewrite\(/);
  });
});
