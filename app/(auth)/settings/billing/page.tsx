import { AlertTriangle, Info } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

const TIER_PRICING: Record<string, { label: string; price: string; limit: number | string }> = {
  free: { label: "Free", price: "A$0", limit: 1 },
  starter: { label: "Starter", price: "A$99", limit: 1 },
  growth: { label: "Growth", price: "A$299", limit: 1 },
  agency: { label: "Agency", price: "A$499", limit: 5 },
  agency_pro: { label: "Agency Pro", price: "A$1,499", limit: 25 },
  enterprise: { label: "Enterprise", price: "Custom", limit: "Unlimited" },
};

const REASON_MESSAGES: Record<string, string> = {
  "brand-limit": "You’ve reached your plan’s brand limit. Upgrade to track more brands.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const params = await searchParams;
  const tier = currentUser.organization.tier ?? "free";
  const tierInfo = TIER_PRICING[tier] ?? TIER_PRICING.free;
  const message = params.reason ? (REASON_MESSAGES[params.reason] ?? null) : null;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Billing
        </h1>
        <p
          style={{ fontSize: 14, marginTop: 4, color: "var(--text-secondary)", margin: "4px 0 0" }}
        >
          {tierInfo.label} plan &middot; {tierInfo.limit} brand
          {tierInfo.limit !== 1 ? "s" : ""} included
        </p>
      </div>

      {/* Warning banner from searchParams.reason */}
      {message && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 24,
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
          }}
        >
          <AlertTriangle
            style={{ width: 16, height: 16, color: "var(--warning)", flexShrink: 0, marginTop: 1 }}
          />
          <p style={{ fontSize: 13, color: "var(--warning)", margin: 0 }}>{message}</p>
        </div>
      )}

      {/* Current plan card */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 24,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
          Current plan
        </div>

        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            marginBottom: 4,
          }}
        >
          {tierInfo.label}
        </div>

        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
          {tierInfo.price}
          {tierInfo.price !== "Custom" && <span> / month</span>}
          {" · "}Monthly billing
        </div>

        {/* Details grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 24,
            padding: "16px 0",
            borderTop: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
              Brands included
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              {tierInfo.limit}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
              Next renewal
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              &mdash;
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
              Billing period
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              Monthly
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4 }}>
              Region
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
              AU (GST inclusive)
            </div>
          </div>
        </div>

        {/* Disabled upgrade button */}
        <button
          type="button"
          disabled
          title="Billing portal available Sprint 10"
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--accent-muted)",
            color: "var(--text-disabled)",
            border: "1px solid var(--border-default)",
            cursor: "not-allowed",
            opacity: 0.6,
          }}
        >
          Upgrade plan
        </button>
      </div>

      {/* Info banner */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 8,
          background: "var(--info-soft)",
          border: "1px solid var(--border-default)",
        }}
      >
        <Info
          style={{ width: 16, height: 16, color: "var(--info)", flexShrink: 0, marginTop: 1 }}
        />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Full billing management — invoice history, plan changes, payment methods — ships with
          Sprint 10 (Stripe Checkout integration).
        </p>
      </div>
    </div>
  );
}
