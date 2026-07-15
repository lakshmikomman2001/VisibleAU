import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

/**
 * ENVELOPE-UNWRAP GUARD: prevents the F11/F15/F16/F17 bug class.
 *
 * Routes that return wrapped envelopes (e.g. { gaps: [...] }) must have
 * their named key extracted — NOT be consumed via raw `res.json()` or
 * guarded only by `Array.isArray(raw)` (which is always false on objects).
 *
 * Registry of known envelope routes and their keys:
 */

const PAGES_DIR = path.resolve("app/(auth)");

const ENVELOPE_ROUTES: Record<string, string> = {
  "/topical-gaps": "gaps",
  "/latest-audit": "audit",
  "/journeys": "journeys",
  "/agent-readiness": "latest",
};

const KNOWN_VIOLATIONS: Record<string, string> = {};

function collectPageFiles(dir: string): string[] {
  const files: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
        files.push(full);
      }
    }
  }
  walk(dir);
  return files;
}

describe("envelope-unwrap guard (F11/F15/F16/F17 class prevention)", () => {
  const pages = collectPageFiles(PAGES_DIR);

  it("finds page files to scan (sanity)", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  for (const [routeSuffix, envelopeKey] of Object.entries(ENVELOPE_ROUTES)) {
    it(`pages fetching ${routeSuffix} extract the "${envelopeKey}" key`, () => {
      const violations: string[] = [];

      for (const pageFile of pages) {
        const content = readFileSync(pageFile, "utf-8");
        if (!content.includes(routeSuffix)) continue;

        const hasUnwrap =
          content.includes(`?.${envelopeKey}`) ||
          content.includes(`.${envelopeKey}`) ||
          content.includes(`["${envelopeKey}"]`);

        if (!hasUnwrap) {
          const rel = path.relative(process.cwd(), pageFile);
          const waiverKey = `${rel.replace(/\\/g, "/")}:${routeSuffix}`;
          const shortKey = Object.keys(KNOWN_VIOLATIONS).find((k) =>
            waiverKey.includes(k),
          );
          if (shortKey) continue;

          violations.push(
            `${rel} — fetches ${routeSuffix} but never extracts ".${envelopeKey}"`,
          );
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `ENVELOPE-UNWRAP: response from "${routeSuffix}" wraps data in { ${envelopeKey}: [...] }.\n` +
            `These pages fetch it but never unwrap:\n` +
            violations.map((v) => `  - ${v}`).join("\n") +
            `\n\nFix: (await res.json())?.${envelopeKey} ?? defaultValue`,
        );
      }
    });
  }

  it("known-violation waivers are still valid (stale waivers fail)", () => {
    for (const key of Object.keys(KNOWN_VIOLATIONS)) {
      const [fileSuffix, route] = key.split(":");
      const matchingPage = pages.find((p) =>
        p.replace(/\\/g, "/").includes(fileSuffix),
      );
      expect(
        matchingPage,
        `Waiver "${key}" references a page that no longer exists — remove it`,
      ).toBeTruthy();

      if (matchingPage) {
        const content = readFileSync(matchingPage, "utf-8");
        const envelopeKey = ENVELOPE_ROUTES[route];
        const hasUnwrap =
          content.includes(`?.${envelopeKey}`) ||
          content.includes(`.${envelopeKey}`);
        if (hasUnwrap) {
          throw new Error(
            `STALE-WAIVER: "${key}" is now properly unwrapped — remove the waiver`,
          );
        }
      }
    }
  });
});
