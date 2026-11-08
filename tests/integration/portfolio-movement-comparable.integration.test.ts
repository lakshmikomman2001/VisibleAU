/**
 * Mock-gate and retention follow-ups (9 Nov), part 5 -- the agency page's Top Movers and the portfolio's Trend
 * compared each brand's latest audit with the one before with no methodology, engine-coverage or model check, so
 * a plan change from Claude Haiku to Sonnet showed as the brand's movement. Both now go through the drift
 * baseline's rule (lib/visibility/latest-movement.ts, lib/drift/baseline.ts): a Haiku -> Sonnet pair shows
 * "Not comparable (models changed)" and no movement; a Haiku -> Haiku pair shows its movement as before.
 * RED on the parent: the Haiku -> Sonnet brand showed "20% → 70%" and "↑ from 20%". ⚠️ TEST DB ONLY.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const ORG_ID = randomUUID();
const USER_ID = randomUUID();
const SWITCHED = { brand: randomUUID(), older: randomUUID(), latest: randomUUID() };
const STEADY = { brand: randomUUID(), older: randomUUID(), latest: randomUUID() };
const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: USER_ID,
    organizationId: ORG_ID,
    organization: { id: ORG_ID },
  }),
}));

let client: ReturnType<typeof postgres>;

async function seedAudit(
  brandId: string,
  auditId: string,
  auditNumber: number,
  daysAgo: number,
  model: string,
  mentioned: number,
): Promise<void> {
  await client`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count, runs_per_prompt, completed_at, methodology_version)
    VALUES (${auditId}, ${brandId}, ${ORG_ID}, ${auditNumber}, 'complete', ARRAY['claude'], 10, 1,
      NOW() - make_interval(days => ${daysAgo}), 3)
  `;
  for (let i = 0; i < 10; i++) {
    const hit = i < mentioned;
    await client`
      INSERT INTO citations (audit_id, engine, prompt, run_number, brand_mentioned, is_branded_prompt, position, cited_sources, response_snippet, llm_model)
      VALUES (${auditId}, 'claude', ${`prompt ${i}`}, 1, ${hit}, false, ${hit ? 1 : null},
        ${client.json(hit ? [{ url: "https://example.com/src" }] : [])}, 'response text', ${model})
    `;
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });

  await client`
    INSERT INTO organizations (id, clerk_org_id, name, slug)
    VALUES (${ORG_ID}, ${`pmc-${ORG_ID}`}, 'Movement Comparability Org', ${`pmc-${ORG_ID}`})
  `;
  await client`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${ORG_ID}, ${`cus_${ORG_ID}`}, ${`sub_${ORG_ID}`}, 'price_agency_test', 'agency', 'monthly', 'active')
  `;
  for (const [b, name] of [
    [SWITCHED.brand, "Switched Plumbing"],
    [STEADY.brand, "Steady Plumbing"],
  ] as const) {
    await client`
      INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions, competitors)
      VALUES (${b}, ${ORG_ID}, ${name}, ${`${b.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY['NSW:Sydney'], ARRAY[]::text[])
    `;
  }
  // Claude Haiku (Starter) 2 in 10, then Sonnet (Growth) 7 in 10: a plan change, not movement.
  await seedAudit(SWITCHED.brand, SWITCHED.older, 1, 8, HAIKU, 2);
  await seedAudit(SWITCHED.brand, SWITCHED.latest, 2, 1, SONNET, 7);
  // Haiku both times, 3 then 6 in 10: real movement. (Audit numbers are unique per workspace.)
  await seedAudit(STEADY.brand, STEADY.older, 3, 8, HAIKU, 3);
  await seedAudit(STEADY.brand, STEADY.latest, 4, 1, HAIKU, 6);
}, 60_000);

afterAll(async () => {
  const auditIds = [SWITCHED.older, SWITCHED.latest, STEADY.older, STEADY.latest];
  await client`DELETE FROM citations WHERE audit_id = ANY(${auditIds})`;
  await client`DELETE FROM audits WHERE id = ANY(${auditIds})`;
  await client`DELETE FROM brands WHERE id = ANY(${[SWITCHED.brand, STEADY.brand]})`;
  await client`DELETE FROM subscriptions WHERE organization_id = ${ORG_ID}`;
  await client`DELETE FROM organizations WHERE id = ${ORG_ID}`;
  await client.end();
});

/** The rendered page, without React's text-joining comments. */
async function render(page: "agency" | "portfolio"): Promise<string> {
  const Page = (await import(`@/app/(auth)/${page}/page`))
    .default as () => Promise<React.ReactElement>;
  return renderToStaticMarkup(await Page()).replace(/<!-- -->/g, "");
}

/** The table row or list item that names `brand`. */
function rowOf(html: string, tag: "tr" | "li", brand: string): string {
  return html.split(`<${tag}`).find((part) => part.includes(`>${brand}<`)) ?? "";
}

describe("a Haiku -> Sonnet pair shows no movement; a comparable pair does", () => {
  it("portfolio Trend", async () => {
    const html = await render("portfolio");
    const switched = rowOf(html, "tr", "Switched Plumbing");
    expect(switched).toContain("Not comparable (models changed)");
    expect(switched).not.toMatch(/[↑↓→] from/);

    expect(rowOf(html, "tr", "Steady Plumbing")).toContain("↑ from 30%");
  }, 60_000);

  it("agency Top Movers", async () => {
    const html = await render("agency");
    expect(rowOf(html, "li", "Steady Plumbing")).toContain("30% → 60%");
    const switched = rowOf(html, "li", "Switched Plumbing");
    expect(switched).toContain("Not comparable (models changed)");
    expect(switched).not.toContain("→");
    expect(html).not.toContain("20% → 70%");
  }, 60_000);
});
