/**
 * Idempotent creation of the 8 tier prices (4 products × monthly/annual) in a
 * Stripe Sandbox, matching lib/pricing/tiers.ts's canonical AUD amounts
 * exactly. Safe to re-run — products are matched by name, prices by
 * lookup_key, so nothing is duplicated on a second run.
 *
 * Usage:
 *   STRIPE_SANDBOX_SECRET_KEY=sk_test_... pnpm tsx scripts/stripe/create-sandbox-prices.ts
 *
 * Prints a ready-to-paste STRIPE_PRICE_* → price_id block. Never prints the
 * secret key itself.
 */
import Stripe from "stripe";

interface TierSpec {
  tierKey: string;
  productName: string;
  monthlyEnvName: string;
  annualEnvName: string;
  monthlyCents: number;
  annualCents: number;
}

const TIERS: TierSpec[] = [
  {
    tierKey: "starter",
    productName: "Starter",
    monthlyEnvName: "STRIPE_PRICE_STARTER_MONTHLY",
    annualEnvName: "STRIPE_PRICE_STARTER_ANNUAL",
    monthlyCents: 9900,
    annualCents: 99000,
  },
  {
    tierKey: "growth",
    productName: "Growth",
    monthlyEnvName: "STRIPE_PRICE_GROWTH_MONTHLY",
    annualEnvName: "STRIPE_PRICE_GROWTH_ANNUAL",
    monthlyCents: 29900,
    annualCents: 299000,
  },
  {
    tierKey: "agency",
    productName: "Agency",
    monthlyEnvName: "STRIPE_PRICE_AGENCY_MONTHLY",
    annualEnvName: "STRIPE_PRICE_AGENCY_ANNUAL",
    monthlyCents: 49900,
    annualCents: 499000,
  },
  {
    tierKey: "agency_pro",
    productName: "Agency Pro",
    monthlyEnvName: "STRIPE_PRICE_AGENCY_PRO_MONTHLY",
    annualEnvName: "STRIPE_PRICE_AGENCY_PRO_ANNUAL",
    monthlyCents: 149900,
    annualCents: 1499000,
  },
];

async function findOrCreateProduct(stripe: Stripe, name: string): Promise<string> {
  const existing = await stripe.products.list({ limit: 100, active: true });
  const match = existing.data.find((p) => p.name === name);
  if (match) return match.id;

  const created = await stripe.products.create({ name, metadata: { vunnara_managed: "true" } });
  return created.id;
}

async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  lookupKey: string,
  unitAmount: number,
  interval: "month" | "year",
): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const created = await stripe.prices.create({
    product: productId,
    currency: "aud",
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    metadata: { vunnara_managed: "true" },
  });
  return created.id;
}

async function main() {
  const key = process.env.STRIPE_SANDBOX_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SANDBOX_SECRET_KEY is required");
    process.exit(1);
  }
  const stripe = new Stripe(key, { typescript: true });

  const envLines: string[] = [];

  for (const tier of TIERS) {
    const productId = await findOrCreateProduct(stripe, tier.productName);
    const monthlyId = await findOrCreatePrice(
      stripe,
      productId,
      `${tier.tierKey}_monthly`,
      tier.monthlyCents,
      "month",
    );
    const annualId = await findOrCreatePrice(
      stripe,
      productId,
      `${tier.tierKey}_annual`,
      tier.annualCents,
      "year",
    );

    console.log(
      `${tier.productName}: product=${productId} monthly=${monthlyId} annual=${annualId}`,
    );
    envLines.push(`${tier.monthlyEnvName}=${monthlyId}`);
    envLines.push(`${tier.annualEnvName}=${annualId}`);
  }

  console.log("\n=== Paste into Vercel (Production) env ===\n");
  console.log(envLines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
