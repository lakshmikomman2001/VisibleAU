/**
 * tests/e2e/backend/06-region-and-flags.test.ts
 *
 * E2E: the visitor's region reaches the pricing page, and its Free-tier flag decides the Free card.
 *
 * Playwright-run follow-ups (10 Nov), part 8: this checked the old region header on the RESPONSE of
 * /au/, /uk/ and /au/pricing, the header the pricing page never saw (it reads request headers), and those
 * region routes have no pages. The middleware puts the region on the request now (lib/region/header.ts
 * REGION_HEADER), from Vercel's x-vercel-ip-country request header (GEO_COUNTRY_HEADER; request.geo was removed
 * in Next 15), so this sends that header and reads what /pricing renders: the GST note (included for AU only)
 * and the Free card (`data-plan-card="free"`, shown when FREE_TIER_ENABLED_<REGION> is "true"). setup.ts loads
 * the same .env.test.local the server reads.
 */

import { describe, expect, it } from "vitest";
import { GEO_COUNTRY_HEADER, REGION_HEADER } from "@/lib/region/header";
import { getPublic, request } from "./helpers/http";

const INC_GST_NOTE = "Prices include 10% GST for Australian customers.";
const EX_GST_NOTE = "GST of 10% applies to Australian customers at checkout.";

const pricingFrom = (country: string | null, extra: Record<string, string> = {}) =>
  request("/pricing", {
    method: "GET",
    headers: { ...(country ? { [GEO_COUNTRY_HEADER]: country } : {}), ...extra },
  });

describe("Region detection — the pricing page gets the visitor's region", () => {
  const cases: Array<{ country: string | null; region: string }> = [
    { country: null, region: "au" },
    { country: "AU", region: "au" },
    { country: "NZ", region: "nz" },
    { country: "GB", region: "uk" },
    { country: "US", region: "us" },
    { country: "CA", region: "ca" },
    { country: "DE", region: "eu" },
    { country: "JP", region: "au" },
  ];

  for (const { country, region } of cases) {
    it(`a visitor from ${country ?? "an unknown country"} → the ${region} page`, async () => {
      const { status, body, headers } = await pricingFrom(country);
      expect(status).toBe(200);
      expect(body as string).toContain(region === "au" ? INC_GST_NOTE : EX_GST_NOTE);
      expect(headers.get(REGION_HEADER)).toBeNull();
    });
  }

  it("a visitor can't choose a region by sending the header themselves", async () => {
    const { body } = await pricingFrom("AU", { [REGION_HEADER]: "uk" });
    expect(body as string).toContain(INC_GST_NOTE);
  });

  it("api routes still answer (health has no region)", async () => {
    const { status } = await getPublic("/api/health");
    expect(status).toBe(200);
  });
});

describe("Feature flags — isFreeTierEnabled(region) decides the Free card", () => {
  for (const { country, region } of [
    { country: "AU", region: "au" },
    { country: "GB", region: "uk" },
  ]) {
    it(`${region}: the Free card iff FREE_TIER_ENABLED_${region.toUpperCase()}=true`, async () => {
      const { body } = await pricingFrom(country);
      const freeOn = process.env[`FREE_TIER_ENABLED_${region.toUpperCase()}`] === "true";
      expect((body as string).includes('data-plan-card="free"')).toBe(freeOn);
    });
  }
});
