import { Lock } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import {
  BRAND_FEATURES,
  type BrandFeature,
  brandFeaturePlanName,
  isBrandFeature,
} from "@/lib/pricing/brand-features";
import {
  PLAN_FEATURE_COPY,
  type PlanFeature,
  planIncludes,
  planLockedMessage,
  requiredTierFor,
} from "@/lib/pricing/tiers";

/**
 * 6 Nov ("the UI and pricing must match the new server-side plan checks") -- how the
 * app shows a paid feature the workspace's plan doesn't have. Its entry stays where it
 * is, with a lock and the plan's name, and its page shows a locked card instead of the
 * feature: never a 403. Which plan has what comes only from lib/pricing/tiers.ts, the
 * same rule the server's gates use (lib/pricing/plan-features.ts), and the plan is the
 * one effectiveTier() reads. tests/unit/pricing/plan-gate-entry-points.test.ts checks
 * every gated route has one of these, or no page at all.
 */

/** Each paid feature's page. GA4 has none: it's set up through its API only. */
export const PLAN_FEATURE_PAGE = {
  bulk_operations: "/agency/bulk",
  client_portal: "/agency/client-portals",
  webhooks: "/settings/webhooks",
  white_label_reports: "/settings/report-branding",
} as const satisfies Partial<Record<PlanFeature, string>>;

export type PagedPlanFeature = keyof typeof PLAN_FEATURE_PAGE;

/**
 * 8 Nov (brand-feature locks, part 1) -- what a lock shows: a lib/pricing/tiers.ts feature, or a brand
 * page's feature (lib/pricing/brand-features.ts), which a plan has by its place in the order.
 */
export type LockedFeature = PlanFeature | BrandFeature;

function lockCopy(feature: LockedFeature): { name: string; description: string; plan: string } {
  if (isBrandFeature(feature)) {
    const { name, description } = BRAND_FEATURES[feature];
    return { name, description, plan: brandFeaturePlanName(feature) };
  }
  return { ...PLAN_FEATURE_COPY[feature], plan: requiredTierFor(feature).name };
}

/** "Consensus score is part of the Growth plan". */
export function lockedMessage(feature: LockedFeature): string {
  if (!isBrandFeature(feature)) return planLockedMessage(feature);
  const { name, plan } = lockCopy(feature);
  return `${name} is part of the ${plan} plan`;
}

/** A lock and "Agency Pro": on an entry to a feature this plan doesn't have. */
export function PlanLockBadge({
  feature,
  style,
}: {
  feature: LockedFeature;
  style?: CSSProperties;
}) {
  const { plan } = lockCopy(feature);
  return (
    <span
      data-plan-lock={feature}
      title={`Part of the ${plan} plan`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 6,
        fontSize: 11,
        fontWeight: 500,
        color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
      <span className="sr-only">Part of the </span>
      {plan}
      <span className="sr-only"> plan</span>
    </span>
  );
}

/**
 * A link to a paid feature's page. On a plan with the feature it's the link it always
 * was; on one without, it carries the lock and still opens the page, which shows the
 * locked card. `tier` null (not known yet) shows no lock.
 */
export function PlanGatedLink({
  feature,
  tier,
  children,
  trailing,
  badgeStyle,
  ...linkProps
}: Omit<ComponentProps<typeof Link>, "href"> & {
  feature: PagedPlanFeature;
  tier: string | null;
  /** After the lock, e.g. a "›". */
  trailing?: ReactNode;
  badgeStyle?: CSSProperties;
}) {
  const locked = tier !== null && !planIncludes(tier, feature);
  return (
    <Link href={PLAN_FEATURE_PAGE[feature]} data-plan-gated={feature} {...linkProps}>
      {children}
      {locked && <PlanLockBadge feature={feature} style={badgeStyle} />}
      {trailing}
    </Link>
  );
}

/** In place of the feature: "<Feature> is part of the <Plan> plan", and a way to the plans. */
export function PlanLockedCard({
  feature,
  description,
}: {
  feature: LockedFeature;
  /** Under the heading; the feature's own description if not given. */
  description?: ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
      data-plan-locked={feature}
    >
      <p
        className="text-[14px] font-medium flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <Lock aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
        {lockedMessage(feature)}
      </p>
      <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
        {description ?? `${lockCopy(feature).description}.`}
      </p>
      <Link
        href="/pricing"
        className="inline-block mt-3 text-[13px] font-medium underline focus-visible:outline focus-visible:outline-2"
        style={{ color: "var(--accent-blue)" }}
      >
        See the {lockCopy(feature).plan} plan
      </Link>
    </div>
  );
}

/** A feature's page on a plan without it: its heading, the locked card, then `children`. */
export function PlanLockedPage({
  title,
  feature,
  description,
  children,
}: {
  title: string;
  feature: LockedFeature;
  description?: ReactNode;
  /** What stays usable without the plan, e.g. deleting what was set up before. */
  children?: ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h1>
        <div className="mt-4">
          <PlanLockedCard feature={feature} description={description} />
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
