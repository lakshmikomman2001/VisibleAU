import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const products = [
  {
    id: "starter",
    name: "Starter",
    priceAud: 9900,
    auditsPerMonth: 4,
    auditsPerBrand: null,
    brands: 1,
    frequency: "weekly",
  },
  {
    id: "growth",
    name: "Growth",
    priceAud: 29900,
    auditsPerMonth: 12,
    auditsPerBrand: null,
    brands: 1,
    frequency: "3x_weekly",
  },
  {
    id: "agency",
    name: "Agency",
    priceAud: 49900,
    auditsPerMonth: null,
    auditsPerBrand: 30,
    brands: 5,
    frequency: "daily",
  },
  {
    id: "agency_pro",
    name: "Agency Pro",
    priceAud: 149900,
    auditsPerMonth: null,
    auditsPerBrand: 60,
    brands: 25,
    frequency: "2x_daily",
  },
];

async function main() {
  for (const p of products) {
    const product = await stripe.products.create({
      name: `VisibleAU ${p.name}`,
      metadata: {
        tier: p.id,
        brands: String(p.brands),
        frequency: p.frequency,
        ...(p.auditsPerMonth !== null && { auditsPerMonth: String(p.auditsPerMonth) }),
        ...(p.auditsPerBrand !== null && { auditsPerBrandPerMonth: String(p.auditsPerBrand) }),
      },
    });

    await stripe.prices.create({
      product: product.id,
      unit_amount: p.priceAud,
      currency: "aud",
      recurring: { interval: "month" },
      metadata: { tier: p.id, billing: "monthly" },
      nickname: `${p.name} monthly`,
    });

    await stripe.prices.create({
      product: product.id,
      unit_amount: p.priceAud * 10,
      currency: "aud",
      recurring: { interval: "year" },
      metadata: { tier: p.id, billing: "annual" },
      nickname: `${p.name} annual`,
    });

    console.log(`Created ${p.name}: ${product.id} (monthly + annual)`);
  }

  const oneOff = await stripe.products.create({
    name: "VisibleAU One-off Audit",
    metadata: { type: "one_off_audit" },
  });
  await stripe.prices.create({
    product: oneOff.id,
    unit_amount: 29900,
    currency: "aud",
    metadata: { type: "one_off_audit" },
    nickname: "One-off audit",
  });
  console.log(`Created One-off Audit: ${oneOff.id}`);
}

main().catch(console.error);
