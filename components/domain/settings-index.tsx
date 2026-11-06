"use client";

import Link from "next/link";
import { ACCOUNT_ITEMS } from "@/components/domain/app-sidebar";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { planIncludes } from "@/lib/pricing/tiers";

/**
 * 6 Nov (phone-layout follow-ups, item 4) -- /settings, which every settings page's
 * breadcrumb links to: the sidebar's Account pages, from the same list, each with its
 * lock on a plan without it. It used to say "coming in a future sprint".
 */
export function SettingsIndex() {
  const tier = usePlanTier();
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
      {ACCOUNT_ITEMS.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            {...(item.feature ? { "data-plan-gated": item.feature } : {})}
            className="hover:bg-[var(--bg-hover)]"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 8,
              fontSize: 14,
              color: "var(--text-primary)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              textDecoration: "none",
            }}
          >
            <item.icon
              aria-hidden="true"
              style={{ width: 16, height: 16, flexShrink: 0, color: "var(--text-secondary)" }}
            />
            {item.label}
            {item.feature && tier !== null && !planIncludes(tier, item.feature) && (
              <PlanLockBadge feature={item.feature} style={{ marginLeft: "auto" }} />
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
