/**
 * 6 Nov (phone-layout follow-ups, item 4) -- every signed-in page's breadcrumb
 * (lib/navigation/breadcrumbs.ts): the last part is the page itself, never the
 * bare "Workspace" most pages used to fall back to (which then claimed to be the
 * current page), and every part before it links to a page that exists.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_TITLES,
  brandCrumb,
  breadcrumbsForPath,
  CRUMB,
} from "@/lib/navigation/breadcrumbs";

const AUTH = join(__dirname, "../../../app/(auth)");

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routes(full));
    else if (entry === "page.tsx") out.push(`/${relative(AUTH, dir).split(sep).join("/")}`);
  }
  return out;
}

const ROUTES = routes(AUTH);
const ID = "11111111-1111-4111-8111-111111111111";

/** A route with sample ids in its dynamic segments. */
const sample = (route: string) => route.replace(/\[[^\]]+\]/g, ID);

/** Whether a path is one of the app's pages. */
function isPage(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  return ROUTES.some((route) => {
    const r = route.split("/").filter(Boolean);
    return (
      r.length === parts.length && r.every((seg, i) => seg.startsWith("[") || seg === parts[i])
    );
  });
}

describe("every signed-in page's breadcrumb", () => {
  it.each(ROUTES)("%s: parents link to real pages; the last part is the page", (route) => {
    const crumbs = breadcrumbsForPath(sample(route));
    const current = crumbs[crumbs.length - 1];
    expect(current.href).toBeUndefined();
    for (const parent of crumbs.slice(0, -1)) {
      expect(parent.href, `${route}: "${parent.label}"`).toBeDefined();
      expect(isPage(parent.href as string), `${route}: ${parent.href}`).toBe(true);
    }
    if (route !== "/settings") expect(crumbs.length, route).toBeGreaterThan(1);
    expect(current.label, route).not.toBe("Workspace");
  });

  it("the shared parts and a brand's own link", () => {
    expect(CRUMB.workspace).toEqual({ label: "Workspace", href: "/dashboard" });
    expect(brandCrumb({ id: ID, name: "Bondi Plumbing" })).toEqual({
      label: "Bondi Plumbing",
      href: `/brands/${ID}`,
    });
  });
});

describe("breadcrumbsForPath", () => {
  it.each([
    ["/dashboard", ["Workspace", "Overview"]],
    ["/brands", ["Workspace", "Brands"]],
    ["/brands/wizard", ["Workspace", "Brands", "Add brand"]],
    [`/brands/${ID}`, ["Workspace", "Brands", "Detail"]],
    [`/brands/${ID}/trust`, ["Workspace", "Brands", "Brand", "Trust"]],
    [`/brands/${ID}/trust/consensus`, ["Workspace", "Brands", "Brand", "Trust", "Consensus"]],
    [`/brands/${ID}/reports/${ID}`, ["Workspace", "Brands", "Brand", "Reports", "Report"]],
    ["/audits/compare", ["Workspace", "Audits", "Compare"]],
    ["/agency/bulk", ["Workspace", "Agency", "Bulk operations"]],
    ["/agency/reports/pdf-builder", ["Workspace", "Agency", "PDF Builder"]],
    // Named as the sidebar names the group.
    ["/settings", ["Account"]],
    ["/settings/team", ["Account", "Team"]],
    ["/settings/report-branding", ["Account", "Report branding"]],
    ["/drift-alerts", ["Workspace", "Drift Alerts"]],
    [`/organizations/${ID}/report-templates`, ["Workspace", "Report templates"]],
  ])("%s: %j", (path, labels) => {
    expect(breadcrumbsForPath(path).map((c) => c.label)).toEqual(labels);
  });

  /**
   * 14 Nov, part 6 (Sri: /brands/[id]/reports said "Brand") -- under a brand, once its layout has named it, every
   * page's breadcrumb says the brand's name, never "Brand" or "Detail" for the brand itself.
   */
  const BRAND_ROUTES = ROUTES.filter((route) => route.startsWith("/brands/[brandId]"));
  const HERO = { id: ID, name: "Hero Home Services" };

  it("there are brand pages to check", () => {
    expect(BRAND_ROUTES.length).toBeGreaterThan(30);
  });

  it.each(BRAND_ROUTES)("%s: names the brand", (route) => {
    const crumbs = breadcrumbsForPath(sample(route), { brand: HERO });
    const labels = crumbs.map((c) => c.label);
    expect(labels).toContain("Hero Home Services");
    expect(labels).not.toContain("Brand");
    expect(labels.slice(0, 3)).toEqual(["Workspace", "Brands", "Hero Home Services"]);
  });

  it("the reports page: Workspace / Brands / Hero Home Services / Reports; another brand's name is never used", () => {
    expect(
      breadcrumbsForPath(`/brands/${ID}/reports`, { brand: HERO }).map((c) => c.label),
    ).toEqual(["Workspace", "Brands", "Hero Home Services", "Reports"]);
    const other = { id: "22222222-2222-4222-8222-222222222222", name: "Other Brand" };
    expect(
      breadcrumbsForPath(`/brands/${ID}/reports`, { brand: other }).map((c) => c.label),
    ).toEqual(["Workspace", "Brands", "Brand", "Reports"]);
  });

  it("a brand's sub-page links back to the brand and its section", () => {
    expect(breadcrumbsForPath(`/brands/${ID}/trust/consensus`).map((c) => c.href)).toEqual([
      "/dashboard",
      "/brands",
      `/brands/${ID}`,
      `/brands/${ID}/trust`,
      undefined,
    ]);
  });
});

/**
 * 13 Nov, part 1 -- /admin/costs's breadcrumb said "Operator settings" (its heading is "Provider costs"). Each /admin
 * page's title is one value (ADMIN_PAGE_TITLES): its breadcrumb's last part, and its <h1> renders it. The rendered
 * headings: tests/unit/admin/operator-costs-plan-price.test.tsx and tests/unit/api/admin-settings.test.tsx.
 */
describe("each /admin page: the breadcrumb names it as its heading does", () => {
  const ADMIN = ROUTES.filter((route) => route.startsWith("/admin/")).sort();

  it("every /admin page has a title (a new one can't fall back to another page's name)", () => {
    expect(ADMIN).toEqual(["/admin/audits", "/admin/costs", "/admin/reports", "/admin/settings"]);
    for (const route of ADMIN) {
      expect(Object.keys(ADMIN_PAGE_TITLES), route).toContain(route.split("/")[2]);
    }
  });

  it.each([
    ["/admin/settings", "Operator settings", "components/domain/admin/google-surfaces-admin.tsx"],
    ["/admin/costs", "Provider costs", "components/domain/admin/operator-costs.tsx"],
    // 14 Nov, part 5.
    ["/admin/audits", "Trend exclusions", "components/domain/admin/trend-exclusions-admin.tsx"],
    // 14 Nov, part 6.
    ["/admin/reports", "PDF failures", "components/domain/admin/report-failures-admin.tsx"],
  ])('%s: the breadcrumb ends "%s", the heading in %s', (route, title, view) => {
    const segment = route.split("/")[2] as keyof typeof ADMIN_PAGE_TITLES;
    expect(ADMIN_PAGE_TITLES[segment]).toBe(title);
    expect(breadcrumbsForPath(route).map((c) => c.label)).toEqual(["Workspace", title]);
    const source = readFileSync(join(__dirname, "../../..", view), "utf8");
    expect(source).toMatch(
      new RegExp(`<h1[^>]*>\\s*\\{ADMIN_PAGE_TITLES\\.${segment}\\}\\s*</h1>`),
    );
  });
});
