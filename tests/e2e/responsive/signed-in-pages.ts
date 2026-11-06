/**
 * Every signed-in page (app/(auth)/**\/page.tsx), by its route, and the URL the phone
 * spec (responsive-shell.spec.ts) opens for it with its seeded rows. 6 Nov
 * (phone-layout follow-ups, item 2): all of them, not 11.
 * tests/unit/e2e/responsive-signed-in-pages.test.ts fails when a route has no entry,
 * so a new page joins the spec.
 */

/** The rows the spec seeds, which the dynamic routes need. */
export interface PageFixtures {
  orgId: string;
  brandId: string;
  finishedAudit: string;
  runningAudit: string;
  /** A second finished audit, for the comparison. */
  otherFinishedAudit: string;
  actionItem: string;
  reportId: string;
  packId: string;
}

export interface SignedInPage {
  name: string;
  /** The app route, as its folder names it: "/brands/[brandId]/trust". */
  route: string;
  url: (f: PageFixtures) => string;
}

/** A brand's own pages, under /brands/[brandId]/. */
const BRAND_PAGES: [name: string, path: string][] = [
  ["AI Discovery", "ai-discovery"],
  ["Answer Capsules", "answer-capsules"],
  ["Autopilot", "autopilot"],
  ["Brand & Entity", "brand-entity-audit"],
  ["Discovery", "discovery"],
  ["Discovery comparisons", "discovery/comparisons"],
  ["Discovery journeys", "discovery/journeys"],
  ["Health check", "health-check"],
  ["llms.txt generator", "llms-txt-generator"],
  ["Meta tags", "meta-tags"],
  ["Reports", "reports"],
  ["Retrieval", "retrieval"],
  ["Agent analytics", "retrieval/agent-analytics"],
  ["Agent readiness", "retrieval/agent-readiness"],
  ["Content structure", "retrieval/content-structure"],
  ["Crawler logs", "retrieval/crawler-logs"],
  ["Entity home", "retrieval/entity-home"],
  ["llms.txt", "retrieval/llmstxt"],
  ["robots.txt + AI crawlers", "robots-txt-config"],
  ["Schedule", "schedule"],
  ["Schema audit", "schema-audit"],
  ["Signals", "signals"],
  ["SSR check", "ssr-check"],
  ["Technical audit", "technical-audit"],
  ["Trust", "trust"],
  ["Citation sources", "trust/citation-sources"],
  ["Consensus", "trust/consensus"],
  ["Entity score", "trust/entity-score"],
  ["Evidence", "trust/evidence"],
  ["Hallucinations", "trust/hallucinations"],
  ["LinkedIn presence", "trust/linkedin-presence"],
  ["YouTube presence", "trust/youtube-presence"],
  ["Visibility", "visibility"],
  ["Citation failure", "visibility/citation-failure"],
  ["Workflow", "workflow"],
  ["Drafts", "workflow/drafts"],
  ["Tasks", "workflow/tasks"],
];

export const SIGNED_IN_PAGES: SignedInPage[] = [
  { name: "Overview", route: "/dashboard", url: () => "/dashboard" },
  { name: "Brands", route: "/brands", url: () => "/brands" },
  { name: "New brand wizard", route: "/brands/wizard", url: () => "/brands/wizard" },
  { name: "New brand form", route: "/brands/new", url: () => "/brands/new" },
  { name: "Brand detail", route: "/brands/[brandId]", url: (f) => `/brands/${f.brandId}` },
  ...BRAND_PAGES.map(([name, path]) => ({
    name: `Brand: ${name}`,
    route: `/brands/[brandId]/${path}`,
    url: (f: PageFixtures) => `/brands/${f.brandId}/${path}`,
  })),
  {
    name: "Brand: a report",
    route: "/brands/[brandId]/reports/[reportId]",
    url: (f) => `/brands/${f.brandId}/reports/${f.reportId}`,
  },
  { name: "Audits list", route: "/audits", url: () => "/audits" },
  { name: "Finished audit", route: "/audits/[auditId]", url: (f) => `/audits/${f.finishedAudit}` },
  { name: "Running audit", route: "/audits/[auditId]", url: (f) => `/audits/${f.runningAudit}` },
  {
    name: "Audit comparison",
    route: "/audits/compare",
    url: (f) => `/audits/compare?ids=${f.finishedAudit},${f.otherFinishedAudit}`,
  },
  { name: "Action Center", route: "/action-center", url: () => "/action-center" },
  {
    name: "Action Center item",
    route: "/action-center/[id]",
    url: (f) => `/action-center/${f.actionItem}`,
  },
  { name: "Methodology", route: "/methods", url: () => "/methods" },
  { name: "Vertical packs", route: "/verticals", url: () => "/verticals" },
  { name: "Vertical pack", route: "/verticals/[packId]", url: (f) => `/verticals/${f.packId}` },
  { name: "Drift alerts", route: "/drift-alerts", url: () => "/drift-alerts" },
  { name: "Portfolio", route: "/portfolio", url: () => "/portfolio" },
  { name: "Agency", route: "/agency", url: () => "/agency" },
  { name: "Agency branding", route: "/agency/branding", url: () => "/agency/branding" },
  { name: "Agency bulk", route: "/agency/bulk", url: () => "/agency/bulk" },
  {
    name: "Agency client portals",
    route: "/agency/client-portals",
    url: () => "/agency/client-portals",
  },
  {
    name: "Agency PDF builder",
    route: "/agency/reports/pdf-builder",
    url: () => "/agency/reports/pdf-builder",
  },
  { name: "Agency schedules", route: "/agency/schedules", url: () => "/agency/schedules" },
  {
    name: "Delivery schedules",
    route: "/organizations/[orgId]/delivery-schedules",
    url: (f) => `/organizations/${f.orgId}/delivery-schedules`,
  },
  {
    name: "Report templates",
    route: "/organizations/[orgId]/report-templates",
    url: (f) => `/organizations/${f.orgId}/report-templates`,
  },
  { name: "Settings", route: "/settings", url: () => "/settings" },
  { name: "Team", route: "/settings/team", url: () => "/settings/team" },
  {
    name: "Notifications",
    route: "/settings/notifications",
    url: () => "/settings/notifications",
  },
  {
    name: "Report branding",
    route: "/settings/report-branding",
    url: () => "/settings/report-branding",
  },
  { name: "Audit trail", route: "/settings/audit-trail", url: () => "/settings/audit-trail" },
  {
    name: "Data residency",
    route: "/settings/data-residency",
    url: () => "/settings/data-residency",
  },
  { name: "Webhooks", route: "/settings/webhooks", url: () => "/settings/webhooks" },
  { name: "Billing", route: "/settings/billing", url: () => "/settings/billing" },
];
