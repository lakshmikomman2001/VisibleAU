import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BRAND_LIMIT_UPGRADE_HREF, type BrandUsage } from "@/lib/brands/limits";

/** The new-brand wizard every "New brand" entry opens. */
export const NEW_BRAND_HREF = "/brands/wizard";

/**
 * 6 Nov (phone-layout follow-ups, item 1) -- the one "New brand" control: in the
 * desktop top bar (`toolbar`), on the Brands page's header (`page`, full width on a
 * phone) and as the first Workspace item in the phone drawer (`nav`). While the plan
 * has room it opens the wizard; once its brands are used up (lib/brands/limits.ts,
 * the API's own rule) it shows a lock and "Limit reached" and opens the plans
 * instead, the same in all three places -- never a button that leads to the API's
 * 403 at the end of the wizard.
 */
export function NewBrandButton({
  usage,
  variant,
  onNavigate,
}: {
  usage: BrandUsage;
  variant: "toolbar" | "page" | "nav";
  /** The phone drawer closes on it, even when the link is the page already open. */
  onNavigate?: () => void;
}) {
  const locked = !usage.canAdd;
  const Icon = locked ? Lock : Plus;

  const style: CSSProperties =
    variant === "nav"
      ? {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 12px",
          borderRadius: 6,
          fontSize: 13,
          marginTop: 2,
          color: "var(--text-secondary)",
          border: "1px solid transparent",
          textDecoration: "none",
        }
      : {
          height: variant === "page" ? 36 : 32,
          padding: "0 12px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 500,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textDecoration: "none",
          whiteSpace: "nowrap",
          ...(locked
            ? {
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-default)",
              }
            : {
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "1px solid transparent",
              }),
        };

  return (
    <Link
      href={locked ? BRAND_LIMIT_UPGRADE_HREF : NEW_BRAND_HREF}
      onClick={onNavigate}
      data-new-brand={variant}
      data-brand-limit-reached={locked ? "" : undefined}
      className={
        variant === "nav"
          ? "hover:bg-[var(--bg-hover)]"
          : variant === "page"
            ? "w-full sm:w-auto"
            : undefined
      }
      style={style}
    >
      <Icon aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
      New brand
      {locked && (
        <span
          style={{
            marginLeft: variant === "nav" ? "auto" : 2,
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-tertiary)",
          }}
        >
          <span className="sr-only">:</span> Limit reached
          {usage.upgradePlan && (
            <span className="sr-only">. The {usage.upgradePlan} plan has more brands.</span>
          )}
        </span>
      )}
    </Link>
  );
}

/** The wizard's page once the plan's brands are used up: why, and the way to more. */
export function BrandLimitCard({ usage }: { usage: BrandUsage }) {
  return (
    <div
      data-brand-limit-reached=""
      style={{
        maxWidth: 560,
        padding: 20,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <p
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: 0,
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
        }}
      >
        <Lock aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
        You've reached your plan's brand limit
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
        Your workspace has {usage.count} of {usage.limit} brands.
        {usage.upgradePlan && ` The ${usage.upgradePlan} plan has more.`}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 13 }}>
        <Link
          href={BRAND_LIMIT_UPGRADE_HREF}
          style={{ color: "var(--accent-blue)", fontWeight: 500, textDecoration: "underline" }}
        >
          See plans
        </Link>
        <Link
          href="/brands"
          style={{ color: "var(--text-secondary)", textDecoration: "underline" }}
        >
          Back to Brands
        </Link>
      </div>
    </div>
  );
}
