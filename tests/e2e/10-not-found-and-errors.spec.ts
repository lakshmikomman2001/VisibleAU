/**
 * Leftovers task, part 1 (17 Nov): a not-found inside a brand's pages answers 404 with exactly one signed-in shell.
 *
 * The root app/loading.tsx wrapped the whole app in one Suspense boundary, so every response started streaming
 * (a 200) before a page could say "not found", and a notFound() or error inside it switched that boundary to client
 * rendering: on about one load in four the copy of the shell that had already streamed stayed in the page, hidden
 * (<div hidden id="S:0">, an empty <main data-app-main>). Measured on the e2e dev server with this spec's loads:
 * Consensus (its layout's notFound()) 10 of 40 doubled, every 404 a 200. The root loading.tsx is gone, errors
 * inside the app render in it (app/(auth)/error.tsx), and an unknown URL under a brand is a 404 page inside it
 * (app/(auth)/brands/[brandId]/[...missing]/page.tsx).
 *
 * Run: npx playwright test tests/e2e/10-not-found-and-errors.spec.ts (the e2e server, pnpm e2e:server).
 */
import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
import { e2eDatabaseUrl } from "./helpers/e2e-database";
import {
  addSpecBrand,
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
  signInByApi,
} from "./helpers/spec-account";

const LOADS = 40;
const WIDTHS = [320, 375, 768, 1280];

let account: SpecAccount;
let brandId = "";
let deletedBrandId = "";

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-10-not-found", plan: "growth" });
  brandId = await addSpecBrand(account, {
    name: "Not Found Spec Brand",
    domain: "notfound.example.com",
  });
  deletedBrandId = await addSpecBrand(account, {
    name: "Not Found Spec Deleted",
    domain: "deleted.notfound.example.com",
  });
  const sql = postgres(e2eDatabaseUrl(), { max: 1 });
  try {
    await sql`UPDATE brands SET deleted_at = now() WHERE id = ${deletedBrandId}`;
  } finally {
    await sql.end();
  }
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

/** One full load: its status, the shells in the page (visible or not), and whether the 404 page shows. */
async function load(page: Page, url: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  const response = await page.goto(url, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const dom = await page.evaluate(() => ({
    shells: document.querySelectorAll("[data-app-shell]").length,
    mains: document.querySelectorAll("[data-app-main]").length,
    hiddenShells: document.querySelectorAll("[hidden] [data-app-shell]").length,
  }));
  const notFoundShown = await page.getByText("Couldn't find that page.").isVisible();
  return { status: response?.status() ?? 0, ...dom, notFoundShown };
}

/** Loads `url` LOADS times and returns each load that wasn't a 404 with exactly one shell and the 404 page. */
async function notFoundLoads(page: Page, url: string) {
  const bad: string[] = [];
  for (let i = 0; i < LOADS; i++) {
    const width = WIDTHS[i % WIDTHS.length];
    const r = await load(page, url, width);
    if (
      r.status !== 404 ||
      r.shells !== 1 ||
      r.mains !== 1 ||
      r.hiddenShells !== 0 ||
      !r.notFoundShown
    ) {
      bad.push(`load ${i + 1} at ${width}px: ${JSON.stringify(r)}`);
    }
  }
  return bad;
}

test.describe("a not-found inside the app: 404 and one shell, 40 of 40", () => {
  test.describe.configure({ timeout: 300_000 });

  test("a URL under a brand that isn't one of its pages", async ({ page }) => {
    await signInByApi(page, account);
    expect(await notFoundLoads(page, `/brands/${brandId}/no-such-page`)).toEqual([]);
  });

  test("a deleted brand's page", async ({ page }) => {
    await signInByApi(page, account);
    expect(await notFoundLoads(page, `/brands/${deletedBrandId}/visibility`)).toEqual([]);
  });

  test("a page whose layout says not found (a trust check that isn't built)", async ({ page }) => {
    const unbuilt = (
      [
        ["consensus", "consensusScore"],
        ["hallucinations", "hallucinationDetection"],
        ["linkedin-presence", "linkedinPresence"],
      ] as const
    ).find(([, check]) => !TRUST_CHECK_IMPLEMENTED[check]);
    test.skip(!unbuilt, "every trust check is built: no page answers 404 from its layout");
    await signInByApi(page, account);
    expect(await notFoundLoads(page, `/brands/${brandId}/trust/${unbuilt?.[0]}`)).toEqual([]);
  });
});

test("status codes: a page is 200, a page that isn't there or isn't yours is 404", async ({
  page,
}) => {
  await signInByApi(page, account);
  const cases: [url: string, status: number][] = [
    [`/brands/${brandId}`, 200],
    [`/brands/${brandId}/trust/evidence`, 200],
    [`/brands/${brandId}/no-such-page`, 404],
    [`/brands/${deletedBrandId}`, 404],
    [`/brands/${randomUUID()}/visibility`, 404],
    ["/brands/not-a-uuid", 404],
    ["/audits/not-a-uuid", 404],
  ];
  for (const [url, status] of cases) {
    const r = await load(page, url, 1280);
    expect(r.status, url).toBe(status);
    expect(r.shells, `${url}: one shell`).toBe(1);
    expect(r.hiddenShells, `${url}: no hidden shell`).toBe(0);
  }
});
