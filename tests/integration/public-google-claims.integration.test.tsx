/**
 * 16 Nov (Sri: Google AI Overviews and AI Mode on for every Growth, Agency and Agency Pro workspace, and said so on the
 * public pages only while it's true) -- the public pages rendered against the real global settings, saved the way
 * /admin/settings saves them (updateGoogleSurfaceSetting):
 * - setting off (the env switch on, the provider's credentials set): no public page mentions Google's AI answers;
 * - setting on: Growth, Agency and Agency Pro's cards and the comparison table list them, Starter's and Free's don't,
 *   and the landing page, the FAQ, the about page and the methodology say what the audit really does with them;
 * - one surface on, or Google counted in the headline: the pages say exactly that;
 * - switched off again: gone from the next render.
 * connection() is stubbed (there's no request here); the database read is real.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SETTING_KEYS = [
  "google_ai_overviews_enabled",
  "google_ai_mode_enabled",
  "google_surfaces_count_in_headline",
  "google_surfaces_queue_mode",
  "google_surfaces_device",
  "google_surfaces_max_cost_usd_per_audit",
];
const STARTED = new Date();
const LINE = "Google AI Overviews and AI Mode, checked from your postcode";
/** Naming Google's AI answers on a page. */
const MENTION = /\bAI Overviews?\b|\bAI Mode\b|\bGoogle(?:'s)? (?:Search )?AI\b/;
/** The methodology's cited study (not a claim about the product; see the guard). */
const STUDY = "statistically significant lift for ChatGPT or Google AI Mode";

let client: ReturnType<typeof postgres>;

type Page = () => Promise<React.ReactElement> | React.ReactElement;
const PAGES = {
  landing: () => import("@/app/(marketing)/page"),
  pricing: () => import("@/app/(marketing)/pricing/page"),
  about: () => import("@/app/(marketing)/about/page"),
  methodology: () => import("@/app/(marketing)/methodology/page"),
} as const;

async function html(page: keyof typeof PAGES): Promise<string> {
  const Page = (await PAGES[page]()).default as Page;
  return renderToStaticMarkup(await Page())
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function set(name: string, value: unknown): Promise<void> {
  const { updateGoogleSurfaceSetting } = await import("@/lib/governance/google-surfaces");
  await updateGoogleSurfaceSetting(name as never, value, null);
}

/** One plan card's HTML, or null when the page has no such card. */
function card(page: string, key: string): string | null {
  const start = page.indexOf(`data-plan-card="${key}"`);
  if (start < 0) return null;
  const next = page.indexOf('data-plan-card="', start + 1);
  return page.slice(start, next < 0 ? undefined : next);
}

/** The comparison table's row for a label: each plan's cell, ticked or not. */
function row(page: string, label: string): Record<string, string> | null {
  const start = page.indexOf(`data-row="from:${label}"`);
  if (start < 0) return null;
  const end = page.indexOf("</tr>", start);
  const cells = page
    .slice(start, end)
    .matchAll(/data-plan="([a-z_]+)" data-included="(true|false)"/g);
  return Object.fromEntries([...cells].map((m) => [m[1], m[2]]));
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  const existing = await client`SELECT count(*)::int AS n FROM feature_settings`;
  if (existing[0].n > 0) throw new Error("feature_settings isn't empty on the test database");
  // Each page's first import and render can take longer than a test's limit; done once here.
  for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) await html(page);
}, 120_000);

beforeEach(async () => {
  vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "true");
  vi.stubEnv("DATAFORSEO_LOGIN", "test-login");
  vi.stubEnv("DATAFORSEO_PASSWORD", "test-password");
  await client`DELETE FROM feature_settings WHERE key = ANY(${SETTING_KEYS})`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await client`DELETE FROM feature_settings WHERE key = ANY(${SETTING_KEYS})`;
  await client`DELETE FROM feature_setting_changes WHERE created_at >= ${STARTED}`;
  await client.end();
});

describe("the public pages say Google's AI answers only while the global setting has them on", () => {
  it("setting off (env switch on, credentials set): no public page mentions them", async () => {
    for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      const text = (await html(page)).replace(STUDY, "");
      expect(text, page).not.toMatch(MENTION);
      expect(text, page).not.toMatch(/data-google-ai-claim|data-methodology-google/);
    }
  });

  it("setting on: Growth, Agency and Agency Pro list them, Starter and Free don't; every page says what's done", async () => {
    await set("aiOverviewsEnabled", true);
    await set("aiModeEnabled", true);

    const pricing = await html("pricing");
    for (const key of ["growth", "agency", "agency_pro"])
      expect(card(pricing, key), key).toContain(LINE);
    expect(card(pricing, "starter")).not.toMatch(MENTION);
    expect(card(pricing, "free") ?? "").not.toMatch(MENTION);
    expect(row(pricing, LINE)).toMatchObject({
      starter: "false",
      growth: "true",
      agency: "true",
      agency_pro: "true",
      enterprise: "true",
    });

    const sentence =
      "On Growth plans and up, we also check Google's AI Overviews and AI Mode from your postcode, shown alongside the four AI engines (not counted in your score).";
    expect(await html("landing")).toContain(sentence);
    expect(await html("landing")).toContain("Do you check Google's AI Overviews and AI Mode?");
    expect(await html("about")).toContain(sentence);

    const methodology = await html("methodology");
    expect(methodology).toContain("data-methodology-google");
    expect(methodology).toContain("collected for us by DataForSEO");
    expect(methodology).toContain("logged out");
    expect(methodology).toContain("one place and one device (desktop)");
    expect(methodology).toContain("Results for Sydney NSW, not your suburb");
    expect(methodology).toContain("about 10 minutes after the four AI engines' answers");
    expect(methodology).toContain("not counted in the Visibility score");
    expect(methodology).toContain('"Couldn\'t be checked"');
  });

  it("only AI Overviews on: AI Mode is named nowhere, and the line says one surface", async () => {
    await set("aiOverviewsEnabled", true);
    const pricing = await html("pricing");
    expect(card(pricing, "growth")).toContain("Google AI Overviews, checked from your postcode");
    for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      expect((await html(page)).replace(STUDY, ""), page).not.toMatch(/\bAI Mode\b/);
    }
  });

  it("Google counted in the headline: the pages say it's counted", async () => {
    await set("aiModeEnabled", true);
    await set("countInHeadline", true);
    expect(await html("landing")).toContain("(counted in your Visibility score)");
    expect(await html("methodology")).toContain("counted in the Visibility score.");
    expect(await html("methodology")).not.toContain("not counted in the Visibility score");
  });

  it("switched off again: gone from the next render; the env switch off says nothing whatever is set", async () => {
    await set("aiOverviewsEnabled", true);
    expect(await html("landing")).toMatch(/data-google-ai-claim/);
    await set("aiOverviewsEnabled", false);
    expect(await html("landing")).not.toMatch(MENTION);

    await set("aiOverviewsEnabled", true);
    vi.stubEnv("GOOGLE_AI_SURFACES_ENABLED", "false");
    for (const page of Object.keys(PAGES) as (keyof typeof PAGES)[]) {
      expect((await html(page)).replace(STUDY, ""), page).not.toMatch(MENTION);
    }
  });
});
