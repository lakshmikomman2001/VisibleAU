// @vitest-environment jsdom
/**
 * 17 Nov, part 1 (Sri, 15 Nov, production, Hero Home Services): audit #50 said "33%, mentioned in 13 of 40" and
 * "13 of 13 mentions linked a source"; the Visibility page's "Mention-Source Divide" said "Mention 81.8%, Citation
 * 0.0%, Ratio 0.00, Known but Untrusted". Reproduced here with Hero's shape: #48 (13 Nov) asked 11 everyday
 * questions, #50 (15 Nov, the same ISO week) 10 -- one removed -- with #50's per-engine mentions (ChatGPT 9, Claude
 * 1, Gemini 0, Perplexity 3), every mention linking Hero's directory profile, never its own site. The weekly trend
 * row the card read counts distinct questions any engine named it in across both audits (9 of 11 = 81.82%) and
 * "cited" as the brand's own domain among the sources (0%).
 *
 * The card now shows the latest complete audit's own figures, by the audit page's definitions, with counts and the
 * audit's number -- and an operator's trend exclusion on an older audit (which recomputes that week last, making it
 * the newest trend row) can't change it. Real DB, real routes, the real page and the real audit page.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
process.env.TZ = "UTC";

import { randomUUID } from "node:crypto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import {
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, params } = vi.hoisted(() => ({
  session: { organizationId: "", userId: "" },
  params: { brandId: "" },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    name: "Sam Tester",
    role: "owner",
    organization: { id: session.organizationId, metadata: {} },
  })),
}));
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertTier: vi.fn(async () => undefined),
  assertBrandAccess: vi.fn(async () => undefined),
  // The benchmark panel's "viewed" entry needs a users row; the audit trail isn't what's tested here.
  recordAction: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/** Hero's week 2026-W46: #48 on Friday 13 Nov, #50 on Sunday 15 Nov. */
const W46_48 = "2026-11-13T01:00:00.000Z";
const W46_50 = "2026-11-15T01:00:00.000Z";
const W45_46 = "2026-11-03T01:00:00.000Z";
const ELEVEN = [...EVERYDAY_QUESTIONS, "Who fixes leaking taps in Castle Hill on weekends?"];
const LOCALSEARCH_PROFILE = {
  domain: "localsearch.com.au",
  url: "https://www.localsearch.com.au/profile/hero-home-services/castle-hill-nsw/abc123",
};
const HERO_50 = {
  chatgpt: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  claude: [1],
  gemini: [],
  perplexity: [1, 2, 3],
};

let client: ReturnType<typeof postgres>;
let hero: ReportFixture;
let thin: ReportFixture;
let silent: ReportFixture;

/** The page's fetches, answered by the real route handlers. */
function routeFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const m = url.match(/\/api\/brands\/([0-9a-f-]+)\/([a-z-]+)/);
    if (!m) return new Response("not found", { status: 404 });
    const [, brandId, route] = m;
    const ctx = { params: Promise.resolve({ brandId }) };
    const req = new Request(`http://localhost${url}`);
    if (route === "visibility")
      return (await import("@/app/api/brands/[brandId]/visibility/route")).GET(req, ctx);
    if (route === "fan-out")
      return (await import("@/app/api/brands/[brandId]/fan-out/route")).GET(req, ctx);
    if (route === "topical-gaps")
      return (await import("@/app/api/brands/[brandId]/topical-gaps/route")).GET(req, ctx);
    if (route === "competitive-benchmark")
      return (await import("@/app/api/brands/[brandId]/competitive-benchmark/route")).GET(req, ctx);
    return new Response("not found", { status: 404 });
  });
}

async function refreshWeek(fx: ReportFixture, completedAt: string) {
  const { withRlsContext } = await import("@/db/client");
  const { refreshWeeklyVisibilityTrend } = await import("@/lib/visibility/refresh-weekly-trend");
  await withRlsContext(fx.orgId, (tx) =>
    refreshWeeklyVisibilityTrend(tx, {
      brandId: fx.brandId,
      organizationId: fx.orgId,
      brandDomain: fx.domain,
      completedAt: new Date(completedAt),
    }),
  );
}

async function visibilityPage(fx: ReportFixture) {
  session.organizationId = fx.orgId;
  params.brandId = fx.brandId;
  vi.stubGlobal("fetch", routeFetch());
  const VisibilityPage = (await import("@/app/(auth)/brands/[brandId]/visibility/page")).default;
  render(<VisibilityPage />);
  await waitFor(() => expect(document.querySelector("[data-mentions-card]")).not.toBeNull(), {
    timeout: 15_000,
  });
  return document.querySelector("[data-mentions-card]") as HTMLElement;
}

async function auditPageText(fx: ReportFixture, number: number): Promise<string> {
  session.organizationId = fx.orgId;
  const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
  return renderToStaticMarkup(
    await AuditPage({
      params: Promise.resolve({ auditId: fx.audits[number] }),
      searchParams: Promise.resolve({}),
    }),
  )
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const squash = (el: HTMLElement) => (el.textContent ?? "").replace(/\s+/g, " ");

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.userId = randomUUID();
  hero = await seedReportFixture(client, {
    brandName: "Hero Home Services",
    audits: [
      { number: 46, completedAt: W45_46, mentions: {}, mentionSources: [LOCALSEARCH_PROFILE] },
      {
        number: 48,
        completedAt: W46_48,
        everydayQuestions: ELEVEN,
        mentions: {
          chatgpt: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          claude: [1, 2],
          gemini: [],
          perplexity: [1, 2],
        },
        mentionSources: [LOCALSEARCH_PROFILE],
      },
      { number: 50, completedAt: W46_50, mentions: HERO_50, mentionSources: [LOCALSEARCH_PROFILE] },
    ],
  });
  // Too few answers to measure: three engines failed, four questions.
  thin = await seedReportFixture(client, {
    brandName: "Thin Sample Plumbing",
    audits: [
      {
        number: 1,
        completedAt: W46_50,
        failedEngines: ["chatgpt", "claude", "gemini"],
        everydayQuestions: EVERYDAY_QUESTIONS.slice(0, 4),
        mentions: { perplexity: [1] },
      },
    ],
  });
  // Measured, never named: no mention to check sources for.
  silent = await seedReportFixture(client, {
    brandName: "Silent Electrical",
    audits: [{ number: 7, completedAt: W46_50, mentions: {} }],
  });
  // As production: the Inngest step aggregates #50's week when it completes.
  await refreshWeek(hero, W46_50);
}, 60_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await hero?.cleanup();
  await thin?.cleanup();
  await silent?.cleanup();
  await client?.end();
});

describe("Hero, audit #50", () => {
  it("reproduces production's figures: the weekly trend row said 81.82% and 0% (9 of 11 questions; never Hero's own site)", async () => {
    const [row] = await client`
      SELECT mention_rate, citation_rate, brand_archetype FROM visibility_trends
      WHERE brand_id = ${hero.brandId} AND period_label = '2026-W46' AND period_type = 'weekly'
    `;
    expect(Number(row.mention_rate)).toBeCloseTo(81.82, 2);
    expect(Number(row.citation_rate)).toBe(0);
    expect(row.brand_archetype).toBe("known_but_untrusted");
  });

  it("the audit page says 33%, 13 of 40 and 13 of 13 mentions linked a source", async () => {
    const text = await auditPageText(hero, 50);
    expect(text).toContain("33%");
    expect(text).toContain("13 of 40");
    expect(text).toMatch(/13 of 13 mentions linked a source/);
  }, 30_000);

  it("the Visibility page's card shows the same: 33%, 13 of 40, 13 of 13, audit #50 -- and a verdict from them", async () => {
    const card = await visibilityPage(hero);
    const text = squash(card);
    expect(text).toContain("Mentions and sources");
    expect(text).toContain("Audit #50");
    expect(text).toContain("33%");
    expect(text).toContain("in 13 of 40 everyday answers");
    expect(text).toContain("13 of 13");
    expect(text).toContain("mentions linked a source (100%)");
    expect(card.querySelector("[data-verdict]")?.getAttribute("data-verdict")).toBe(
      "often_with_sources",
    );
    expect(text).toContain("Named often, with sources");
    for (const wrong of [
      "81.8%",
      "0.0%",
      "Known but Untrusted",
      "Mention-Source Divide",
      "Ratio",
      "Brand-Led",
      "Source-Dep",
    ])
      expect(text, wrong).not.toContain(wrong);
  }, 30_000);

  it("an operator's trend exclusion on an older audit (its week recomputed last) doesn't change the card", async () => {
    await client`UPDATE audits SET excluded_from_trends_reason = ${EARLIER_MENTION_CHECK_REASON} WHERE id = ${hero.audits[46]}`;
    await refreshWeek(hero, W45_46);
    // That week is now the newest trend row by calculated_at.
    const [newest] = await client`
      SELECT period_label FROM visibility_trends WHERE brand_id = ${hero.brandId}
      ORDER BY calculated_at DESC LIMIT 1
    `;
    expect(newest.period_label).toBe("2026-W45");
    const text = squash(await visibilityPage(hero));
    expect(text).toContain("Audit #50");
    expect(text).toContain("in 13 of 40 everyday answers");
    expect(text).toContain("13 of 13");
    expect(text).not.toContain("0.0%");
  }, 30_000);
});

describe("an audit whose figures can't be measured", () => {
  it("too few answers: 'Not measured for this audit', no percentage, no state, no verdict", async () => {
    const card = await visibilityPage(thin);
    const text = squash(card);
    expect(text).toContain("Audit #1");
    expect(text).toContain("Not measured for this audit");
    expect(text).not.toMatch(/\d+(\.\d)?%/);
    expect(card.querySelector("[data-verdict]")).toBeNull();
    expect(card.querySelector("[data-active]")).toBeNull();
  }, 30_000);

  it("never named: 0% mentioned (measured), sources 'Not measured for this audit', no verdict", async () => {
    const card = await visibilityPage(silent);
    const text = squash(card);
    expect(text).toContain("in 0 of 40 everyday answers");
    expect(text).toContain("Not measured for this audit");
    expect(text).not.toContain("0.0%");
    expect(text).not.toContain("0 of 0");
    expect(card.querySelector("[data-verdict]")).toBeNull();
  }, 30_000);
});
