/**
 * 6 Nov (phone-layout follow-ups, item 1) -- every "New brand" entry follows the
 * rule POST /api/brands enforces, on a real database: the shell's (the desktop top
 * bar and the phone drawer, both from the signed-in layout), the Brands page's
 * header, and the wizard itself. While the plan has room they open the wizard; once
 * it's full they show the lock and lead to the plans, and the wizard says so before
 * its form, exactly when the API would refuse the brand with its 403. A deleted
 * brand doesn't count, as it doesn't for the API.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
const captured = vi.hoisted(() => ({ shell: null as Record<string, unknown> | null }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: "new-brand", name: "Owner" } })) } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => "/brands",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// What the layout hands the shell, which shows the top bar's and the drawer's entry.
vi.mock("@/components/domain/app-shell", () => ({
  AppShell: (props: Record<string, unknown>) => {
    captured.shell = props;
    return null;
  },
}));
vi.mock("@/app/(auth)/brands/wizard/wizard-form", () => ({
  WizardForm: () => <p data-wizard-form="">The wizard's form</p>,
}));

const ORG = randomUUID();
const OWNER = randomUUID();
const BRAND = randomUUID();
const DELETED_BRAND = randomUUID();
const RUN = ORG.slice(0, 8);

let sql: ReturnType<typeof postgres>;

async function render(page: Promise<React.ReactNode> | React.ReactNode): Promise<string> {
  return renderToStaticMarkup(await page);
}

async function setTier(tier: string) {
  await sql`UPDATE subscriptions SET tier = ${tier} WHERE organization_id = ${ORG}`;
}

/** The Brands page header's entry: its href, and whether it shows the lock. */
async function brandsPageEntry() {
  const { default: Page } = await import("@/app/(auth)/brands/page");
  const html = await render(Page());
  const tag = html.match(/<a[^>]*data-new-brand="page"[^>]*>/)?.[0] ?? "";
  return {
    href: tag.match(/href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&"),
    locked: tag.includes("data-brand-limit-reached"),
    html,
  };
}

async function wizardHtml() {
  const { default: Page } = await import("@/app/(auth)/brands/wizard/page");
  return render(Page());
}

/** What the layout handed the shell (a call, so the "= null" before it isn't carried over). */
const shellProps = () => captured.shell;

async function shellUsage() {
  captured.shell = null;
  const { default: Layout } = await import("@/app/(auth)/layout");
  await render(Layout({ children: null }));
  return shellProps()?.brandUsage;
}

/** What POST /api/brands answers for one more brand. */
async function createBrand(name: string) {
  const { POST } = await import("@/app/api/brands/route");
  const res = await POST(
    new Request("http://localhost/api/brands", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        domain: `${name.toLowerCase().replace(/\W+/g, "-")}-${RUN}.example.com.au`,
        vertical: "tradies",
      }),
    }),
  );
  return res.status;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
  // A created brand's background jobs aren't this test's business.
  const { inngest } = await import("@/lib/inngest/client");
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] });

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, onboarding_complete)
    VALUES (${ORG}, ${`new-brand-${RUN}`}, 'New Brand Plumbing', ${`new-brand-${RUN}`}, true)
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`new-brand-${OWNER}`}, ${ORG}, ${`owner-${RUN}@example.com.au`}, 'Owner', 'owner')
  `;
  // A role comes from the membership alone (follow-ups from 6e27afc..01a6a8c, part 1).
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now(), now(), true)
  `;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG}, ${`cus_new_brand_${RUN}`}, ${`sub_new_brand_${RUN}`}, 'price_test', 'growth', 'monthly', 'active')
  `;
  // Growth has one brand: this workspace has it, plus one it deleted.
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, deleted_at) VALUES
      (${BRAND}, ${ORG}, 'Bondi Plumbing', ${`bondi-${RUN}.example.com.au`}, 'tradies', 'au', ${[]}, NULL),
      (${DELETED_BRAND}, ${ORG}, 'Old Plumbing', ${`old-${RUN}.example.com.au`}, 'tradies', 'au', ${[]}, now())
  `;
  currentUser.value = {
    id: OWNER,
    organizationId: ORG,
    email: `owner-${RUN}@example.com.au`,
    name: "Owner",
    role: "owner",
    organization: { id: ORG, name: "New Brand Plumbing", region: "au" },
  };
}, 60_000);

afterAll(async () => {
  await sql`DELETE FROM audit_trail WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM brands WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM org_members WHERE organization_id = ${ORG}`;
  await sql`DELETE FROM users WHERE id = ${OWNER}`;
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("New brand at the plan's limit (Growth: 1 of 1, a deleted brand not counted)", () => {
  beforeAll(() => setTier("growth"));

  it("the shell's entries get the full plan: 1 of 1, and Agency has more", async () => {
    expect(await shellUsage()).toEqual({
      count: 1,
      limit: 1,
      canAdd: false,
      upgradePlan: "Agency",
    });
  });

  it("the Brands page's header shows the lock and leads to the plans", async () => {
    const entry = await brandsPageEntry();
    expect(entry.href).toBe("/settings/billing?reason=brand-limit");
    expect(entry.locked).toBe(true);
    expect(entry.html).toContain("Limit reached");
    expect(entry.html).not.toContain('href="/brands/wizard"');
  });

  it("the wizard says so before its form", async () => {
    const html = await wizardHtml();
    expect(html).toContain("reached your plan&#x27;s brand limit");
    expect(html).toContain("Your workspace has 1 of 1 brands.");
    expect(html).not.toContain("data-wizard-form");
  });

  it("which is when the API refuses the brand", async () => {
    expect(await createBrand("One Too Many")).toBe(403);
  });
});

describe("New brand while the plan has room (Agency: 1 of 5)", () => {
  beforeAll(() => setTier("agency"));

  it("the shell's entries open the wizard", async () => {
    expect(await shellUsage()).toEqual({ count: 1, limit: 5, canAdd: true, upgradePlan: null });
  });

  it("the Brands page's header opens the wizard, with no lock", async () => {
    const entry = await brandsPageEntry();
    expect(entry.href).toBe("/brands/wizard");
    expect(entry.locked).toBe(false);
    expect(entry.html).not.toContain("Limit reached");
  });

  it("the wizard shows its form", async () => {
    expect(await wizardHtml()).toContain("data-wizard-form");
  });

  it("and the API takes the brand, which the next read counts", async () => {
    expect(await createBrand("Second Site")).toBe(201);
    expect(await shellUsage()).toMatchObject({ count: 2, canAdd: true });
  });
});
