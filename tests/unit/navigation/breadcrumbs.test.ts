/**
 * 6 Nov (phone-layout follow-ups, item 4) -- every signed-in page's breadcrumb
 * (lib/navigation/breadcrumbs.ts): the last part is the page itself, never the
 * bare "Workspace" most pages used to fall back to (which then claimed to be the
 * current page), and every part before it links to a page that exists.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { brandCrumb, breadcrumbsForPath, CRUMB } from "@/lib/navigation/breadcrumbs";

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
