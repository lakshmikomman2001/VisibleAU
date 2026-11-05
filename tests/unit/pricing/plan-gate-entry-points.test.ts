/**
 * 6 Nov (Sri: "No link may lead to a 403") -- every gate in tests/helpers/plan-gates.ts
 * that checks a lib/pricing/tiers.ts feature, and the seat limit, is reached from a
 * page that shows the locked card on a plan without it, or is listed as API-only with
 * a reason. And nothing in the app links to those pages except through PlanGatedLink
 * (components/domain/pricing/plan-lock.tsx), which shows the lock and the plan's name.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_FEATURE_PAGE } from "@/components/domain/pricing/plan-lock";
import type { PlanFeature } from "@/lib/pricing/tiers";
import { PLAN_FEATURE_GATES, PLAN_GATE_ENTRY_POINTS, SEAT_GATE } from "@/tests/helpers/plan-gates";

const ROOT = join(__dirname, "../../..");
const code = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** Code without its comments: a path in a comment links nowhere. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** "app/(auth)/agency/bulk/page.tsx" -> "/agency/bulk". */
function routeOf(page: string): string {
  return `/${page
    .replace(/^app\//, "")
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .join("/")}`;
}

/** The feature a gate checks: the one it passes to planFeatureRefusal or workspaceHasFeature. */
function featureOf(gate: string): PlanFeature {
  const match = withoutComments(code(gate)).match(
    /(?:planFeatureRefusal|workspaceHasFeature)\([^)]*?"(\w+)"\s*,?\s*\)/,
  );
  if (!match) throw new Error(`${gate} checks no plan feature`);
  return match[1] as PlanFeature;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(rel);
  }
  return out;
}

const ENTRIES = Object.entries(PLAN_GATE_ENTRY_POINTS);
const PAGED = ENTRIES.filter(
  (entry): entry is [string, { page: string }] => "page" in entry[1] && entry[0] !== SEAT_GATE,
);

describe("each plan-feature gate is reached from a locked page, or from no page", () => {
  it("the list covers every plan-feature gate and the seat limit, and nothing else", () => {
    expect(ENTRIES.map(([gate]) => gate).sort()).toEqual([...PLAN_FEATURE_GATES, SEAT_GATE].sort());
  });

  it.each(PAGED)("%s: its page shows the locked card for the same feature", (gate, { page }) => {
    const feature = featureOf(gate);
    expect(existsSync(join(ROOT, page)), page).toBe(true);
    const src = withoutComments(code(page));
    // A server page: the plan is checked before anything is sent, so there's no 403 to see.
    expect(src, `${page} is a client component`).not.toMatch(/^\s*["']use client["']/);
    expect(src).toMatch(new RegExp(`<PlanLocked(?:Page|Card)\\b[^>]*\\bfeature="${feature}"`, "s"));
    expect(PLAN_FEATURE_PAGE[feature as keyof typeof PLAN_FEATURE_PAGE]).toBe(routeOf(page));
  });

  it.each(
    ENTRIES.filter((entry): entry is [string, { apiOnly: string }] => "apiOnly" in entry[1]),
  )("%s is API-only, and says why", (gate, { apiOnly }) => {
    expect(apiOnly.length).toBeGreaterThan(20);
    if (!gate.startsWith("app/api/")) return;
    // Truly no page: nothing in the app calls it.
    const url = gate.replace(/^app\/api/, "/api").replace(/\/route\.ts$/, "");
    const callers = [...sourceFiles("app"), ...sourceFiles("components")].filter(
      (file) => !file.startsWith("app/api/") && withoutComments(code(file)).includes(url),
    );
    expect(callers).toEqual([]);
  });

  it("every feature with a page is gated, and every gated feature has a page or is API-only", () => {
    const gated = new Set(PAGED.map(([gate]) => featureOf(gate)));
    expect([...gated].sort()).toEqual(Object.keys(PLAN_FEATURE_PAGE).sort());
  });
});

describe("the seat limit", () => {
  it("the team page shows the seats used against the plan's, and a way to more", () => {
    const entry = PLAN_GATE_ENTRY_POINTS[SEAT_GATE];
    expect("page" in entry).toBe(true);
    const src = withoutComments(code((entry as { page: string }).page));
    expect(src).toMatch(/seatUsageText\(/);
    expect(src).toMatch(/seatLimitFor\(/);
    expect(src).toMatch(/href="\/pricing"/);
    // The plan rule is the seat count, not a second copy of who gets a team.
    expect(src).not.toMatch(/TierGate|isTierAtLeast|TIER_SEAT_LIMITS/);
  });
});

describe("no link to a paid feature's page bypasses the lock", () => {
  const files = [...sourceFiles("app"), ...sourceFiles("components")].filter(
    (file) => file !== "components/domain/pricing/plan-lock.tsx",
  );

  it.each(Object.entries(PLAN_FEATURE_PAGE))("%s (%s)", (_feature, path) => {
    const link = new RegExp(
      `(?:href\\s*[=:]\\s*\\{?\\s*|push\\(\\s*)["'\`]${path.replace(/\//g, "\\/")}(?:["'\`?#/])`,
    );
    const raw = files.filter((file) => link.test(withoutComments(code(file))));
    expect(raw, `link through PlanGatedLink instead: ${raw.join(", ")}`).toEqual([]);
  });

  it("every PlanGatedLink names a feature with a page", () => {
    for (const file of files) {
      for (const match of withoutComments(code(file)).matchAll(
        /<PlanGatedLink\b[^>]*?\bfeature=(?:"(\w+)"|\{([^}]+)\})/gs,
      )) {
        if (match[1]) expect(Object.keys(PLAN_FEATURE_PAGE), file).toContain(match[1]);
      }
    }
  });
});
