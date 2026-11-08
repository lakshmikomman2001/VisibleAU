/**
 * 6 Nov (Sri: "No link may lead to a 403") -- every gate in tests/helpers/plan-gates.ts
 * that checks a lib/pricing/tiers.ts feature, and the seat limit, is reached from a
 * page that shows the locked card on a plan without it, or is listed as API-only with
 * a reason. And nothing in the app links to those pages except through PlanGatedLink
 * (components/domain/pricing/plan-lock.tsx), which shows the lock and the plan's name.
 *
 * 8 Nov (Sri: "no page shows a raw 403 or an empty error") -- and every brand-feature
 * route (its plan from lib/pricing/brand-features.ts) is called only from files that lock
 * by a feature at least as dear before they fetch it, and read a refusal through the one
 * handler, or from nowhere, and why.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_FEATURE_PAGE } from "@/components/domain/pricing/plan-lock";
import {
  BRAND_FEATURES,
  type BrandFeature,
  brandFeaturePlan,
  isBrandFeature,
} from "@/lib/pricing/brand-features";
import { type PlanFeature, tierRank } from "@/lib/pricing/tiers";
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

/** Every route that reads its plan from lib/pricing/brand-features.ts. */
const BRAND_ROUTES = sourceFiles("app/api")
  .filter((file) => /\/route\.ts$/.test(file) && /\bbrandFeaturePlan\(/.test(code(file)))
  .sort();

describe("each plan-feature gate is reached from a locked page, or from no page", () => {
  it("the list covers every plan-feature gate, the seat limit and every brand-feature route, and nothing else", () => {
    expect(ENTRIES.map(([gate]) => gate).sort()).toEqual(
      [...PLAN_FEATURE_GATES, SEAT_GATE, ...BRAND_ROUTES].sort(),
    );
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
    ENTRIES.filter(
      (entry): entry is [string, { apiOnly: string }] =>
        "apiOnly" in entry[1] && !BRAND_ROUTES.includes(entry[0]),
    ),
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

/** The one feature a brand-feature route reads its plan from (every brandFeaturePlan in it). */
function brandFeatureOf(route: string): BrandFeature {
  const named = [
    ...withoutComments(code(route)).matchAll(/brandFeaturePlan\(\s*"(\w+)"\s*\)/g),
  ].map((m) => m[1]);
  expect(new Set(named).size, `${route} names one feature`).toBe(1);
  const feature = named[0];
  if (!isBrandFeature(feature)) throw new Error(`${route}: ${feature} isn't a brand feature`);
  return feature;
}

/**
 * The route's URL as the app writes it: "/api/brands/${brandId}/tasks/${taskId}/complete", any
 * expression in a dynamic segment, ended by a quote or a query.
 */
function urlPattern(route: string): RegExp {
  const segments = route
    .replace(/^app\/api\//, "")
    .replace(/\/route\.ts$/, "")
    .split("/")
    .map((segment) =>
      /^\[.+\]$/.test(segment) ? "\\$\\{[^}]+\\}" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
  return new RegExp(`/api/${segments.join("/")}(?=[\`"'?])`);
}

const APP_FILES = [...sourceFiles("app"), ...sourceFiles("components")].filter(
  (file) => !file.startsWith("app/api/"),
);

/** Files in the app that call the route, found by its URL. */
function callersOf(route: string): string[] {
  const url = urlPattern(route);
  return APP_FILES.filter((file) => url.test(withoutComments(code(file)))).sort();
}

const BRAND_ENTRIES = BRAND_ROUTES.map(
  (route) => [route, PLAN_GATE_ENTRY_POINTS[route]] as const,
).filter((entry): entry is readonly [string, { callers: Record<string, BrandFeature> }] =>
  Boolean(entry[1] && "callers" in entry[1]),
);

describe("each brand-feature route is called only from files that lock first", () => {
  it("there are brand-feature routes, and the URL finder finds a known caller", () => {
    expect(BRAND_ROUTES.length).toBeGreaterThanOrEqual(40);
    expect(callersOf("app/api/brands/[brandId]/consensus-score/route.ts")).toEqual([
      "app/(auth)/brands/[brandId]/trust/consensus/page.tsx",
    ]);
  });

  it.each(BRAND_ROUTES)("%s: every caller is listed, or none and why", (route) => {
    const entry = PLAN_GATE_ENTRY_POINTS[route];
    brandFeatureOf(route);
    if ("apiOnly" in entry) {
      expect(entry.apiOnly.length).toBeGreaterThan(20);
      expect(callersOf(route)).toEqual([]);
    } else {
      expect("callers" in entry, `${route}: callers or apiOnly`).toBe(true);
      if ("callers" in entry) expect(callersOf(route)).toEqual(Object.keys(entry.callers).sort());
    }
  });

  it.each(
    BRAND_ENTRIES.flatMap(([route, { callers }]) =>
      Object.entries(callers).map(([file, lock]) => [route, file, lock] as const),
    ),
  )("%s from %s: locks by %s first, at a plan the route allows", (route, file, lock) => {
    const src = withoutComments(code(file));
    // The lock is the shared one, which fetches nothing on a plan without it and reads a refusal...
    expect(src).toContain(`useBrandFeatureGate("${lock}")`);
    expect(src).toMatch(/\bplanRefused\b|\.planRefused\(/);
    // ...never a 403 of its own, which a role or a missing brand also answers.
    expect(src).not.toMatch(/\.status\s*===\s*403/);
    expect(src).not.toContain("phase2/tier-gate");
    // On every plan where the file fetches, the route answers.
    expect(tierRank(brandFeaturePlan(lock))).toBeGreaterThanOrEqual(
      tierRank(brandFeaturePlan(brandFeatureOf(route))),
    );
  });

  it("every brand feature is a route's or a page's", () => {
    const shipped = APP_FILES.map((file) => withoutComments(code(file))).join("\n");
    const routes = BRAND_ROUTES.map((route) => withoutComments(code(route))).join("\n");
    for (const feature of Object.keys(BRAND_FEATURES)) {
      expect(`${shipped}\n${routes}`, feature).toContain(`"${feature}"`);
    }
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
