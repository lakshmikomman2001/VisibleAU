import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

/**
 * DEAD-LINK GUARD: prevents the F18/F19 bug class.
 *
 * Every internal `href` that points at a brand-scoped route
 * (e.g. `/brands/${brandId}/discovery/journeys`) must resolve
 * to an existing page.tsx under app/(auth)/.
 *
 * Scans: app/(auth)/ AND components/ — links can live anywhere.
 * Catches: links that point at routes that don't exist (404s).
 */

const APP_DIR = path.resolve("app/(auth)");

const SCAN_DIRS = ["app/(auth)", "components"];

// One walk of both trees per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll(SCAN_DIRS);

const WAIVER: Record<string, string> = {};

function extractBrandScopedHrefs(content: string): string[] {
  const hrefs: string[] = [];
  const patterns = [
    /href=\{`\/brands\/\$\{[^}]+\}\/([^`]+)`\}/g,
    /href="\/brands\/[^"]*\/([^"]+)"/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      hrefs.push(match[1]);
    }
  }
  return hrefs;
}

function routeSegmentExists(segment: string): boolean {
  const routeDir = path.join(APP_DIR, "brands/[brandId]", segment);
  if (existsSync(path.join(routeDir, "page.tsx"))) return true;
  if (existsSync(path.join(routeDir, "page.ts"))) return true;
  const parts = segment.split("/");
  for (let i = 0; i < parts.length; i++) {
    const withDynamic = [...parts.slice(0, i), `[${parts[i]}]`, ...parts.slice(i + 1)].join("/");
    const dynamicDir = path.join(APP_DIR, "brands/[brandId]", withDynamic);
    if (existsSync(path.join(dynamicDir, "page.tsx"))) return true;
    if (existsSync(path.join(dynamicDir, "page.ts"))) return true;
  }
  return false;
}

describe("dead-link guard (F18/F19 class prevention)", () => {
  const files = () => sourcePaths(SCAN_DIRS);

  it("scans both app/ and components/ (sanity)", () => {
    const appFiles = files().filter((f) => f.startsWith("app/"));
    const componentFiles = files().filter((f) => f.startsWith("components/"));
    expect(appFiles.length).toBeGreaterThan(10);
    expect(componentFiles.length).toBeGreaterThan(10);
  });

  it("all brand-scoped hrefs resolve to existing pages", () => {
    const violations: string[] = [];

    for (const file of files()) {
      const content = sourceText(file);
      const hrefs = extractBrandScopedHrefs(content);

      for (const href of hrefs) {
        const cleanHref = href.replace(/\?.*$/, "").replace(/#.*$/, "");

        if (!cleanHref || cleanHref.includes("${")) continue;

        const waiverKey = `${path.relative(process.cwd(), file)}:${cleanHref}`;
        if (Object.keys(WAIVER).some((k) => waiverKey.includes(k))) continue;

        if (!routeSegmentExists(cleanHref)) {
          const rel = path.relative(process.cwd(), file);
          violations.push(`${rel} → /brands/{id}/${cleanHref} (no page.tsx found)`);
        }
      }
    }

    const unique = [...new Set(violations)];
    if (unique.length > 0) {
      throw new Error(
        `DEAD-LINK: these hrefs point at routes with no page:\n` +
          unique.map((v) => `  - ${v}`).join("\n") +
          `\n\nFix: create the page, fix the href, or add a waiver.`,
      );
    }
  });

  it("waiver entries are still dead (stale waivers fail)", () => {
    for (const [key, reason] of Object.entries(WAIVER)) {
      const [, href] = key.split(":");
      if (href && routeSegmentExists(href)) {
        throw new Error(
          `STALE-WAIVER: "${key}" now resolves to a page — remove the waiver.\nReason was: ${reason}`,
        );
      }
    }
  });
});
