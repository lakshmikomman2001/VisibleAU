import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo/metadata";
import { Hero } from "@/components/domain/landing/hero";
import { TrustBadges } from "@/components/domain/landing/trust-badges";
import { HowItWorks } from "@/components/domain/landing/how-it-works";
import { EnginesSupported } from "@/components/domain/landing/engines-supported";
import { VerticalsSupported } from "@/components/domain/landing/verticals-supported";
import { WhatsMeasured } from "@/components/domain/landing/dimensions";
import { PricingTeaser } from "@/components/domain/landing/pricing-teaser";
import { FaqSection } from "@/components/domain/landing/faq-section";
import { Testimonials } from "@/components/domain/landing/testimonials";

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
