import type { TriggerContext, TriggeredRecommendation } from "./types";

const UNIVERSAL_TEMPLATES: Array<{
  key: string;
  dimension: string;
  title: string;
  action: string;
  expectedImpactScore: "high" | "medium" | "low";
  threshold: (ctx: TriggerContext) => boolean;
}> = [
  {
    key: "wikipedia-article",
    dimension: "frequency",
    title: "Add a Wikipedia entry for your business",
    action:
      "Draft a neutral, citation-backed Wikipedia article about your business using the AI template below.",
    expectedImpactScore: "high",
    threshold: (ctx) => parseFloat(ctx.scoreFrequency ?? "100") < 40,
  },
  {
    key: "au-local-citations",
    dimension: "frequency",
    title: "Your AU local directory listings are incomplete",
    action:
      "Submit your business to hipages, Yellow Pages AU, ServiceSeeking, and Word of Mouth with consistent NAP data.",
    expectedImpactScore: "high",
    threshold: (ctx) => parseFloat(ctx.scoreFrequency ?? "100") < 50,
  },
  {
    key: "faq-content",
    dimension: "context",
    title: "Add FAQ schema to your main service page",
    action:
      'Add a FAQPage schema block answering "What suburbs do you service?" and "What is your call-out fee?".',
    expectedImpactScore: "medium",
    threshold: (ctx) => parseFloat(ctx.scoreContextNumeric ?? "100") < 50,
  },
  {
    key: "expert-quotes",
    dimension: "accuracy",
    title: "Add attributed expert quotes to your about page",
    action:
      "Add 2-3 quotes from industry bodies (e.g. Master Plumbers AU) with attribution and date.",
    expectedImpactScore: "medium",
    threshold: (ctx) => parseFloat(ctx.scoreAccuracy ?? "100") < 60,
  },
  {
    key: "cited-statistics",
    dimension: "accuracy",
    title: "Cite verifiable statistics on your service pages",
    action: "Add 1-2 industry statistics with source links (e.g. WaterNSW, ABS building permits).",
    expectedImpactScore: "medium",
    threshold: (ctx) => parseFloat(ctx.scoreAccuracy ?? "100") < 70,
  },
  {
    key: "stale-content",
    dimension: "accuracy",
    title: "Update pages that haven't changed in 12+ months",
    action: 'Add a "Last updated" date and refresh pricing, availability, and contact details.',
    expectedImpactScore: "high",
    threshold: (ctx) => parseFloat(ctx.scoreAccuracy ?? "100") < 50,
  },
  {
    key: "comparison-article",
    dimension: "position",
    title: "Write a service comparison guide",
    action:
      "Publish a 600-word guide comparing your service type with alternatives, citing pros/cons.",
    expectedImpactScore: "medium",
    threshold: (ctx) => parseFloat(ctx.scorePosition ?? "100") < 40,
  },
  {
    key: "reddit-absence",
    dimension: "frequency",
    title: "Get mentioned in relevant Reddit threads",
    action:
      "Identify 3 active subreddits (r/sydney, r/ausfinance, r/homeimprovement) and contribute helpful answers.",
    expectedImpactScore: "medium",
    threshold: (ctx) => parseFloat(ctx.scoreFrequency ?? "100") < 45,
  },
  {
    key: "medium-presence",
    dimension: "frequency",
    title: "Publish a how-to article on Medium",
    action:
      "Write a 500-word practical guide on a common customer question. Link back to your service page.",
    expectedImpactScore: "low",
    threshold: (ctx) => parseFloat(ctx.scoreFrequency ?? "100") < 35,
  },
  {
    key: "linkedin-presence",
    dimension: "frequency",
    title: "Create or update your LinkedIn company page",
    action: "Complete all sections: about, services, location. Post one update per fortnight.",
    expectedImpactScore: "low",
    threshold: (ctx) => parseFloat(ctx.scoreFrequency ?? "100") < 30,
  },
  {
    key: "press-mentions",
    dimension: "frequency",
    title: "Pitch your business story to local AU media",
    action:
      "Contact one AU trade publication or local news outlet with a newsworthy angle (e.g. milestone, award).",
    expectedImpactScore: "medium",
    threshold: (ctx) =>
      parseFloat(ctx.scoreFrequency ?? "100") < 40 &&
      parseFloat(ctx.scoreSentimentNumeric ?? "100") > 50,
  },
];

export function evaluateTriggers(ctx: TriggerContext): TriggeredRecommendation[] {
  return UNIVERSAL_TEMPLATES.filter((t) => t.threshold(ctx)).map(
    ({ key, dimension, title, action, expectedImpactScore }) => ({
      recommendationKey: key,
      dimension,
      title,
      action,
      expectedImpactScore,
      evidenceRefs: [],
    }),
  );
}
