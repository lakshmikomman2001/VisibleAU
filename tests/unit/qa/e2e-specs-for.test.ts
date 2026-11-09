/**
 * Playwright-run follow-ups (9 Nov), part 6 -- `vitest related` never selects a Playwright spec, so a copy or
 * route change broke e2e specs unnoticed: 3176980 changed how the invite banner masks two addresses and the
 * session spec still built the old text (S2). scripts/qa/e2e-specs-for.ts lists the specs a change can break:
 * by import, by the route a changed page serves, and by a visible string the change adds or removes.
 */
import { describe, expect, it } from "vitest";
import {
  type ChangedFile,
  configFor,
  listSpecs,
  routeOf,
  routePattern,
  specsFor,
  visibleStrings,
} from "@/scripts/qa/e2e-specs-for";

describe("the route a changed file serves", () => {
  it.each([
    ["app/(auth)/settings/team/page.tsx", "/settings/team"],
    ["app/(auth)/brands/[brandId]/reports/page.tsx", "/brands/[brandId]/reports"],
    ["app/api/auth/workspace/route.ts", "/api/auth/workspace"],
    ["app/(marketing)/pricing/page.tsx", "/pricing"],
    ["app/(auth)/layout.tsx", "/"],
    ["app/invite/[orgId]/[token]/invite-client.tsx", null],
    ["components/domain/app-shell.tsx", null],
  ])("%s -> %s", (file, route) => {
    expect(routeOf(file)).toBe(route);
  });

  it("a dynamic segment matches a literal id or a template expression, and only a whole path", () => {
    const reports = routePattern("/brands/[brandId]/reports");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a spec's source text, quoted as it is
    expect(reports.test("await page.goto(`/brands/${brandId}/reports`);")).toBe(true);
    expect(reports.test('page.goto("/brands/abc-123/reports")')).toBe(true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a spec's source text, quoted as it is
    expect(reports.test("page.goto(`/brands/${brandId}/reports/${id}`)")).toBe(false);
    const brands = routePattern("/brands");
    expect(brands.test('page.goto("/brands")')).toBe(true);
    expect(brands.test('page.goto("/brands-list")')).toBe(false);
    expect(routePattern("/brands", { prefix: true }).test('goto("/brands/new")')).toBe(true);
  });
});

describe("visible strings in a diff", () => {
  it("keeps JSX text and multi-word literals, not class lists, imports or code", () => {
    const found = visibleStrings(
      [
        "<p>Reports is part of the Growth plan</p>",
        '<button className="rounded-md bg-primary px-4 py-2">Create brand</button>',
        'setError("Failed to create brand");',
        'import { x } from "@/lib/reports/report-sections";',
        'const href = "https://vunnara.com.au/pricing";',
      ].join("\n"),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        "Reports is part of the Growth plan",
        "Create brand",
        "Failed to create brand",
      ]),
    );
    expect(found).not.toContain("rounded-md bg-primary px-4 py-2");
    expect(found.some((s) => s.includes("@/lib"))).toBe(false);
    expect(found.some((s) => s.includes("https:"))).toBe(false);
  });
});

describe("which specs a change can break", () => {
  const files: Record<string, string> = {
    "tests/e2e/session/session-states.spec.ts": [
      'import { maskEmailsDistinct } from "@/lib/email/mask";',
      'import { e2eDatabaseUrl } from "../helpers/e2e-database";',
      "await page.goto(invitePath);",
      'await expect(page.getByText("Sign out and continue")).toBeVisible();',
    ].join("\n"),
    "tests/e2e/sprint4/sprint4-reports.spec.ts": [
      // biome-ignore lint/suspicious/noTemplateCurlyInString: a spec's source text, quoted as it is
      "await page.goto(`/brands/${brandId}/reports`);",
      'await expect(page.getByText("Reports is part of the Growth plan")).toBeVisible();',
    ].join("\n"),
    "tests/e2e/helpers/e2e-database.ts": 'import { x } from "../../../scripts/db/local-db-guard";',
    "tests/e2e/01-auth.spec.ts":
      'import { y } from "./helpers/spec-account";\nawait page.goto("/dashboard");',
    "tests/e2e/helpers/spec-account.ts": 'import { e2eDatabaseUrl } from "./e2e-database";',
  };
  const read = (p: string) => {
    if (p in files) return files[p];
    throw new Error(`no file ${p}`);
  };
  const specs = Object.keys(files).filter((p) => p.endsWith(".spec.ts"));
  const run = (changed: ChangedFile[]) => specsFor(changed, specs, read);

  it("a spec that imports the changed file", () => {
    const found = run([{ path: "lib/email/mask.ts", changedText: "" }]);
    expect(found.map((m) => m.spec)).toEqual(["tests/e2e/session/session-states.spec.ts"]);
    expect(found[0].reasons).toEqual(["imports lib/email/mask.ts"]);
  });

  it("through a helper under tests/", () => {
    const found = run([{ path: "scripts/db/local-db-guard.ts", changedText: "" }]);
    expect(found.map((m) => m.spec)).toEqual([
      "tests/e2e/01-auth.spec.ts",
      "tests/e2e/session/session-states.spec.ts",
    ]);
  });

  it("a spec that names the route a changed page serves", () => {
    const found = run([{ path: "app/(auth)/brands/[brandId]/reports/page.tsx", changedText: "" }]);
    expect(found.map((m) => m.spec)).toEqual(["tests/e2e/sprint4/sprint4-reports.spec.ts"]);
    expect(found[0].reasons).toEqual(["names /brands/[brandId]/reports"]);
  });

  it("a spec that quotes a string the diff changes (the S2 case)", () => {
    const found = run([
      {
        path: "components/domain/pricing/plan-lock.tsx",
        changedText: "<p>Reports is part of the Growth plan</p>",
      },
    ]);
    expect(found.map((m) => m.spec)).toEqual(["tests/e2e/sprint4/sprint4-reports.spec.ts"]);
    expect(found[0].reasons[0]).toBe('contains "Reports is part of the Growth plan"');
  });

  it("nothing for a change no spec touches", () => {
    expect(run([{ path: "lib/scoring/measured.ts", changedText: "const x = 1;" }])).toEqual([]);
  });
});

describe("in this repo", () => {
  it("lists the Playwright specs, none archived, each with the config it runs under", () => {
    const specs = listSpecs();
    expect(specs).toContain("tests/e2e/session/session-states.spec.ts");
    expect(specs).toContain("tests/e2e/01-auth.spec.ts");
    expect(specs.some((s) => s.includes("/_archive/") || s.includes("node_modules"))).toBe(false);
    expect(configFor("tests/e2e/01-auth.spec.ts")).toBe("playwright.config.ts");
    expect(configFor("tests/e2e/sprint8/s8-governance-e2e.spec.ts")).toBe(
      "tests/e2e/sprint8/playwright.config.ts",
    );
  });
});
