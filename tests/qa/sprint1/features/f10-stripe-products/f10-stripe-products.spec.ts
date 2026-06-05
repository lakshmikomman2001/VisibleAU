import { expect, test } from "@playwright/test";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-04-10" });

test.describe("F10: Stripe products and prices", () => {
  test("F10-01: All 4 recurring subscription products exist in Stripe test mode", async () => {
    const products = await stripe.products.list({ limit: 50, active: true });
    const names = products.data.map((p) => p.name);
    expect(names).toContain("VisibleAU Starter");
    expect(names).toContain("VisibleAU Growth");
    expect(names).toContain("VisibleAU Agency");
    expect(names).toContain("VisibleAU Agency Pro");
  });

  test("F10-02: One-off audit product exists", async () => {
    const products = await stripe.products.list({ limit: 50, active: true });
    const oneOff = products.data.find((p) => p.name.toLowerCase().includes("one-off"));
    expect(oneOff, "One-off audit product must exist").toBeDefined();
    expect(oneOff!.metadata.type).toBe("one_off_audit");
  });

  test("F10-03: Each recurring product has monthly AND annual prices", async () => {
    const products = await stripe.products.list({ limit: 50, active: true });
    const tiers = ["Starter", "Growth", "Agency", "Agency Pro"];
    for (const tier of tiers) {
      const product = products.data.find((p) => p.name === `VisibleAU ${tier}`);
      expect(product, `VisibleAU ${tier} must exist`).toBeDefined();
      const prices = await stripe.prices.list({ product: product!.id, active: true });
      const monthly = prices.data.find((p) => p.recurring?.interval === "month");
      const annual = prices.data.find((p) => p.recurring?.interval === "year");
      expect(monthly, `${tier} monthly price must exist`).toBeDefined();
      expect(annual, `${tier} annual price must exist`).toBeDefined();
    }
  });

  test("F10-04: Agency AND Agency Pro have auditsPerBrandPerMonth metadata (W6 fix — both use per-brand limits)", async () => {
    const products = await stripe.products.list({ limit: 50, active: true });
    // W6 fix applies to BOTH Agency and Agency Pro — not just Agency.
    // Agency: auditsPerBrandPerMonth=30, brands=5
    // Agency Pro: auditsPerBrandPerMonth=60, brands=25
    for (const tierName of ["Agency", "Agency Pro"]) {
      const product = products.data.find((p) => p.name === `VisibleAU ${tierName}`);
      expect(product, `VisibleAU ${tierName} must exist`).toBeDefined();
      expect(
        product!.metadata.auditsPerBrandPerMonth,
        `${tierName} must have auditsPerBrandPerMonth (W6 fix)`,
      ).toBeDefined();
      expect(product!.metadata).not.toHaveProperty("audits"); // old pattern removed by W6 fix
    }
  });

  test("F10-05: Prices are in AUD and > 0", async () => {
    const prices = await stripe.prices.list({ limit: 100, active: true });
    const recurring = prices.data.filter((p) => p.recurring);
    for (const price of recurring) {
      expect(price.currency).toBe("aud");
      expect(price.unit_amount).toBeGreaterThan(0);
    }
  });
});
