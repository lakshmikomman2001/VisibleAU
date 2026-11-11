import type { BrandFeature } from "@/lib/pricing/brand-features";

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
  // 8 Nov: tasks and drafts are Growth; on a plan without them the page shows the locked card.
  "app/(auth)/brands/[brandId]/workflow/drafts/page.tsx",
  "app/(auth)/brands/[brandId]/workflow/page.tsx",
  "app/(auth)/brands/[brandId]/workflow/tasks/page.tsx",
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
  // Team follow-ups, item 4: an invite to an address with no account is accepted only while there's a seat
  // (tests/integration/invite-new-account.integration.test.ts: a cancelled plan's last seat is taken).
  "lib/auth/invite.ts",
  "lib/governance/access-control.ts",
  // Google AI surfaces (Phase 1, part 1): Growth and up only, the workspace override included.
  "lib/governance/google-surfaces.ts",
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
export const PLAN_GATE_ENTRY_POINTS: Record<
  string,
  | { page: string }
  | { apiOnly: string }
  /**
   * 8 Nov (brand-feature locks, part 1): a brand-feature route (one that reads its plan from
   * lib/pricing/brand-features.ts) and every file in the app that calls it, with the feature the file locks
   * by before it does -- a feature whose plan is at least the route's, so nothing is fetched on a plan the
   * route refuses. tests/unit/pricing/plan-gate-entry-points.test.ts finds every caller itself.
   */
  | { callers: Record<string, BrandFeature> }
> = {
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
  // 8 Nov (brand-feature locks, part 1): every brand-feature route, and where the app calls it.
  "app/api/brands/[brandId]/agent-analytics/cdn-join/route.ts": {
    callers: {
      "components/domain/retrieval/agent-analytics-section.tsx": "cdn_shield_check",
    },
  },
  "app/api/brands/[brandId]/agent-analytics/coverage/route.ts": {
    callers: {
      "components/domain/retrieval/agent-analytics-pages-coverage.tsx": "page_coverage",
    },
  },
  "app/api/brands/[brandId]/agent-analytics/overview/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/retrieval/agent-analytics/page.tsx": "agent_analytics",
    },
  },
  "app/api/brands/[brandId]/agent-analytics/ratio/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/retrieval/agent-analytics/page.tsx": "crawl_referral_ratio",
    },
  },
  "app/api/brands/[brandId]/agent-analytics/referrals/route.ts": {
    apiOnly:
      "Referral sessions (from GA4, log referrers or UTM tags) are posted here by API; no page sends them.",
  },
  "app/api/brands/[brandId]/agent-readiness/refresh/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/retrieval/agent-readiness/page.tsx": "agent_readiness",
    },
  },
  "app/api/brands/[brandId]/agent-readiness/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/health-check/page.tsx": "health_check",
      "app/(auth)/brands/[brandId]/retrieval/agent-readiness/page.tsx": "agent_readiness",
    },
  },
  "app/api/brands/[brandId]/citation-sources/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx": "citation_sources",
    },
  },
  "app/api/brands/[brandId]/consensus-score/refresh/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/consensus/page.tsx": "consensus_score",
    },
  },
  "app/api/brands/[brandId]/consensus-score/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/consensus/page.tsx": "consensus_score",
    },
  },
  "app/api/brands/[brandId]/crawler-logs/upload/route.ts": {
    callers: {
      "components/domain/retrieval/agent-analytics-setup-panel.tsx": "agent_analytics",
    },
  },
  "app/api/brands/[brandId]/drafts/[id]/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/workflow/drafts/drafts-page-client.tsx": "content_drafts",
    },
  },
  "app/api/brands/[brandId]/drafts/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/autopilot/page.tsx": "autopilot",
      "components/domain/workflow/generate-draft-modal.tsx": "content_drafts",
    },
  },
  "app/api/brands/[brandId]/entity-score/refresh/route.ts": {
    apiOnly:
      "No page refreshes the entity score: its page shows the stored score and has no refresh control; this API does it.",
  },
  "app/api/brands/[brandId]/entity-score/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/entity-score/page.tsx": "entity_score",
    },
  },
  "app/api/brands/[brandId]/evidence/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/evidence/page.tsx": "evidence_archive",
    },
  },
  "app/api/brands/[brandId]/hallucinations/[id]/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx": "hallucinations",
    },
  },
  "app/api/brands/[brandId]/hallucinations/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx": "hallucinations",
    },
  },
  "app/api/brands/[brandId]/journeys/[journeyId]/results/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx": "journeys",
    },
  },
  "app/api/brands/[brandId]/journeys/[journeyId]/run/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx": "journeys",
    },
  },
  "app/api/brands/[brandId]/journeys/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/discovery/journeys/page.tsx": "journeys",
      "app/(auth)/brands/[brandId]/discovery/page.tsx": "journeys",
    },
  },
  "app/api/brands/[brandId]/latest-audit/route.ts": {
    callers: {
      "app/(auth)/agency/reports/pdf-builder/page.tsx": "latest_audit_summary",
      "app/(auth)/brands/[brandId]/autopilot/page.tsx": "autopilot",
      "app/(auth)/brands/[brandId]/health-check/page.tsx": "health_check",
    },
  },
  "app/api/brands/[brandId]/linkedin-presence/refresh/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/linkedin-presence/page.tsx": "linkedin_presence",
    },
  },
  "app/api/brands/[brandId]/linkedin-presence/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/linkedin-presence/page.tsx": "linkedin_presence",
    },
  },
  "app/api/brands/[brandId]/reports/[reportId]/retry-pdf/route.ts": {
    callers: {
      "components/domain/communication/retry-pdf-button.tsx": "reports",
    },
  },
  "app/api/brands/[brandId]/reports/[reportId]/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/reports/[reportId]/page.tsx": "reports",
    },
  },
  "app/api/brands/[brandId]/reports/generate/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/reports/page.tsx": "reports",
    },
  },
  "app/api/brands/[brandId]/reports/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/reports/page.tsx": "reports",
    },
  },
  "app/api/brands/[brandId]/site-readiness/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/health-check/page.tsx": "health_check",
    },
  },
  "app/api/brands/[brandId]/tasks/[id]/complete/route.ts": {
    callers: {
      "components/domain/workflow/task-kanban.tsx": "tasks",
    },
  },
  "app/api/brands/[brandId]/tasks/[id]/route.ts": {
    callers: {
      "components/domain/workflow/task-kanban.tsx": "tasks",
    },
  },
  "app/api/brands/[brandId]/tasks/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/autopilot/page.tsx": "autopilot",
      "app/(auth)/brands/[brandId]/health-check/page.tsx": "health_check",
      "components/domain/action-center/action-status-buttons.tsx": "tasks",
      "components/domain/retrieval/agent-analytics-pages-coverage.tsx": "page_coverage",
      "components/domain/workflow/create-task-modal.tsx": "tasks",
    },
  },
  "app/api/brands/[brandId]/topical-gaps/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/autopilot/page.tsx": "autopilot",
      "app/(auth)/brands/[brandId]/visibility/page.tsx": "topical_gaps",
    },
  },
  "app/api/brands/[brandId]/trust/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/page.tsx": "trust_intelligence",
    },
  },
  "app/api/brands/[brandId]/youtube-presence/refresh/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/youtube-presence/page.tsx": "youtube_presence",
    },
  },
  "app/api/brands/[brandId]/youtube-presence/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/trust/youtube-presence/page.tsx": "youtube_presence",
    },
  },
  "app/api/brands/[brandId]/action-progress/route.ts": {
    callers: {
      "components/domain/autopilot/action-progress-tracker.tsx": "action_progress",
    },
  },
  "app/api/brands/[brandId]/comparisons/route.ts": {
    callers: {
      "app/(auth)/brands/[brandId]/discovery/comparisons/page.tsx": "competitor_comparisons",
      "app/(auth)/brands/[brandId]/discovery/page.tsx": "competitor_comparisons",
    },
  },
  "app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts": {
    callers: {
      "components/domain/autopilot/prompt-trend-sparkline.tsx": "prompt_trends",
    },
  },
  "app/api/brands/[brandId]/prompts/route.ts": {
    callers: {
      "components/domain/autopilot/prompt-trend-section.tsx": "prompt_trends",
    },
  },
};
