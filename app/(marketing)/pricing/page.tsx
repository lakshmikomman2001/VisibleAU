import { headers } from "next/headers";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";

export default async function PricingPage() {
  const headerList = await headers();
  const region = (headerList.get("x-visibleau-region") as Region) ?? "au";
  const showFreeTier = isFreeTierEnabled(region);
  const isAu = region === "au";

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1
        className="text-3xl font-bold text-center"
        style={{ color: "var(--text-primary)" }}
      >
        Pricing
      </h1>
      <p
        className="mt-2 text-center mb-10"
        style={{ color: "var(--text-secondary)" }}
      >
        Per-brand flat-rate. No per-prompt surprises.
      </p>
      <PricingTableClient
        showFreeTier={showFreeTier}
        defaultGstInclusive={isAu}
      />
    </div>
  );
}
