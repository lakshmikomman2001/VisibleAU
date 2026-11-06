/**
 * 3 Nov ("A cancelled plan must stop granting paid features everywhere") --
 * every plan gate in the code that ships. tests/unit/pricing/
 * effective-tier-guard.test.ts fails if this list and a scan of the source
 * disagree, so a new gate has to be added here;
 * tests/integration/cancelled-plan-gates.integration.test.tsx proves what a
 * cancelled workspace gets from them.
 */

/** Calls effectiveTier() itself. */
export const DIRECT_GATES = [
  "app/(auth)/action-center/[id]/page.tsx",
  "app/(auth)/action-center/page.tsx",
  "app/(auth)/agency/page.tsx",
  "app/(auth)/agency/schedules/page.tsx",
  "app/(auth)/brands/[brandId]/page.tsx",
  "app/(auth)/brands/[brandId]/schedule/page.tsx",
  "app/(auth)/brands/page.tsx",
  // 6 Nov: shows the brand limit before the form, as POST /api/brands would refuse.
  "app/(auth)/brands/wizard/page.tsx",
  "app/(auth)/dashboard/page.tsx",
  "app/(auth)/layout.tsx",
  "app/(auth)/methods/page.tsx",
  "app/api/audit-schedules/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/brands/[brandId]/action-progress/route.ts",
  "app/api/brands/[brandId]/comparisons/route.ts",
  "app/api/brands/[brandId]/competitive-benchmark/route.ts",
  "app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts",
  "app/api/brands/[brandId]/prompts/route.ts",
  "app/api/brands/[brandId]/visibility/route.ts",
  "app/api/brands/route.ts",
  "app/api/citability-methods/route.ts",
  "app/api/organizations/[orgId]/delivery-schedules/route.ts",
  "app/api/organizations/[orgId]/members/invite/route.ts",
  "inngest/functions/capture-evidence-snapshot.ts",
  "inngest/functions/generate-content-draft.ts",
  "inngest/functions/run-audit.ts",
  "inngest/functions/run-comparison-prompts.ts",
  "inngest/functions/run-journey.ts",
  "inngest/functions/simulate-query-fan-out.ts",
  "lib/audit/run-audit-inline.ts",
  "lib/governance/access-control.ts",
  "lib/platform/budget-policy.service.ts",
  "lib/pricing/plan-features.ts",
  "lib/scheduling/quota-check.ts",
];

/**
 * Calls planFeatureRefusal() or workspaceHasFeature() (lib/pricing/plan-features.ts,
 * which reads effectiveTier()). tests/integration/plan-feature-gates.integration.test.ts
 * walks each route and job; tests/integration/plan-locked-entries.integration.test.tsx
 * each page, which shows the locked card instead.
 */
export const PLAN_FEATURE_GATES = [
  "app/(auth)/agency/bulk/page.tsx",
  "app/(auth)/agency/client-portals/page.tsx",
  "app/(auth)/settings/webhooks/page.tsx",
  "app/api/agency/bulk-export/route.ts",
  "app/api/agency/bulk-reaudit/route.ts",
  "app/api/agency/ga4-config/route.ts",
  "app/api/client-portal/invites/route.ts",
  "app/api/webhooks-config/[id]/route.ts",
  "app/api/webhooks-config/[id]/test/route.ts",
  "app/api/webhooks-config/route.ts",
  "inngest/functions/bulk-reaudit-orchestrate.ts",
  "inngest/functions/deliver-webhook.ts",
  "inngest/functions/fanout-webhooks.ts",
  "inngest/functions/ga4-push.ts",
  "lib/branding/agency-assets.ts",
];

/** Calls assertTier(), which reads effectiveTier() (lib/governance/access-control.ts). */
export const ASSERT_TIER_GATES = [
  "app/api/brands/[brandId]/agent-analytics/cdn-join/route.ts",
  "app/api/brands/[brandId]/agent-analytics/coverage/route.ts",
  "app/api/brands/[brandId]/agent-analytics/overview/route.ts",
  "app/api/brands/[brandId]/agent-analytics/ratio/route.ts",
  "app/api/brands/[brandId]/agent-analytics/referrals/route.ts",
  "app/api/brands/[brandId]/agent-readiness/refresh/route.ts",
  "app/api/brands/[brandId]/agent-readiness/route.ts",
  "app/api/brands/[brandId]/citation-sources/route.ts",
  "app/api/brands/[brandId]/consensus-score/refresh/route.ts",
  "app/api/brands/[brandId]/consensus-score/route.ts",
  "app/api/brands/[brandId]/crawler-logs/upload/route.ts",
  "app/api/brands/[brandId]/drafts/[id]/route.ts",
  "app/api/brands/[brandId]/drafts/route.ts",
  "app/api/brands/[brandId]/entity-score/refresh/route.ts",
  "app/api/brands/[brandId]/entity-score/route.ts",
  "app/api/brands/[brandId]/evidence/route.ts",
  "app/api/brands/[brandId]/hallucinations/[id]/route.ts",
  "app/api/brands/[brandId]/hallucinations/route.ts",
  "app/api/brands/[brandId]/journeys/[journeyId]/results/route.ts",
  "app/api/brands/[brandId]/journeys/[journeyId]/run/route.ts",
  "app/api/brands/[brandId]/journeys/route.ts",
  "app/api/brands/[brandId]/latest-audit/route.ts",
  "app/api/brands/[brandId]/linkedin-presence/refresh/route.ts",
  "app/api/brands/[brandId]/linkedin-presence/route.ts",
  "app/api/brands/[brandId]/reports/[reportId]/retry-pdf/route.ts",
  "app/api/brands/[brandId]/reports/[reportId]/route.ts",
  "app/api/brands/[brandId]/reports/generate/route.ts",
  "app/api/brands/[brandId]/reports/route.ts",
  "app/api/brands/[brandId]/site-readiness/route.ts",
  "app/api/brands/[brandId]/tasks/[id]/complete/route.ts",
  "app/api/brands/[brandId]/tasks/[id]/route.ts",
  "app/api/brands/[brandId]/tasks/route.ts",
  "app/api/brands/[brandId]/topical-gaps/route.ts",
  "app/api/brands/[brandId]/trust/route.ts",
  "app/api/brands/[brandId]/youtube-presence/refresh/route.ts",
  "app/api/brands/[brandId]/youtube-presence/route.ts",
];

/** The seat limit, from lib/pricing/tiers.ts, checked inside the invite's transaction. */
export const SEAT_GATE = "app/api/organizations/[orgId]/members/invite/route.ts";

/**
 * 6 Nov (Sri: "No link may lead to a 403") -- where each plan-feature gate above, and
 * the seat limit, is reached from in the app: a page that shows the locked card on a
 * plan without the feature (components/domain/pricing/plan-lock.tsx), or no page at
 * all, and why. tests/unit/pricing/plan-gate-entry-points.test.ts holds the app to it.
 */
export const PLAN_GATE_ENTRY_POINTS: Record<string, { page: string } | { apiOnly: string }> = {
  // The locked pages themselves: each checks the plan before it shows anything.
  "app/(auth)/agency/bulk/page.tsx": { page: "app/(auth)/agency/bulk/page.tsx" },
  "app/(auth)/agency/client-portals/page.tsx": {
    page: "app/(auth)/agency/client-portals/page.tsx",
  },
  "app/(auth)/settings/webhooks/page.tsx": { page: "app/(auth)/settings/webhooks/page.tsx" },
  "app/api/agency/bulk-export/route.ts": { page: "app/(auth)/agency/bulk/page.tsx" },
  "app/api/agency/bulk-reaudit/route.ts": { page: "app/(auth)/agency/bulk/page.tsx" },
  "app/api/agency/ga4-config/route.ts": {
    apiOnly:
      "No page sets GA4 up yet: the measurement id and secret are saved through this API. A page for it needs its entry here, PlanGatedLink and the locked card.",
  },
  "app/api/client-portal/invites/route.ts": { page: "app/(auth)/agency/client-portals/page.tsx" },
  "app/api/webhooks-config/[id]/route.ts": { page: "app/(auth)/settings/webhooks/page.tsx" },
  "app/api/webhooks-config/[id]/test/route.ts": { page: "app/(auth)/settings/webhooks/page.tsx" },
  "app/api/webhooks-config/route.ts": { page: "app/(auth)/settings/webhooks/page.tsx" },
  "inngest/functions/bulk-reaudit-orchestrate.ts": {
    apiOnly: "A background job, started by POST /api/agency/bulk-reaudit, never by a link.",
  },
  "inngest/functions/deliver-webhook.ts": {
    apiOnly: "A background job: sends the deliveries fanout-webhooks queued.",
  },
  "inngest/functions/fanout-webhooks.ts": {
    apiOnly: "A background job: runs when an audit finishes, never from a link.",
  },
  "inngest/functions/ga4-push.ts": {
    apiOnly: "A background job: runs when an audit finishes, never from a link.",
  },
  "lib/branding/agency-assets.ts": { page: "app/(auth)/settings/report-branding/page.tsx" },
  [SEAT_GATE]: { page: "app/(auth)/settings/team/page.tsx" },
};
