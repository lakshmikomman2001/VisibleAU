import { describe, expect, it } from "vitest";
import { readSourcesBeforeAll, sourceFiles, sourceText } from "@/tests/helpers/source-files";

/**
 * COMPONENT-MOUNT GUARD: every S9 "feature" component must be imported
 * by at least one page. Catches "built but never mounted" (F12 class).
 *
 * Uses the same set-difference pattern as the NAV-ORPHAN guard (F10).
 */

const APP_DIR = "app";
const COMPONENTS_DIR = "components/domain";

// One walk of both trees per file, cached (tests/helpers/source-files.ts); each test reads the cache.
readSourcesBeforeAll([APP_DIR, COMPONENTS_DIR]);

const S9_FEATURE_COMPONENTS: Record<string, string> = {
  "health-check-panel": "components/domain/autopilot/health-check-panel.tsx",
  "autopilot-loop": "components/domain/autopilot/autopilot-loop.tsx",
  "persona-dashboard": "components/domain/autopilot/persona-dashboard.tsx",
  "prompt-trend-sparkline": "components/domain/autopilot/prompt-trend-sparkline.tsx",
};

const WAIVER: Record<string, string> = {};

function findImportersInDir(dir: string, symbolName: string, excludePath: string): string[] {
  const pattern = new RegExp(symbolName, "i");
  return sourceFiles([dir])
    .filter((file) => /\.tsx?$/.test(file.path) && file.path !== excludePath)
    .filter((file) => pattern.test(file.text))
    .map((file) => file.path);
}

describe("component-mount guard (F12 class prevention)", () => {
  for (const [name, filePath] of Object.entries(S9_FEATURE_COMPONENTS)) {
    it(`${name} is imported by at least one page (or has a waiver)`, () => {
      if (name in WAIVER) {
        return;
      }

      const source = sourceText(filePath);
      const pascalMatch = source.match(/export\s+(?:function|const)\s+([A-Z]\w+)/);
      const anyMatch = source.match(/export\s+(?:function|const)\s+(\w+)/);
      const symbolName = pascalMatch?.[1] ?? anyMatch?.[1] ?? name;

      const importers = findImportersInDir(APP_DIR, symbolName, filePath);
      const componentImporters = findImportersInDir(COMPONENTS_DIR, symbolName, filePath);
      const allImporters = [...importers, ...componentImporters].filter((f) => !f.includes("test"));

      if (allImporters.length === 0) {
        throw new Error(
          `MOUNT-ORPHAN: "${name}" (exports ${symbolName}) is not imported by any page or component.\n` +
            `File: ${filePath}\n` +
            `Fix: mount it in the appropriate page, OR add a waiver with a reason.`,
        );
      }
    });
  }

  it("waiver entries still point to real component files", () => {
    for (const name of Object.keys(WAIVER)) {
      expect(
        Object.keys(S9_FEATURE_COMPONENTS),
        `Waiver "${name}" references a component not in the guard list — remove it`,
      ).toContain(name);
    }
  });

  it("waivers are still orphaned (stale waivers fail)", () => {
    for (const name of Object.keys(WAIVER)) {
      const filePath = S9_FEATURE_COMPONENTS[name];
      const source = sourceText(filePath);
      const pascalMatch = source.match(/export\s+(?:function|const)\s+([A-Z]\w+)/);
      const anyMatch = source.match(/export\s+(?:function|const)\s+(\w+)/);
      const symbolName = pascalMatch?.[1] ?? anyMatch?.[1] ?? name;

      const importers = findImportersInDir(APP_DIR, symbolName, filePath);
      const allImporters = importers.filter((f) => !f.includes("test"));

      if (allImporters.length > 0) {
        throw new Error(
          `STALE-WAIVER: "${name}" now HAS importers — remove the waiver:\n` +
            allImporters.map((f) => `  - ${f}`).join("\n"),
        );
      }
    }
  });
});
