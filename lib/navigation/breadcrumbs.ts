/**
 * 6 Nov (phone-layout follow-ups, item 4) -- the signed-in breadcrumb. Every part
 * before the last links to its page; the last is the page you're on (the top bar
 * marks it aria-current="page" and doesn't link it). The type holds that: a page
 * passing its own crumbs (SetBreadcrumbs) can't leave a parent without its href.
 */

export interface ParentCrumb {
  label: string;
  href: string;
}

export interface CurrentCrumb {
  label: string;
  href?: undefined;
}

export type Crumb = ParentCrumb | CurrentCrumb;

/** Parents (each with its page), then the page you're on. */
export type Breadcrumbs = readonly [...ParentCrumb[], CurrentCrumb];

/**
 * The parts most pages share. "Workspace" is the workspace's home, the Overview;
 * "Account" is /settings, named as the sidebar names that group (and as the product
 * says "Account → Report branding").
 */
export const CRUMB = {
  workspace: { label: "Workspace", href: "/dashboard" },
  brands: { label: "Brands", href: "/brands" },
  audits: { label: "Audits", href: "/audits" },
  agency: { label: "Agency", href: "/agency" },
  verticals: { label: "Vertical packs", href: "/verticals" },
  actionCenter: { label: "Action Center", href: "/action-center" },
  settings: { label: "Account", href: "/settings" },
} as const satisfies Record<string, ParentCrumb>;

/**
 * Each /admin page's title (13 Nov, part 1): its heading and its breadcrumb's last part, from this one place.
 * tests/unit/navigation/breadcrumbs.test.ts checks every /admin page has one, and that its heading uses it.
 */
export const ADMIN_PAGE_TITLES = {
  settings: "Operator settings",
  costs: "Provider costs",
} as const;

function adminTitle(segment: string | undefined): string {
  return segment !== undefined && Object.hasOwn(ADMIN_PAGE_TITLES, segment)
    ? ADMIN_PAGE_TITLES[segment as keyof typeof ADMIN_PAGE_TITLES]
    : "Operator";
}

/** A brand's own page, by its name. */
export function brandCrumb(brand: { id: string; name: string }): ParentCrumb {
  return { label: brand.name, href: `/brands/${brand.id}` };
}

/** What each page's path segment is called in the breadcrumb. */
const SEGMENT_LABELS: Record<string, string> = {
  // A brand's pages.
  "ai-discovery": "AI Discovery",
  "answer-capsules": "Answer Capsules",
  autopilot: "Autopilot",
  "brand-entity-audit": "Brand & Entity",
  discovery: "Discovery",
  comparisons: "Comparisons",
  journeys: "Journeys",
  "health-check": "Health check",
  "llms-txt-generator": "llms.txt generator",
  "meta-tags": "Meta Tags",
  reports: "Reports",
  retrieval: "Retrieval",
  "agent-analytics": "Agent analytics",
  "agent-readiness": "Agent readiness",
  "content-structure": "Content structure",
  "crawler-logs": "Crawler logs",
  "entity-home": "Entity home",
  llmstxt: "llms.txt",
  "robots-txt-config": "robots.txt + AI crawlers",
  schedule: "Schedule",
  "schema-audit": "Schema audit",
  signals: "Signals",
  "ssr-check": "SSR check",
  "technical-audit": "Technical Audit",
  trust: "Trust",
  "citation-sources": "Citation sources",
  consensus: "Consensus",
  "entity-score": "Entity score",
  evidence: "Evidence",
  hallucinations: "Hallucinations",
  "linkedin-presence": "LinkedIn presence",
  "youtube-presence": "YouTube presence",
  visibility: "Visibility",
  "citation-failure": "Citation failure",
  workflow: "Workflow",
  drafts: "Drafts",
  tasks: "Tasks",
  // Agency.
  branding: "Branding",
  bulk: "Bulk operations",
  "client-portals": "Client portals",
  "pdf-builder": "PDF Builder",
  schedules: "Schedules",
  // Settings.
  "audit-trail": "Audit Trail",
  billing: "Billing",
  "data-residency": "Data residency",
  notifications: "Notifications",
  "report-branding": "Report branding",
  team: "Team",
  webhooks: "Webhooks",
  // A workspace's own pages.
  "delivery-schedules": "Delivery schedules",
  "report-templates": "Report templates",
};

function labelFor(segment: string, fallback = "Detail"): string {
  return SEGMENT_LABELS[segment] ?? fallback;
}

/**
 * The breadcrumb for a path, until the page names itself (SetBreadcrumbs, e.g. a
 * brand's name or "Audit #36"). tests/unit/navigation/breadcrumbs.test.ts checks it
 * for every signed-in route, and that each parent's href is a page.
 */
export function breadcrumbsForPath(pathname: string): Breadcrumbs {
  const [top, second, third, fourth] = pathname.split("/").filter(Boolean);
  switch (top) {
    case "dashboard":
      return [CRUMB.workspace, { label: "Overview" }];
    case "brands": {
      if (!second) return [CRUMB.workspace, { label: "Brands" }];
      if (second === "wizard" || second === "new") {
        return [CRUMB.workspace, CRUMB.brands, { label: "Add brand" }];
      }
      if (!third) return [CRUMB.workspace, CRUMB.brands, { label: "Detail" }];
      const brand = { label: "Brand", href: `/brands/${second}` };
      if (!fourth) return [CRUMB.workspace, CRUMB.brands, brand, { label: labelFor(third) }];
      return [
        CRUMB.workspace,
        CRUMB.brands,
        brand,
        { label: labelFor(third), href: `/brands/${second}/${third}` },
        // Under Reports the last part is a report's id.
        { label: labelFor(fourth, third === "reports" ? "Report" : "Detail") },
      ];
    }
    case "audits":
      if (!second) return [CRUMB.workspace, { label: "Audits" }];
      if (second === "compare") return [CRUMB.workspace, CRUMB.audits, { label: "Compare" }];
      return [CRUMB.workspace, CRUMB.audits, { label: "Detail" }];
    case "agency":
      if (!second) return [CRUMB.workspace, { label: "Agency" }];
      // /agency/reports has no page of its own: the PDF builder sits under Agency.
      return [CRUMB.workspace, CRUMB.agency, { label: labelFor(third ?? second) }];
    case "portfolio":
      return [CRUMB.workspace, { label: "Portfolio" }];
    case "verticals":
      if (!second) return [CRUMB.workspace, { label: "Vertical packs" }];
      return [CRUMB.workspace, CRUMB.verticals, { label: "Detail" }];
    case "action-center":
      if (!second) return [CRUMB.workspace, { label: "Action Center" }];
      return [CRUMB.workspace, CRUMB.actionCenter, { label: "Detail" }];
    case "methods":
      return [CRUMB.workspace, { label: "Methodology" }];
    case "drift-alerts":
      return [CRUMB.workspace, { label: "Drift Alerts" }];
    case "settings":
      if (!second) return [{ label: CRUMB.settings.label }];
      return [CRUMB.settings, { label: labelFor(second) }];
    case "admin":
      // The operator's own pages (/admin/settings, /admin/costs), each named by its heading; /admin has no page.
      return [CRUMB.workspace, { label: adminTitle(second) }];
    case "organizations":
      // /organizations/[orgId]/… -- the workspace's own schedules and templates.
      return [CRUMB.workspace, { label: labelFor(third ?? "", "Workspace settings") }];
    default:
      return [{ label: "Workspace" }];
  }
}
