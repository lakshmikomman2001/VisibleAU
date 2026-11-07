/**
 * Overview (7 Nov) -- every number on the Overview says what it covers, items 1-4:
 * - "Audits this month" and "LLM spend" count the same window, this calendar month in Sydney time,
 *   and the spend splits audits from other paid features;
 * - "Avg visibility" leaves out brands with no audit or too few answers, and says how many;
 * - Share of Voice is one line per brand, with its counts and audit, from the Visibility headline's
 *   own answer set (everyday questions, verified mentions);
 * - the Health Check banner follows the brand switcher and names what its score is.
 *
 * The server's clock zone is UTC here, as on Vercel: "this month" must not follow it.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
process.env.TZ = "UTC";

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import {
  type OverviewFixture,
  seedOverviewFixture,
  sydneyMonthStart,
} from "@/tests/helpers/overview-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session } = vi.hoisted(() => ({
  session: {
    organizationId: "",
    userId: "",
    sql: null as null | ((orgId: string) => Promise<unknown>),
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    name: "Sam Tester",
    organization: {
      id: session.organizationId,
      metadata: await session.sql?.(session.organizationId),
    },
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

let client: ReturnType<typeof postgres>;
let workspace: OverviewFixture;
let oneBrand: OverviewFixture;
let oneBrandFree: OverviewFixture;
let monthStart: Date;
const at = (minutes: number) => new Date(monthStart.getTime() + minutes * 60_000);

const decode = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const textOf = (html: string) => decode(html.replace(/<[^>]+>/g, ""));

async function renderOverview(orgId: string): Promise<string> {
  session.organizationId = orgId;
  const DashboardPage = (await import("@/app/(auth)/dashboard/page")).default;
  return decode(renderToStaticMarkup(await DashboardPage()));
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.sql = async (orgId) =>
    (await client`SELECT metadata FROM organizations WHERE id = ${orgId}`)[0]?.metadata;
  session.userId = randomUUID();
  monthStart = await sydneyMonthStart(client);

  workspace = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [
      {
        name: "Alphaline Plumbing",
        competitors: ["Rivalto Plumbing", "Harbourline Drains"],
        // Fair competitor counting (7 Nov): Rivalto's website verifies its mentions; Harbourline
        // has none, so it can't be verified and is left out.
        competitorWebsites: { "Rivalto Plumbing": "rivalto.example.com.au" },
        audits: [
          // Last Sydney month: neither counted this month nor the latest audit.
          {
            number: 35,
            createdAt: at(-30),
            answers: Array.from({ length: 10 }, () => ({ costUsd: 0.05 })),
          },
          {
            number: 36,
            createdAt: at(30),
            answers: [
              { brand: "verified", names: ["Rivalto Plumbing"], cites: ["rivalto.example.com.au"] },
              { brand: "verified" },
              // Named, but not verified as this business: never a mention.
              { brand: "unverified" },
              { names: ["Rivalto Plumbing"], cites: ["rivalto.example.com.au"] },
              // Rivalto named but its site not cited: an unverified match, never counted.
              { names: ["Rivalto Plumbing"] },
              { names: ["Harbourline Drains"] },
              {},
              {},
              {},
              {},
              // Questions that name the brand: never counted, nor what they name.
              { branded: true, brand: "verified", names: ["Rivalto Plumbing"] },
              { branded: true, brand: "verified", names: ["Harbourline Drains"] },
              { branded: true, brand: "verified" },
            ],
            followUpCents: { "run-comparison-prompts": 150 },
          },
        ],
      },
      {
        name: "Bravura Electrical",
        competitors: ["Sparkwell Electric"],
        // Its only audit failed: no complete audit, but its calls were billed.
        audits: [{ number: 1, createdAt: at(32), status: "failed", failureCostsUsd: [0.026] }],
      },
      {
        name: "Charwell Roofing",
        competitors: ["Skyreach Roofing"],
        audits: [
          {
            number: 12,
            createdAt: at(34),
            // 6 answers: under the 10 the headline needs.
            answers: [
              { brand: "verified", costUsd: 0.0065 },
              ...Array.from({ length: 5 }, () => ({ costUsd: 0.0065 })),
            ],
          },
        ],
      },
      {
        name: "Deltaview Glass",
        competitors: ["Clearpane Glass"],
        competitorWebsites: { "Clearpane Glass": "clearpane.example.com.au" },
        audits: [
          {
            number: 5,
            createdAt: at(36),
            answers: [
              { brand: "verified", costUsd: 0.0065 },
              { names: ["Clearpane Glass"], cites: ["clearpane.example.com.au"], costUsd: 0.0065 },
              { names: ["Clearpane Glass"], cites: ["clearpane.example.com.au"], costUsd: 0.0065 },
              ...Array.from({ length: 7 }, () => ({ costUsd: 0.0065 })),
            ],
          },
        ],
      },
    ],
  });
  oneBrand = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [{ name: "Echo Painting" }],
  });
  // No subscription: the free plan, which has no Health Check.
  oneBrandFree = await seedOverviewFixture(client, { brands: [{ name: "Foxtail Fencing" }] });
}, 120_000);

afterAll(async () => {
  await workspace?.cleanup();
  await oneBrand?.cleanup();
  await oneBrandFree?.cleanup();
  await client.end();
});

describe("Overview cards say what they cover", () => {
  it("Audits this month and LLM spend: one Sydney-time window, spend split by what it paid for", async () => {
    const text = textOf(await renderOverview(workspace.orgId));
    const month = formatInOrgTimezone(new Date(), undefined, "MMM");
    // #36, Bravura's failed #1, #12 and #5 -- all since the 1st in Sydney, before the 1st in UTC.
    expect(text).toContain(`Audits this month4Since 1 ${month}, Sydney time`);
    expect(text).toContain("LLM spend this month (Sydney time)");
    // Audits: US$0.13 + 0.026 (the failed audit's call) + 0.039 + 0.065 = US$0.26 = A$0.40;
    // the comparison run on #36 afterwards is the A$1.50 of other features. #35 is last month's.
    expect(text).toContain("A$1.90Audits A$0.40 · Other features A$1.50");
    expect(text).toContain("US$0.26 provider usage");
  }, 120_000);

  it("Avg visibility leaves out the brand with no audit and the one with too few answers, and says so", async () => {
    const text = textOf(await renderOverview(workspace.orgId));
    // Alphaline 2 of 10 = 20%, Deltaview 1 of 10 = 10%.
    expect(text).toContain(
      "15%Average of 2 brands' latest audits · 1 without enough answers · 1 with no audit yet",
    );
    expect(text).toContain(
      "A plain average of each brand's Visibility in its latest complete audit",
    );
  }, 120_000);

  it("Share of Voice: a line per brand, with its counts and audit, on the headline's answers", async () => {
    const html = await renderOverview(workspace.orgId);
    const line = (brand: string) => {
      const match = html.match(
        new RegExp(`<li data-sov-brand="${workspace.brandIds[brand]}">([\\s\\S]*?)</li>`),
      );
      return match ? textOf(match[1]) : "";
    };
    // Each audit completes 3 minutes after it starts (the fixture).
    const day = (completedMinute: number) =>
      formatInOrgTimezone(at(completedMinute), undefined, "d MMM");

    // 2 verified everyday mentions against Rivalto's 2 verified ones (its site cited). Not counted:
    // the brand's unverified answer, Rivalto's uncited name match, Harbourline (no website), and the
    // branded questions.
    expect(line("Alphaline Plumbing")).toBe(
      // 4 mentions in all: under 5, a small sample.
      `Alphaline Plumbing50%2 of 4 verified mentions · Audit #36, ${day(33)}small sample` +
        "1 competitor can't be verified: add its website in brand settings",
    );
    expect(line("Bravura Electrical")).toBe("Bravura ElectricalNo audit yet");
    expect(line("Charwell Roofing")).toBe(
      `Charwell RoofingNot enough answers · Audit #12, ${day(37)}` +
        "1 competitor can't be verified: add its website in brand settings",
    );
    expect(line("Deltaview Glass")).toBe(
      `Deltaview Glass33%1 of 3 verified mentions · Audit #5, ${day(39)}small sample`,
    );
    expect(html.match(/data-sov-brand=/g)).toHaveLength(4);
  }, 120_000);

  it("with several brands and none selected, no brand's Health Check banner is picked", async () => {
    const text = textOf(await renderOverview(workspace.orgId));
    expect(text).not.toContain("Health Check is ready");
  }, 120_000);

  it("with one brand (the switcher shows it), the banner is that brand's and names what the score is", async () => {
    const text = textOf(await renderOverview(oneBrand.orgId));
    expect(text).toContain("Echo Painting's Health Check is ready");
    // Health Check (7 Nov): the three checks, and no score.
    expect(text).toContain("Health Check: AI presence, site readiness and local authority");
    expect(text).not.toMatch(/0–100|\/100|score averages/);
    expect(text).not.toContain("AI Visibility Health Check");
  }, 120_000);

  it("on the free plan there's no banner, one brand or not", async () => {
    const text = textOf(await renderOverview(oneBrandFree.orgId));
    expect(text).toContain("Foxtail Fencing");
    expect(text).not.toContain("Health Check is ready");
  }, 120_000);
});
