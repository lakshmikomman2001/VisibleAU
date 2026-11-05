/**
 * 6 Nov (Sri: "No link may lead to a 403") -- every entry to a paid feature, on a plan
 * with it and on one without, against the real pages and the local test database. On a
 * plan without it the entry keeps its place, with a lock and the plan's name, and the
 * feature's page is the locked card: never the feature, so never its 403. Which plan
 * has what comes from lib/pricing/tiers.ts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirected to ${to}`);
  }),
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
}));

const ENDPOINT = randomUUID();
const PORTAL = randomUUID();
const PRO_LOCK = "Bulk export and re-audit is part of the Agency Pro plan";

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

async function setPlan(tier: string | null) {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${fx.orgId}`;
  if (!tier) return;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${fx.orgId}, ${`cus_${fx.orgId}`}, ${`sub_${fx.orgId}`}, 'price_test', ${tier}, 'monthly', 'active')
  `;
}

async function render(load: () => Promise<{ default: () => Promise<React.ReactElement> }>) {
  const { default: Page } = await load();
  return renderToStaticMarkup(await Page());
}

const dashboard = () => render(() => import("@/app/(auth)/agency/page"));
const bulk = () => render(() => import("@/app/(auth)/agency/bulk/page"));
const portals = () => render(() => import("@/app/(auth)/agency/client-portals/page"));
const webhooks = () => render(() => import("@/app/(auth)/settings/webhooks/page"));
const branding = () => render(() => import("@/app/(auth)/settings/report-branding/page"));

async function sidebar(tier: string) {
  const { SidebarContent } = await import("@/components/domain/app-sidebar");
  return renderToStaticMarkup(createElement(SidebarContent, { orgTier: tier, orgName: "Splice" }));
}

/** Each element linking to `href`, as markup up to its closing </a>. */
function linksTo(html: string, href: string): string[] {
  return [...html.matchAll(new RegExp(`<a[^>]*href="${href}"[^>]*>[\\s\\S]*?</a>`, "g"))].map(
    (m) => m[0],
  );
}

beforeAll(async () => {
  // Each page's first import (its whole module graph) here, with this hook's time, not
  // inside the first test that renders it (see vitest.config.ts's testTimeout).
  for (const load of [
    () => import("@/app/(auth)/agency/page"),
    () => import("@/app/(auth)/agency/bulk/page"),
    () => import("@/app/(auth)/agency/client-portals/page"),
    () => import("@/app/(auth)/settings/webhooks/page"),
    () => import("@/app/(auth)/settings/report-branding/page"),
    () => import("@/components/domain/app-sidebar"),
  ]) {
    await load();
  }
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, { audits: [] });
  await sql`
    INSERT INTO webhook_endpoints (id, organization_id, url, channel, events, signing_secret)
    VALUES (${ENDPOINT}, ${fx.orgId}, 'https://hooks.example.com.au/before', 'custom', ${["audit.completed"]}, 'whsec_test')
  `;
  await sql`
    INSERT INTO client_portal_invites (id, organization_id, brand_id, invite_token, invitee_name)
    VALUES (${PORTAL}, ${fx.orgId}, ${fx.brandId}, ${`locked-entries-${PORTAL}`}, 'Harbour client')
  `;
  currentUser.value = {
    id: randomUUID(),
    organizationId: fx.orgId,
    organization: { id: fx.orgId, name: "Splice Marketing" },
    role: "owner",
    name: "Owner",
  };
}, 180_000);

afterAll(async () => {
  await sql`DELETE FROM webhook_endpoints WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM client_portal_invites WHERE organization_id = ${fx.orgId}`;
  await fx.cleanup();
  await sql.end();
});

describe("bulk export and re-audit on Agency (it's Agency Pro)", () => {
  beforeAll(() => setPlan("agency"));

  it("the Agency Dashboard keeps both entries, each locked with 'Agency Pro'", async () => {
    const entries = linksTo(await dashboard(), "/agency/bulk");
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry).toContain('data-plan-lock="bulk_operations"');
      expect(entry).toContain("Agency Pro");
    }
  });

  it("the bulk page is the locked card, with a way to the plans, and not the feature", async () => {
    const html = await bulk();
    expect(html).toContain('data-plan-locked="bulk_operations"');
    expect(html).toContain(PRO_LOCK);
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("Bulk Re-audit");
    expect(html).not.toContain("Bulk CSV Export");
  });

  it("the dashboard's Agency entries aren't locked", async () => {
    const html = await dashboard();
    for (const href of ["/settings/report-branding", "/agency/client-portals"]) {
      const [entry] = linksTo(html, href);
      expect(entry, href).toBeDefined();
      expect(entry).not.toContain("data-plan-lock");
    }
  });
});

describe("on Agency Pro nothing changes", () => {
  beforeAll(() => setPlan("agency_pro"));

  it("no entry on the Agency Dashboard is locked", async () => {
    const html = await dashboard();
    expect(linksTo(html, "/agency/bulk")).toHaveLength(2);
    expect(html).not.toContain("data-plan-lock");
  });

  it("the bulk page is the feature", async () => {
    const html = await bulk();
    expect(html).not.toContain("data-plan-locked");
    expect(html).toContain("Loading brands");
  });
});

describe("webhooks, client portal and report branding on Growth (they're Agency)", () => {
  beforeAll(() => setPlan("growth"));

  it("webhooks: the locked card; the endpoint set up before stays, to delete only", async () => {
    const html = await webhooks();
    expect(html).toContain('data-plan-locked="webhooks"');
    expect(html).toContain("Webhook integrations is part of the Agency plan");
    expect(html).toContain("hooks.example.com.au/before");
    expect(html).toContain('title="Delete endpoint"');
    expect(html).not.toContain('title="Send test delivery"');
    expect(html).not.toContain("Add endpoint");
  });

  it("client portal: the locked card, and no way to make a new link", async () => {
    const html = await portals();
    expect(html).toContain('data-plan-locked="client_portal"');
    expect(html).toContain("Client portal is part of the Agency plan");
    expect(html).not.toContain("Create Invite");
  });

  it("report branding: the same locked card", async () => {
    const html = await branding();
    expect(html).toContain('data-plan-locked="white_label_reports"');
    expect(html).toContain("White-label report branding is part of the Agency plan");
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain("data-report-branding-form");
  });

  it("the sidebar keeps Report branding and Webhooks, each locked with 'Agency'; Team isn't", async () => {
    const html = await sidebar("growth");
    for (const [href, feature] of [
      ["/settings/report-branding", "white_label_reports"],
      ["/settings/webhooks", "webhooks"],
    ]) {
      const [entry] = linksTo(html, href);
      expect(entry, href).toContain(`data-plan-lock="${feature}"`);
      expect(entry).toContain("Agency");
    }
    expect(linksTo(html, "/settings/team")[0]).not.toContain("data-plan-lock");
  });
});

describe("on Agency they're the features", () => {
  beforeAll(() => setPlan("agency"));

  it("webhooks", async () => {
    const html = await webhooks();
    expect(html).not.toContain("data-plan-locked");
    expect(html).toContain("Add endpoint");
    expect(html).toContain('title="Send test delivery"');
  });

  it("client portal", async () => {
    const html = await portals();
    expect(html).not.toContain("data-plan-locked");
    expect(html).toContain("Loading client portals");
  });

  it("the sidebar has no lock", async () => {
    expect(await sidebar("agency")).not.toContain("data-plan-lock");
  });
});
