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
  "inngest/functions/capture-evidence-snapshot.ts",
  "inngest/functions/generate-content-draft.ts",
  "inngest/functions/run-audit.ts",
  "inngest/functions/run-comparison-prompts.ts",
  "inngest/functions/run-journey.ts",
  "inngest/functions/simulate-query-fan-out.ts",
  "lib/audit/run-audit-inline.ts",
  "lib/branding/agency-assets.ts",
  "lib/governance/access-control.ts",
  "lib/platform/budget-policy.service.ts",
  "lib/scheduling/quota-check.ts",
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
