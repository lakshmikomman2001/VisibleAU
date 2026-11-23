import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadGoogleAiClaim } from "@/components/domain/google-ai/load-google-ai-claim";
import { loadReportTiersClaim } from "@/components/domain/pricing/load-report-tiers-claim";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";
import { pricingMetaDescription } from "@/lib/pricing/gst";
import { REGION_HEADER } from "@/lib/region/header";
import { buildMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = buildMetadata({
  title: "Pricing",
  // GST-free pricing (11 Nov): from lib/pricing/gst.ts, which reads lib/product.ts GST_REGISTERED.
  description: pricingMetaDescription(),
  path: "/pricing",
});

export default async function PricingPage() {
  const headerList = await headers();
  // The middleware's region, on the request (Playwright-run follow-ups, 10 Nov, part 8: it was on the response,
  // so this was always null and every visitor got the AU page).
  const region = (headerList.get(REGION_HEADER) as Region | null) ?? "au";
  const showFreeTier = isFreeTierEnabled(region);
  const isAu = region === "au";
  // 16 Nov (Sri): Growth and up list Google's AI answers only while the global setting has them on.
  const googleAi = await loadGoogleAiClaim();
  // S01 part 8 (LLD 8.1.7): the "Reports" row only while report_v2 is on globally.
  const reportTiers = await loadReportTiersClaim();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16" data-pricing-region={region}>
      <h1 className="text-3xl font-bold text-center" style={{ color: "var(--text-primary)" }}>
        Pricing
      </h1>
      <p className="mt-2 text-center mb-10" style={{ color: "var(--text-secondary)" }}>
        Per-brand flat-rate. No per-prompt surprises.
      </p>
      <PricingTableClient
        showFreeTier={showFreeTier}
        defaultGstInclusive={isAu}
        googleAi={googleAi}
      />
      <TierComparisonTable
        showFreeTier={showFreeTier}
        googleAi={googleAi}
        reportTiers={reportTiers}
      />
    </div>
  );
}
