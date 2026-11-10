import { expect, test } from "@playwright/test";
import { GEO_COUNTRY_HEADER, REGION_HEADER } from "@/lib/region/header";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

// The pricing page's GST note (components/domain/pricing/pricing-table-client.tsx): GST included for AU.
const INC_GST_NOTE = "Prices include 10% GST for Australian customers.";
const EX_GST_NOTE = "GST of 10% applies to Australian customers at checkout.";

test.describe("F02: Region detection middleware", () => {
  // Playwright-run follow-ups (10 Nov), part 8: the middleware puts the region on the REQUEST (lib/region/
  // header.ts REGION_HEADER), where the pricing page reads it. F02-01..04 checked the old region header on the
  // response, which no page could read; the response carries none now. The country comes from Vercel's
  // x-vercel-ip-country request header (request.geo was removed in Next 15), so the geo cases, skipped as
  // "staging-only", run locally by sending it. F02-05 asserted `true` and was removed: tests/unit/region and
  // tests/unit/middleware/region-header.test.ts cover detectRegion and the middleware.

  for (const path of ["/api/health", "/sign-in", "/sign-up", "/pricing"]) {
    test(`F02: ${path} answers 200, with no region header on the response`, async ({ request }) => {
      const res = await request.get(`${BASE}${path}`);
      expect(res.status()).toBe(200);
      expect(res.headers()[REGION_HEADER]).toBeUndefined();
    });
  }

  const geoCases = [
    { geoCountry: "AU", expected: "au" },
    { geoCountry: "NZ", expected: "nz" },
    { geoCountry: "GB", expected: "uk" },
    { geoCountry: "DE", expected: "eu" },
  ];

  for (const gc of geoCases) {
    test(`F02: geo=${gc.geoCountry} → the ${gc.expected} pricing page`, async ({ request }) => {
      const res = await request.get(`${BASE}/pricing`, {
        headers: { [GEO_COUNTRY_HEADER]: gc.geoCountry },
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html).toContain(gc.expected === "au" ? INC_GST_NOTE : EX_GST_NOTE);
      const freeOn = process.env[`FREE_TIER_ENABLED_${gc.expected.toUpperCase()}`] === "true";
      expect(html.includes('data-plan-card="free"')).toBe(freeOn);
    });
  }
});
