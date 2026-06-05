import { headers } from "next/headers";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";

export default async function PricingPage() {
  const headerList = await headers();
  const region = (headerList.get("x-visibleau-region") as Region) ?? "au";
  const showFreeTier = isFreeTierEnabled(region);

  const tiers = [
    ...(showFreeTier
      ? [{ name: "Free", price: "A$0", description: "1 brand, 2 engines, 1 audit/month" }]
      : []),
    { name: "Starter", price: "A$99/mo", description: "1 brand, 4 engines, weekly audits" },
    { name: "Growth", price: "A$299/mo", description: "1 brand, 4 engines, 3x/week audits" },
    { name: "Agency", price: "A$499/mo", description: "5 brands, 4 engines, daily audits" },
    { name: "Agency Pro", price: "A$1,499/mo", description: "25 brands, 4 engines, 2x/day audits" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold text-center">Pricing</h1>
      <p className="mt-2 text-center text-muted-foreground">
        Per-brand flat-rate. No per-prompt surprises.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.name} className="rounded-lg border p-6">
            <h3 className="text-lg font-semibold">{tier.name}</h3>
            <p className="mt-1 text-2xl font-bold">{tier.price}</p>
            <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
