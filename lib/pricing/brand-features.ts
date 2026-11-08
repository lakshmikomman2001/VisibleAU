import { getTierDefinition, tierRank } from "./tiers";

/**
 * 8 Nov (brand-feature locks and pricing claims, part 1; Sri: "no page shows a raw 403 or an empty
 * error") -- the brand pages' features that a plan has by its place in the order: Starter, then Growth,
 * then Agency, and every plan above. The routes read their plan from here
 * (assertTier(org, brandFeaturePlan(...)), lib/governance/access-control.ts), and the pages lock from here
 * before they fetch anything (components/domain/pricing/brand-feature-gate.ts and plan-lock.tsx), so a page
 * and its route can't disagree. tests/helpers/plan-gates.ts lists which page reaches which route, and
 * tests/unit/pricing/plan-gate-entry-points.test.ts holds the app to it.
 *
 * The plan-feature gates (client portal, webhooks, ...) stay in lib/pricing/tiers.ts: those are named on the
 * pricing page. A feature here with no route of its own (health_check, autopilot) is a page that needs
 * several, and locks at their plan.
 *
 * Visibility and Retrieval have no entry, on purpose (Sri, 8 Nov): every plan, Free included, gets Visibility,
 * and Retrieval's own pages are open too; only Agent analytics (below, from Starter) is gated.
 */
interface BrandFeatureDefinition {
  /** As the app names it: "<name> is part of the Growth plan". */
  name: string;
  /** Under the locked card's heading. */
  description: string;
  /** The lowest plan with it (a tiers.ts key). */
  plan: "starter" | "growth" | "agency";
}

export const BRAND_FEATURES = {
  agent_analytics: {
    name: "Agent analytics",
    description: "Which AI crawlers visit your site, from the server logs you upload",
    plan: "starter",
  },
  trust_intelligence: {
    name: "Trust intelligence",
    description: "Hallucination risk and an overall trust score, from your audits",
    plan: "growth",
  },
  consensus_score: {
    name: "Cross-platform consensus",
    description: "Whether other sites describe your business the way your website does",
    plan: "growth",
  },
  entity_score: {
    name: "Entity authority score",
    description: "How clearly AI engines can tell your business apart as one entity",
    plan: "growth",
  },
  hallucinations: {
    name: "Hallucination tracking",
    description: "Wrong claims AI engines made about your business, to review and resolve",
    plan: "growth",
  },
  linkedin_presence: {
    name: "LinkedIn presence",
    description: "Your company page as AI engines can see it",
    plan: "growth",
  },
  youtube_presence: {
    name: "YouTube presence",
    description: "Your channel as AI engines can see it",
    plan: "growth",
  },
  citation_sources: {
    name: "Citation sources",
    description: "Which kinds of sites AI answers cite in your category, and where you're missing",
    plan: "growth",
  },
  agent_readiness: {
    name: "Agent readiness",
    description: "How ready your site is for AI agents to read and act on",
    plan: "growth",
  },
  crawl_referral_ratio: {
    name: "Crawl-to-referral ratio",
    description: "How many AI crawler visits turn into visitors sent your way",
    plan: "growth",
  },
  cdn_shield_check: {
    name: "CDN and firewall check",
    description: "Whether your CDN or firewall blocks the AI crawlers that visit",
    plan: "growth",
  },
  page_coverage: {
    name: "Page coverage",
    description: "Which of your pages AI crawlers read, and which they never reach",
    plan: "growth",
  },
  site_readiness: {
    name: "Site readiness",
    description: "Your technical audit's score, for the Health check",
    plan: "growth",
  },
  latest_audit_summary: {
    name: "Latest audit summary",
    description:
      "Your latest audit's results and actions, for the Health check, Autopilot and PDFs",
    plan: "growth",
  },
  health_check: {
    name: "Health check",
    description: "Each check from your latest audit, and the one action to take first",
    plan: "growth",
  },
  autopilot: {
    name: "Autopilot",
    description: "The loop from a gap to a draft to a measured result",
    plan: "growth",
  },
  topical_gaps: {
    name: "Topical gaps",
    description: "Questions in your category where AI answers don't name you",
    plan: "growth",
  },
  tasks: {
    name: "Remediation tasks",
    description: "Recommendations turned into tasks to assign and track",
    plan: "growth",
  },
  content_drafts: {
    name: "Content drafts",
    description: "Drafts written from a task, to approve or reject",
    plan: "growth",
  },
  reports: {
    name: "Reports",
    description: "Weekly AI visibility reports for a brand, as PDFs",
    plan: "growth",
  },
  prompt_trends: {
    name: "Prompt trends",
    description: "How often AI names you for each prompt, week by week",
    plan: "growth",
  },
  action_progress: {
    name: "Action progress",
    description: "Tasks completed this month and their measured effect",
    plan: "growth",
  },
  competitor_comparisons: {
    name: "Competitor comparisons",
    description: "Head-to-head prompts between your brand and its competitors",
    plan: "growth",
  },
  evidence_archive: {
    name: "Evidence archive",
    description: "Saved copies of the AI answers behind each finding",
    plan: "agency",
  },
  journeys: {
    name: "Conversational journeys",
    description: "Multi-turn conversations a buyer might have with AI engines",
    plan: "agency",
  },
} as const satisfies Record<string, BrandFeatureDefinition>;

export type BrandFeature = keyof typeof BRAND_FEATURES;

export function isBrandFeature(key: string): key is BrandFeature {
  return Object.hasOwn(BRAND_FEATURES, key);
}

/** The lowest plan with the feature, as a tiers.ts key: what its route passes to assertTier. */
export function brandFeaturePlan(feature: BrandFeature): string {
  return BRAND_FEATURES[feature].plan;
}

/** "Growth". */
export function brandFeaturePlanName(feature: BrandFeature): string {
  const plan = brandFeaturePlan(feature);
  return getTierDefinition(plan)?.name ?? plan;
}

/** Whether a plan has the feature: its plan does, and so does every plan above. */
export function brandFeatureIncluded(tierKey: string, feature: BrandFeature): boolean {
  return tierRank(tierKey) >= tierRank(brandFeaturePlan(feature));
}

/** For an entry to it: locked on a plan without it. A plan not known yet (null) shows no lock. */
export function brandFeatureLockedFor(tierKey: string | null, feature: BrandFeature): boolean {
  return tierKey !== null && !brandFeatureIncluded(tierKey, feature);
}
