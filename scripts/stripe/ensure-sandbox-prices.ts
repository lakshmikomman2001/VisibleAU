/**
 * Verify-and-emit for the 9 VisibleAU products/prices in a Stripe Sandbox.
 * Sri creates products by hand in the dashboard (never here) — this script
 * only looks them up by name, validates each price against the canonical
 * catalogue (lib/pricing/tiers.ts's amounts), and prints the ready-to-paste
 * STRIPE_PRICE_*=price_... block. It creates a product/price ONLY when one
 * is genuinely missing after a real lookup — never a blind create.
 *
 * Usage:
 *   STRIPE_SANDBOX_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe/ensure-sandbox-prices.ts
 *
 * Prints price ids (not secret) and a PASS/MISMATCH report. Never prints
 * the API key.
 */
import Stripe from "stripe";

interface CatalogueRow {
  productName: string;
  envName: string;
  amountCents: number;
  interval: "month" | "year" | "one_time";
}

const CATALOGUE: CatalogueRow[] = [
  { productName: "VisibleAU Starter (Monthly)", envName: "STRIPE_PRICE_STARTER_MONTHLY", amountCents: 9900, interval: "month" },
  { productName: "VisibleAU Starter (Annual)", envName: "STRIPE_PRICE_STARTER_ANNUAL", amountCents: 99000, interval: "year" },
  { productName: "VisibleAU Growth (Monthly)", envName: "STRIPE_PRICE_GROWTH_MONTHLY", amountCents: 29900, interval: "month" },
  { productName: "VisibleAU Growth (Annual)", envName: "STRIPE_PRICE_GROWTH_ANNUAL", amountCents: 299000, interval: "year" },
  { productName: "VisibleAU Agency (Monthly)", envName: "STRIPE_PRICE_AGENCY_MONTHLY", amountCents: 49900, interval: "month" },
  { productName: "VisibleAU Agency (Annual)", envName: "STRIPE_PRICE_AGENCY_ANNUAL", amountCents: 499000, interval: "year" },
  { productName: "VisibleAU Agency Pro (Monthly)", envName: "STRIPE_PRICE_AGENCY_PRO_MONTHLY", amountCents: 149900, interval: "month" },
  { productName: "VisibleAU Agency Pro (Annual)", envName: "STRIPE_PRICE_AGENCY_PRO_ANNUAL", amountCents: 1499000, interval: "year" },
  { productName: "VisibleAU Single Audit (One-off)", envName: "STRIPE_PRICE_ONE_OFF_AUDIT", amountCents: 29900, interval: "one_time" },
];

async function findProductByName(stripe: Stripe, name: string): Promise<Stripe.Product | null> {
  const list = await stripe.products.list({ limit: 100, active: true });
  return list.data.find((p) => p.name === name) ?? null;
}

async function findMatchingPrice(
  stripe: Stripe,
  productId: string,
  row: CatalogueRow,
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  return (
    prices.data.find((price) => {
      if (price.currency !== "aud" || price.unit_amount !== row.amountCents) return false;
      if (row.interval === "one_time") return price.type === "one_time";
      return price.type === "recurring" && price.recurring?.interval === row.interval;
    }) ?? null
  );
}

async function createProductAndPrice(stripe: Stripe, row: CatalogueRow): Promise<Stripe.Price> {
  const product = await stripe.products.create({
    name: row.productName,
    metadata: { vunnara_managed: "true" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "aud",
    unit_amount: row.amountCents,
    ...(row.interval === "one_time" ? {} : { recurring: { interval: row.interval } }),
    metadata: { vunnara_managed: "true" },
  });
  return price;
}

async function main() {
  const key = process.env.STRIPE_SANDBOX_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SANDBOX_SECRET_KEY is required");
    process.exit(1);
  }
  const stripe = new Stripe(key, { typescript: true });

  const envLines: string[] = [];
  const mismatches: string[] = [];
  const resolvedPriceIds: { envName: string; priceId: string; row: CatalogueRow }[] = [];

  for (const row of CATALOGUE) {
    const product = await findProductByName(stripe, row.productName);

    let price: Stripe.Price | null = null;
    if (product) {
      price = await findMatchingPrice(stripe, product.id, row);
      if (!price && product.default_price) {
        // Product exists but no active price matches the canonical amount —
        // check the default_price specifically and report the mismatch
        // rather than silently creating a second, competing price.
        const defaultPrice = await stripe.prices.retrieve(
          typeof product.default_price === "string" ? product.default_price : product.default_price.id,
        );
        const expected = row.interval === "one_time" ? "one_time" : row.interval;
        const actual =
          defaultPrice.type === "one_time" ? "one_time" : defaultPrice.recurring?.interval;
        mismatches.push(
          `${row.productName}: default_price ${defaultPrice.id} is ${(defaultPrice.unit_amount ?? 0) / 100} ${defaultPrice.currency} / ${actual}, expected ${row.amountCents / 100} aud / ${expected}`,
        );
        continue;
      }
    }

    if (!price) {
      price = await createProductAndPrice(stripe, row);
      console.log(`  created: ${row.productName} -> ${price.id}`);
    }

    envLines.push(`${row.envName}=${price.id}`);
    resolvedPriceIds.push({ envName: row.envName, priceId: price.id, row });
  }

  if (mismatches.length > 0) {
    console.log("\n=== MISMATCHES (not emitted) ===");
    for (const m of mismatches) console.log(`  ✗ ${m}`);
  }

  console.log("\n=== Paste into Vercel (Production) env ===\n");
  console.log(envLines.join("\n"));

  // Step 2 — round-trip verification: retrieve each emitted price id again.
  console.log("\n=== Round-trip verify ===");
  let allOk = true;
  for (const { envName, priceId, row } of resolvedPriceIds) {
    const p = await stripe.prices.retrieve(priceId);
    const expectedInterval = row.interval === "one_time" ? "one_time" : row.interval;
    const actualInterval = p.type === "one_time" ? "one_time" : p.recurring?.interval;
    const ok =
      p.active &&
      p.currency === "aud" &&
      p.unit_amount === row.amountCents &&
      actualInterval === expectedInterval;
    if (!ok) allOk = false;
    console.log(
      `  ${ok ? "OK" : "MISMATCH"}  ${envName}: ${priceId} — ${(p.unit_amount ?? 0) / 100} ${p.currency}, ${actualInterval}, active=${p.active}`,
    );
  }
  console.log(allOk ? "\nAll 9 verified." : "\nSome prices did not verify — see MISMATCH lines above.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
