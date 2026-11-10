import type { Metadata } from "next";
import { headers } from "next/headers";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";
import { REGION_HEADER } from "@/lib/region/header";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Pricing",
  description:
    "Per-brand flat-rate pricing for AI search visibility audits. No per-prompt surprises. All prices in AUD inc GST.",
  path: "/pricing",
});

export default async function PricingPage() {
  const headerList = await headers();
  // The middleware's region, on the request (Playwright-run follow-ups, 10 Nov, part 8: it was on the response,
  // so this was always null and every visitor got the AU page).
  const region = (headerList.get(REGION_HEADER) as Region | null) ?? "au";
  const showFreeTier = isFreeTierEnabled(region);
  const isAu = region === "au";

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-bold text-center" style={{ color: "var(--text-primary)" }}>
        Pricing
      </h1>
      <p className="mt-2 text-center mb-10" style={{ color: "var(--text-secondary)" }}>
        Per-brand flat-rate. No per-prompt surprises.
      </p>
      <PricingTableClient showFreeTier={showFreeTier} defaultGstInclusive={isAu} />
      <TierComparisonTable showFreeTier={showFreeTier} />
    </div>
  );
}
