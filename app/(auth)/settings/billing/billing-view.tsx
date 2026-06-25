"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import RetentionModal from "@/components/domain/pricing/retention-modal";

interface Props {
  tier: string;
  tierName: string;
  monthlyPrice: string;
  billingInterval: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  hasSubscription: boolean;
  stripeCustomerId: string | null;
  maxScheduled: number;
  frequency: string;
  success: boolean;
  reason: string | null;
}

const REASON_MESSAGES: Record<string, string> = {
  "brand-limit":
    "You've reached your plan's brand limit. Upgrade to track more brands.",
};

export default function BillingView({
  tier,
  tierName,
  monthlyPrice,
  billingInterval,
  cancelAtPeriodEnd,
  periodEnd,
  hasSubscription,
  stripeCustomerId,
  maxScheduled,
  frequency,
  success,
  reason,
}: Props) {
  const router = useRouter();
  const [showRetention, setShowRetention] = useState(false);
  const [busy, setBusy] = useState(false);

  const message = reason ? (REASON_MESSAGES[reason] ?? null) : null;

  const handlePortal = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDowngrade = useCallback(async () => {
    const res = await fetch("/api/billing/downgrade", { method: "POST" });
    if (res.ok) router.refresh();
  }, [router]);

  const handlePause = useCallback(async () => {
    const res = await fetch("/api/audit-schedules", { method: "GET" });
    const data = await res.json();
    if (data.schedules) {
      await Promise.all(
        data.schedules
          .filter((s: any) => s.status === "active")
          .map((s: any) =>
            fetch(`/api/audit-schedules/${s.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "paused" }),
            }),
          ),
      );
    }
    router.refresh();
  }, [router]);

  const handleCancelAnyway = useCallback(() => {
    setShowRetention(false);
    handlePortal();
  }, [handlePortal]);

  const tierLabel = tierName.replace(/_/g, " ");

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 32px" }}>
      {/* Header */}
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
          style={{
            fontSize: 14,
            marginTop: 4,
            color: "var(--text-secondary)",
            margin: "4px 0 0",
          }}
        >
          {tierLabel} plan
        </p>
      </div>

      {/* Success banner */}
      {success && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 24,
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.3)",
          }}
        >
          <CheckCircle
            style={{ width: 16, height: 16, color: "#22c55e", flexShrink: 0 }}
          />
          <p style={{ fontSize: 13, color: "#22c55e", margin: 0 }}>
            Your subscription is active. Welcome to {tierLabel}!
          </p>
        </div>
      )}

      {/* Warning banner */}
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
            style={{
              width: 16,
              height: 16,
              color: "var(--warning)",
              flexShrink: 0,
              marginTop: 1,
            }}
          />
          <p style={{ fontSize: 13, color: "var(--warning)", margin: 0 }}>
            {message}
          </p>
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
        <div
          style={{
            fontSize: 12,
            color: "var(--text-tertiary)",
            marginBottom: 8,
          }}
        >
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
          {tierLabel}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--text-secondary)",
            marginBottom: 20,
          }}
        >
          {monthlyPrice}
          {monthlyPrice !== "A$0" && monthlyPrice !== "Custom" && (
            <span> / month</span>
          )}
          {" · "}
          {billingInterval === "annual" ? "Annual" : "Monthly"} billing
        </div>

        {cancelAtPeriodEnd && periodEnd && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: 16,
              backgroundColor: "rgba(245,158,11,0.1)",
              color: "#f59e0b",
              fontSize: 13,
            }}
          >
            Your plan will downgrade to Free on{" "}
            {format(new Date(periodEnd), "d MMM yyyy")}.
          </div>
        )}

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
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              Scheduled audits
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {maxScheduled === 0
                ? "Not included"
                : Number.isFinite(maxScheduled)
                  ? `Up to ${maxScheduled}`
                  : "Unlimited"}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              Audit frequency
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {frequency.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              Next renewal
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {periodEnd
                ? format(new Date(periodEnd), "d MMM yyyy")
                : "—"}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              Region
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              AU (GST inclusive)
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          {tier === "free" ? (
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: "#3b82f6", color: "#fff" }}
            >
              Upgrade plan
            </a>
          ) : (
            <>
              {hasSubscription && (
                <button
                  onClick={handlePortal}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <CreditCard style={{ width: 14, height: 14 }} />
                  Manage subscription
                  <ExternalLink style={{ width: 12, height: 12 }} />
                </button>
              )}
              {hasSubscription && !cancelAtPeriodEnd && (
                <button
                  onClick={() => setShowRetention(true)}
                  className="rounded-md px-4 py-2 text-sm font-medium"
                  style={{
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  Cancel plan
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <RetentionModal
        open={showRetention}
        onClose={() => setShowRetention(false)}
        onDowngrade={handleDowngrade}
        onPause={handlePause}
        onCancelAnyway={handleCancelAnyway}
      />
    </div>
  );
}
