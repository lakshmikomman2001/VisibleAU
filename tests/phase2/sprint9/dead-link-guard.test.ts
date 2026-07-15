import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import path from "path";

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
const COMPONENTS_DIR = path.resolve("components");

const SCAN_DIRS = [APP_DIR, COMPONENTS_DIR];

const WAIVER: Record<string, string> = {};

function collectTsxFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) files.push(full);
    }
  }
  walk(dir);
  return files;
}

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
    const withDynamic = [
      ...parts.slice(0, i),
      `[${parts[i]}]`,
      ...parts.slice(i + 1),
    ].join("/");
    const dynamicDir = path.join(APP_DIR, "brands/[brandId]", withDynamic);
    if (existsSync(path.join(dynamicDir, "page.tsx"))) return true;
    if (existsSync(path.join(dynamicDir, "page.ts"))) return true;
  }
  return false;
}

describe("dead-link guard (F18/F19 class prevention)", () => {
  const files = SCAN_DIRS.flatMap((dir) => collectTsxFiles(dir));

  it("scans both app/ and components/ (sanity)", () => {
    const appFiles = files.filter((f) => f.includes("app"));
    const componentFiles = files.filter((f) => f.includes("components"));
    expect(appFiles.length).toBeGreaterThan(10);
    expect(componentFiles.length).toBeGreaterThan(10);
  });

  it("all brand-scoped hrefs resolve to existing pages", () => {
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const hrefs = extractBrandScopedHrefs(content);

      for (const href of hrefs) {
        const cleanHref = href
          .replace(/\?.*$/, "")
          .replace(/#.*$/, "");

        if (!cleanHref || cleanHref.includes("${")) continue;

        const waiverKey = `${path.relative(process.cwd(), file)}:${cleanHref}`;
        if (Object.keys(WAIVER).some((k) => waiverKey.includes(k))) continue;

        if (!routeSegmentExists(cleanHref)) {
          const rel = path.relative(process.cwd(), file);
          violations.push(
            `${rel} → /brands/{id}/${cleanHref} (no page.tsx found)`,
          );
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
