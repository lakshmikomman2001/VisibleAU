/**
 * Every surface that shows a brand's or an audit's Visibility goes through
 * lib/scoring/visibility-display.ts -- the audit page's "8%" over "3 of
 * 40" -- and none reads the stored composite column or prints the mention
 * rate as a bare "7.5" (which read as the retired 0-100 score: "Last
 * score 7.5", "7.5 / 100"). A new surface belongs in SURFACES.
 *
 * tests/unit/governance/no-stale-composite-read.test.ts separately fences
 * every drizzle read of audits.scoreComposite.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

/** Code only: comments describe the old behaviour on purpose. */
function code(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SURFACES = [
  "app/(auth)/brands/page.tsx",
  "app/(auth)/dashboard/page.tsx",
  "app/(auth)/audits/page.tsx",
  "app/(auth)/audits/[auditId]/page.tsx",
  "app/(auth)/audits/compare/page.tsx",
  "app/(auth)/brands/[brandId]/page.tsx",
  "components/domain/brand/brand-detail-client.tsx",
  "app/(auth)/agency/page.tsx",
  "app/(auth)/portfolio/page.tsx",
  "app/(auth)/agency/reports/pdf-builder/page.tsx",
  "app/client-portal/[inviteToken]/page.tsx",
  "app/not-found.tsx",
  "app/api/brands/[brandId]/latest-audit/route.ts",
  "app/api/agency/bulk-export/route.ts",
  "lib/pdf/render.tsx",
  "lib/email/templates/audit-complete.ts",
  "lib/email/templates/weekly-digest.ts",
];

const FORBIDDEN: Array<[RegExp, string]> = [
  [/score_composite/, "reads the stored composite column"],
  [
    /(scoreComposite|headline\.value|headlineValue|latestScore|lastAuditScore|composite)\)?\.toFixed\(1\)/,
    "prints the mention rate as a bare one-decimal number",
  ],
  [/Last score/i, 'labels it "Last score"'],
  [/\/ ?100\b/, 'labels it "/100"'],
  [/scoreComposite \?\? 0\b/, "turns a missing Visibility into 0"],
];

describe("every Visibility surface uses the shared display", () => {
  for (const file of SURFACES) {
    it(file, () => {
      const src = code(file);
      expect(src, `${file} doesn't use lib/scoring/visibility-display.ts`).toMatch(
        /from "@\/(lib\/scoring\/visibility-display|components\/shared\/visibility-cell)"/,
      );
      for (const [pattern, why] of FORBIDDEN) {
        expect(src, `${file} ${why}`).not.toMatch(pattern);
      }
    });
  }

  it("the autopilot loop never turns a missing Visibility into 0", () => {
    expect(code("components/domain/autopilot/autopilot-loop.tsx")).not.toMatch(
      /scoreComposite \?\? 0/,
    );
  });

  it("no page, component or route reads score_composite in raw SQL", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) {
          const rel = relative(ROOT, full).replace(/\\/g, "/");
          if (/score_composite/.test(code(rel))) hits.push(rel);
        }
      }
    };
    walk(resolve(ROOT, "app"));
    walk(resolve(ROOT, "components"));
    expect(hits).toEqual([]);
  });
});
