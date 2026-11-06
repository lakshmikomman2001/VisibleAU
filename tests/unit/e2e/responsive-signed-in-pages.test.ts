/**
 * 6 Nov (phone-layout follow-ups, item 2) -- the phone spec
 * (tests/e2e/responsive/responsive-shell.spec.ts) opens every signed-in page at 320,
 * 375, 768 and 1280px. Its list (tests/e2e/responsive/signed-in-pages.ts) has to
 * name every route under app/(auth), so a new page can't skip the check, and each
 * URL fills in every dynamic segment.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { type PageFixtures, SIGNED_IN_PAGES } from "@/tests/e2e/responsive/signed-in-pages";

const AUTH = join(__dirname, "../../../app/(auth)");

/** "brands/[brandId]/page.tsx" -> "/brands/[brandId]". */
function routes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routes(full));
    else if (entry === "page.tsx") {
      out.push(`/${relative(AUTH, dir).split(sep).join("/")}`.replace(/\/$/, ""));
    }
  }
  return out;
}

const FIXTURES: PageFixtures = {
  orgId: "org-1",
  brandId: "brand-1",
  finishedAudit: "audit-1",
  runningAudit: "audit-2",
  otherFinishedAudit: "audit-3",
  actionItem: "item-1",
  reportId: "report-1",
  packId: "pack-1",
};

describe("the phone spec covers every signed-in page", () => {
  it("every route under app/(auth) has an entry, and every entry is a route", () => {
    const listed = new Set(SIGNED_IN_PAGES.map((p) => p.route));
    const pages = routes(AUTH).sort();
    expect(pages.length).toBeGreaterThan(60);
    expect(pages.filter((r) => !listed.has(r))).toEqual([]);
    expect([...listed].filter((r) => !pages.includes(r))).toEqual([]);
  });

  it("each URL fills in its route's dynamic segments", () => {
    for (const page of SIGNED_IN_PAGES) {
      const url = page.url(FIXTURES);
      expect(url, page.name).not.toMatch(/\[|\]/);
      const segments = page.route.split("/").length;
      expect(url.split("?")[0].split("/").length, page.name).toBe(segments);
    }
  });

  it("names are unique, so a failure says which page", () => {
    const names = SIGNED_IN_PAGES.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
