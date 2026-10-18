/** Vunnara Build 1, Part C: "who pays this business?" -- the question
 * buyerType (designed for B2B SaaS customer segments) answers poorly
 * for a local-services brand ("smb" tells you nothing about whether a
 * plumber serves households, businesses, or both). Optional because
 * every row stored before this fix has no audience key at all --
 * lib/brands/audience.ts's resolveAudience() is the one place that
 * reads this, falling back to buyerType for those legacy rows. */
export type Audience = "households" | "businesses" | "both";

export interface BrandClassification {
  category: string;
  buyerType: "smb" | "enterprise" | "consumer" | "freelancer" | "agency" | "mixed";
  audience?: Audience;
  intentSignals: string[];
  competitors: string[];
  auRelevance: "au_founded" | "au_strong" | "au_present" | "au_limited";
  confidence: number;
}
