import type { Metadata } from "next";
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

export default function LandingPage() {
  return (
    <>
      <Hero />
      <TrustBadges />
      <HowItWorks />
      <EnginesSupported />
      <VerticalsSupported />
      <WhatsMeasured />
      <PricingTeaser />
      <Testimonials />
      <FaqSection />
    </>
  );
}
