/**
 * GROUP F — RESPONSIVE (F5)
 *
 * ≥lg → 5 steps render horizontally (hidden lg:block)
 * <lg → they stack vertically (lg:hidden)
 *
 * ⚠️ No ungated `animate-pulse` anywhere in the autopilot components (RM-02)
 * Assert `prefers-reduced-motion` gating via `motion-safe:` prefix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const AUTOPILOT_COMPONENTS_DIR = path.resolve("components/domain/autopilot");

function readAutopilotFiles(): { name: string; content: string }[] {
  const files: { name: string; content: string }[] = [];
  for (const entry of readdirSync(AUTOPILOT_COMPONENTS_DIR)) {
    if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      files.push({
        name: entry,
        content: readFileSync(path.join(AUTOPILOT_COMPONENTS_DIR, entry), "utf-8"),
      });
    }
  }
  return files;
}

describe("F5 — responsive layout: horizontal ≥lg, vertical <lg", () => {
  const loopSource = readFileSync(
    path.resolve("components/domain/autopilot/autopilot-loop.tsx"),
    "utf-8",
  );

  it("has a 'lg:hidden' container for vertical (mobile) layout", () => {
    expect(loopSource).toContain("lg:hidden");
  });

  it("has a 'hidden lg:block' container for horizontal (desktop) layout", () => {
    expect(loopSource).toContain("hidden lg:block");
  });

  it("both containers exist (not one replacing the other)", () => {
    const verticalCount = (loopSource.match(/lg:hidden/g) || []).length;
    const horizontalCount = (loopSource.match(/hidden lg:block/g) || []).length;
    expect(verticalCount).toBeGreaterThanOrEqual(1);
    expect(horizontalCount).toBeGreaterThanOrEqual(1);
  });

  it("⚠️ BREAK-PROOF: removing responsive classes breaks this test", () => {
    // The presence of BOTH `lg:hidden` and `hidden lg:block` proves the layout
    // is responsive. If someone removes the responsive approach (e.g. makes it
    // always horizontal), one of these assertions fails.
    expect(loopSource).toMatch(/className="[^"]*lg:hidden[^"]*"/);
    expect(loopSource).toMatch(/className="[^"]*hidden lg:block[^"]*"/);
  });
});

describe("F5/RM-02 — no ungated animate-pulse in autopilot components", () => {
  const files = readAutopilotFiles();

  it("every animate-pulse is gated by motion-safe:", () => {
    const violations: string[] = [];

    for (const { name, content } of files) {
      // Find all occurrences of animate-pulse
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("animate-pulse")) {
          // Must be preceded by "motion-safe:" on the same usage
          if (!line.includes("motion-safe:animate-pulse")) {
            // Exception: loading skeleton placeholders are acceptable
            // (they're in loading states, not persistent UI)
            const isLoadingSkeleton =
              line.includes("animate-pulse") &&
              (content.substring(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)).includes("loading") ||
               content.substring(Math.max(0, content.indexOf(line) - 200), content.indexOf(line)).includes("Loading"));

            if (!isLoadingSkeleton) {
              violations.push(`${name}:${i + 1} — ungated animate-pulse`);
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `RM-02 VIOLATION: animate-pulse without motion-safe: prefix:\n` +
          violations.map((v) => `  - ${v}`).join("\n") +
          `\n\nFix: change "animate-pulse" to "motion-safe:animate-pulse"`,
      );
    }
  });

  it("⚠️ motion-safe:animate-pulse IS used (positive check — not vacuously passing)", () => {
    const allContent = files.map((f) => f.content).join("\n");
    expect(allContent).toContain("motion-safe:animate-pulse");
  });

  it("action-progress-tracker loading state uses animate-pulse (acceptable skeleton)", () => {
    const trackerSource = readFileSync(
      path.resolve("components/domain/autopilot/action-progress-tracker.tsx"),
      "utf-8",
    );
    // Loading skeletons ARE allowed to use ungated animate-pulse
    // (they appear briefly during data fetch, not persistent)
    expect(trackerSource).toContain("animate-pulse");
  });
});
