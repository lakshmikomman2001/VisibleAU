import type { Metadata } from "next";
import { headers } from "next/headers";
import { loadGoogleAiClaim } from "@/components/domain/google-ai/load-google-ai-claim";
import { WhatsMeasured } from "@/components/domain/landing/dimensions";
import { EarlyAccess } from "@/components/domain/landing/early-access";
import { EnginesSupported } from "@/components/domain/landing/engines-supported";
import { FaqSection } from "@/components/domain/landing/faq-section";
import { Hero } from "@/components/domain/landing/hero";
import { HowItWorks } from "@/components/domain/landing/how-it-works";
import { PricingTeaser } from "@/components/domain/landing/pricing-teaser";
import { TrustBadges } from "@/components/domain/landing/trust-badges";
import { VerticalsSupported } from "@/components/domain/landing/verticals-supported";
import type { Region } from "@/db/schema/enums";
import { isFreeTierEnabled } from "@/lib/feature-flags";
import { REGION_HEADER } from "@/lib/region/header";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: undefined, path: "/" });
}

export default async function LandingPage() {
  // 16 Nov (Sri): Google's AI answers, said only while the global setting has them on (components/domain/google-ai).
  const googleAi = await loadGoogleAiClaim();
  // 19 Nov (Sri's review): the Free plan is listed here exactly where /pricing lists it -- the same switch for the
  // visitor's region (the middleware's REGION_HEADER, as app/(marketing)/pricing/page.tsx reads it).
  const region = ((await headers()).get(REGION_HEADER) as Region | null) ?? "au";
  const showFreeTier = isFreeTierEnabled(region);
  return (
    <>
      <Hero />
      <TrustBadges showFreeTier={showFreeTier} />
      <HowItWorks showFreeTier={showFreeTier} />
      <EnginesSupported googleAi={googleAi} />
      <VerticalsSupported />
      <WhatsMeasured />
      <PricingTeaser showFreeTier={showFreeTier} />
      <EarlyAccess />
      <FaqSection googleAi={googleAi} showFreeTier={showFreeTier} />
    </>
  );
}
