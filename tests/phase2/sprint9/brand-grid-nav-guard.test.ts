import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * NAV-ORPHAN guard: every brand-scoped route must have a tile in the
 * brand-page grid. This is a set-difference test — adding a new
 * `/brands/[brandId]/<segment>/page.tsx` without a tile fails this test.
 *
 * Waiver list: sub-routes reachable from within a parent tile's screen
 * (e.g. discovery/comparisons is reached from the discovery page).
 * Document WHY each waiver exists.
 */

const BRAND_ROUTES_DIR = path.resolve(
  "app/(auth)/brands/[brandId]",
);

const TILE_GRID_FILE = path.resolve(
  "components/domain/brand/brand-detail-client.tsx",
);

const WAIVER: Record<string, string> = {
  "ai-discovery":
    "Legacy route — superseded by /discovery; kept for backward compat redirect",
  "meta-tags":
    "Sub-feature of technical-audit; reached from within that screen",
};

function getTopLevelRouteSegments(): string[] {
  const entries = readdirSync(BRAND_ROUTES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => {
      if (!e.isDirectory()) return false;
      if (e.name.startsWith("_")) return false;
      const pageFile = path.join(BRAND_ROUTES_DIR, e.name, "page.tsx");
      try {
        statSync(pageFile);
        return true;
      } catch {
        return false;
      }
    })
    .map((e) => e.name);
}

function getTileHrefs(): string[] {
  const source = readFileSync(TILE_GRID_FILE, "utf-8");
  const hrefPattern = /href:\s*`\/brands\/\$\{brand\.id\}\/([^`"]+)`/g;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefPattern.exec(source)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

describe("brand-page tile grid nav guard (NAV-ORPHAN prevention)", () => {
  const routeSegments = getTopLevelRouteSegments();
  const tileHrefs = getTileHrefs();

  it("finds at least 15 route segments (sanity)", () => {
    expect(routeSegments.length).toBeGreaterThanOrEqual(15);
  });

  it("finds at least 15 tile hrefs (sanity)", () => {
    expect(tileHrefs.length).toBeGreaterThanOrEqual(15);
  });

  it("every brand-scoped route has a tile (or an explicit waiver)", () => {
    const missing = routeSegments.filter(
      (seg) => !tileHrefs.includes(seg) && !(seg in WAIVER),
    );

    if (missing.length > 0) {
      throw new Error(
        `NAV-ORPHAN: ${missing.length} brand route(s) have no tile in the brand-page grid:\n` +
          missing.map((s) => `  - /brands/[brandId]/${s}`).join("\n") +
          "\n\nFix: add a tile to components/domain/brand/brand-detail-client.tsx " +
          "OR add an entry to the WAIVER list in this test with a reason.",
      );
    }
  });

  it("health-check tile exists (S9 capstone)", () => {
    expect(tileHrefs).toContain("health-check");
  });

  it("autopilot tile exists (S9 capstone)", () => {
    expect(tileHrefs).toContain("autopilot");
  });

  it("waiver entries are still valid routes (stale waivers fail)", () => {
    for (const seg of Object.keys(WAIVER)) {
      expect(
        routeSegments,
        `Waiver "${seg}" references a route that no longer exists — remove it`,
      ).toContain(seg);
    }
  });
});
