/**
 * "Two wrong labels on the Action Center" (24 Oct) -- real DB, real pages. The rows below are
 * stored exactly the way production stored them before this fix (no data change): Omega's
 * directory item carries confidence_basis 'verified' with no owner row behind it, and its
 * entity-profiles item is High with the "beyond Wikipedia" title.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const OMEGA_BRAND = randomUUID();
const OWNER_BRAND = randomUUID();
const OMEGA_AUDIT = randomUUID();
const OWNER_AUDIT = randomUUID();
const OMEGA_DIRECTORY_ITEM = randomUUID();
const OMEGA_ENTITY_ITEM = randomUUID();
const OWNER_DIRECTORY_ITEM = randomUUID();

const OMEGA_DIRECTORY_TITLE =
  "AI cited hipages in 9 of 40 answers — confirm your status, and 6 more directories";
const OWNER_DIRECTORY_TITLE = "AI cited hipages in 9 of 40 answers — you told us you're not listed";
const OLD_ENTITY_TITLE = "Build your entity profile beyond Wikipedia";
const NEW_ENTITY_TITLE = "Strengthen your business profiles on Google, Wikidata and local press";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ organizationId: ORG_ID }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let client: ReturnType<typeof postgres>;

function citationRefs(count: number) {
  const directories = [
    "hipages",
    "ServiceSeeking",
    "Oneflare",
    "Airtasker",
    "Yellow Pages",
    "True Local",
    "Word of Mouth",
  ];
  return Array.from({ length: count }, (_, i) => ({
    source: directories[i % directories.length],
    url: `https://directory.example.test/listing-${i}`,
    summary: `${directories[i % directories.length]} was cited in 9 of 40 answers to everyday customer questions (questions that don't name your business) (checked 2026-10-20).`,
    sourceType: "checker",
  }));
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`ac-labels-${ORG_ID}`}, 'Action Center Labels Test Org', ${`ac-labels-org-${ORG_ID}`})
  `;
  // A paid tier, so cards render without the free-tier upgrade overlay (its own link would nest inside each card's).
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_test', 'enterprise', 'monthly', 'active')
  `;
  await client`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES
      (${OMEGA_BRAND}, ${ORG_ID}, 'Omega Services', 'omega-labels.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney']),
      (${OWNER_BRAND}, ${ORG_ID}, 'Harbour Plumbing', 'harbour-labels.example.com.au', 'tradies', 'au', ARRAY['NSW:Sydney'])
  `;
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, started_at, completed_at)
    VALUES
      (${OMEGA_AUDIT}, ${OMEGA_BRAND}, ${ORG_ID}, 1, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-20T00:00:00Z', '2026-10-20T00:10:00Z'),
      (${OWNER_AUDIT}, ${OWNER_BRAND}, ${ORG_ID}, 2, 'complete', ${["chatgpt"]}, 1, 1, '2026-10-20T00:00:00Z', '2026-10-20T00:10:00Z')
  `;
  // Harbour told us before its audit ran that it isn't on hipages. Omega has no rows at all.
  await client`
    INSERT INTO brand_directory_listings (organization_id, brand_id, directory_key, status, confirmed_at)
    VALUES (${ORG_ID}, ${OWNER_BRAND}, 'hipages', 'not_listed', '2026-10-19T00:00:00Z')
  `;
  await client`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, confidence_basis, expected_impact_score, evidence_refs, status, created_at)
    VALUES
      (${OMEGA_DIRECTORY_ITEM}, ${ORG_ID}, ${OMEGA_BRAND}, ${OMEGA_AUDIT}, 'directory-visibility', 'frequency',
        ${OMEGA_DIRECTORY_TITLE}, 'You haven''t told us whether you''re listed on hipages.', 'confirmed', 'verified', 'high',
        ${client.json(citationRefs(27))}, 'open', '2026-10-20T00:10:00Z'),
      (${OMEGA_ENTITY_ITEM}, ${ORG_ID}, ${OMEGA_BRAND}, ${OMEGA_AUDIT}, 'entity-profiles', 'frequency',
        ${OLD_ENTITY_TITLE}, 'We checked: there''s no Wikipedia article for your business.', 'confirmed', 'verified', 'high',
        ${client.json([{ source: "Wikipedia", url: "", summary: 'Searched Wikipedia for "Omega Services Australia": no article found.', sourceType: "checker" }])},
        'open', '2026-10-20T00:10:00Z'),
      (${OWNER_DIRECTORY_ITEM}, ${ORG_ID}, ${OWNER_BRAND}, ${OWNER_AUDIT}, 'directory-visibility', 'frequency',
        ${OWNER_DIRECTORY_TITLE}, 'You told us you''re not listed on hipages.', 'confirmed', 'verified', 'high',
        ${client.json([
          ...citationRefs(1),
          {
            source: "hipages",
            url: "",
            summary: "You told us on 2026-10-19 that you're not listed on hipages.",
            sourceType: "checker",
          },
        ])},
        'open', '2026-10-20T00:10:00Z')
  `;
}, 30000);

afterAll(async () => {
  await client`DELETE FROM action_items WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brand_directory_listings WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM audits WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM brands WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

function cardHtml(html: string, itemId: string): string {
  const match = html.match(
    new RegExp(`<a[^>]*href="/action-center/${itemId}"[^>]*>([\\s\\S]*?)</a>`),
  );
  if (!match) throw new Error(`no card rendered for ${itemId}`);
  return match[1];
}

async function renderActionCenter(): Promise<string> {
  const ActionCenterPage = (await import("@/app/(auth)/action-center/page")).default;
  return renderToStaticMarkup(await ActionCenterPage({ searchParams: Promise.resolve({}) }));
}

async function renderDetail(id: string): Promise<string> {
  const ActionDetailPage = (await import("@/app/(auth)/action-center/[id]/page")).default;
  return renderToStaticMarkup(await ActionDetailPage({ params: Promise.resolve({ id }) }));
}

describe("Action Center -- directory basis label (item 1)", () => {
  it("Omega's item, with no owner rows, shows 'Measured in this audit' and the 'Measured' pill -- never 'You told us' / 'Confirmed'", async () => {
    const card = cardHtml(await renderActionCenter(), OMEGA_DIRECTORY_ITEM);
    expect(card).toContain("27 evidence items");
    expect(card).toContain(">Measured in this audit<");
    expect(card).toContain(">Measured<");
    expect(card).not.toContain("You told us");
    expect(card).not.toContain(">Confirmed<");
  });

  it("an item backed by the owner's own row for the lead directory shows 'You told us' and 'Confirmed'", async () => {
    const card = cardHtml(await renderActionCenter(), OWNER_DIRECTORY_ITEM);
    expect(card).toContain(">You told us<");
    expect(card).toContain(">Confirmed<");
    expect(card).not.toContain("Measured");
  });

  it("the detail page's pill agrees with the list", async () => {
    expect(await renderDetail(OMEGA_DIRECTORY_ITEM)).toContain(">Measured<");
    expect(await renderDetail(OMEGA_DIRECTORY_ITEM)).not.toContain(">Confirmed<");
    expect(await renderDetail(OWNER_DIRECTORY_ITEM)).toContain(">Confirmed<");
  });
});

describe("Action Center -- entity-profiles priority (item 2)", () => {
  it("a stored 'beyond Wikipedia' High item reads Low with the real steps as its title, with no data change", async () => {
    const html = await renderActionCenter();
    const card = cardHtml(html, OMEGA_ENTITY_ITEM);
    expect(card).toContain(NEW_ENTITY_TITLE);
    expect(card).not.toContain("beyond Wikipedia");
    expect(card).toContain(">Low<");
    expect(card).not.toContain(">High<");
    // The header's counts come from the same displayed priority.
    expect(html.replace(/<!-- -->/g, "")).toContain("2 high · 0 medium · 1 low");

    const [row] = await client<{ title: string; expected_impact_score: string }[]>`
      SELECT title, expected_impact_score FROM action_items WHERE id = ${OMEGA_ENTITY_ITEM}
    `;
    expect(row).toEqual({ title: OLD_ENTITY_TITLE, expected_impact_score: "high" });
  });

  it("the detail page shows the same title", async () => {
    const html = await renderDetail(OMEGA_ENTITY_ITEM);
    expect(html).toContain(NEW_ENTITY_TITLE);
    expect(html).not.toContain("beyond Wikipedia");
  });
});

describe("Audit page 'Recommended actions' uses the same display functions", () => {
  it("Omega's audit shows Measured for the directory item and Low for entity-profiles", async () => {
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const html = renderToStaticMarkup(
      await AuditPage({
        params: Promise.resolve({ auditId: OMEGA_AUDIT }),
        searchParams: Promise.resolve({}),
      }),
    );
    const block = html.slice(html.indexOf("Recommended actions"));
    expect(block).toContain("Measured in this audit");
    expect(block).not.toContain("You told us");
    expect(block).toContain(NEW_ENTITY_TITLE);
    expect(block).not.toContain("beyond Wikipedia");
    expect(cardHtml(block, OMEGA_ENTITY_ITEM)).toContain(">Low<");
  });
});
