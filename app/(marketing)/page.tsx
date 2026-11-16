import type { Metadata } from "next";
import { loadGoogleAiClaim } from "@/components/domain/google-ai/load-google-ai-claim";
import { WhatsMeasured } from "@/components/domain/landing/dimensions";
import { EnginesSupported } from "@/components/domain/landing/engines-supported";
import { FaqSection } from "@/components/domain/landing/faq-section";
import { Hero } from "@/components/domain/landing/hero";
import { HowItWorks } from "@/components/domain/landing/how-it-works";
import { PricingTeaser } from "@/components/domain/landing/pricing-teaser";
import { Testimonials } from "@/components/domain/landing/testimonials";
import { TrustBadges } from "@/components/domain/landing/trust-badges";
import { VerticalsSupported } from "@/components/domain/landing/verticals-supported";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateMetadata(): Metadata {
  return buildMetadata({ title: undefined, path: "/" });
}

export default async function LandingPage() {
  // 16 Nov (Sri): Google's AI answers, said only while the global setting has them on (components/domain/google-ai).
  const googleAi = await loadGoogleAiClaim();
  return (
    <>
      <Hero />
      <TrustBadges />
      <HowItWorks />
      <EnginesSupported googleAi={googleAi} />
      <VerticalsSupported />
      <WhatsMeasured />
      <PricingTeaser />
      <Testimonials />
      <FaqSection googleAi={googleAi} />
    </>
  );
}
