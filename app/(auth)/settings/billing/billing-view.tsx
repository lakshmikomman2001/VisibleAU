"use client";

import { AlertTriangle, CheckCircle, CreditCard, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import RetentionModal from "@/components/domain/pricing/retention-modal";
import { useCan } from "@/components/domain/role-context";
import { ActionError } from "@/components/shared/load-error";
import { refusalMessage } from "@/lib/governance/permissions";
import { actionFailureMessage, fetchJson, LoadFailure } from "@/lib/load/fetch-json";
import { billingRegionLabel } from "@/lib/pricing/gst";
import type { RenewalLine } from "@/lib/pricing/renewal";

interface Props {
  tier: string;
  tierName: string;
  monthlyPrice: string;
  billingInterval: string;
  cancelAtPeriodEnd: boolean;
  /** What to say about renewal (lib/pricing/renewal.ts): never a past date as the next renewal. */
  renewal: RenewalLine;
  hasSubscription: boolean;
  stripeCustomerId: string | null;
  maxScheduled: number;
  frequency: string;
  success: boolean;
  reason: string | null;
}

const REASON_MESSAGES: Record<string, string> = {
  "brand-limit": "You've reached your plan's brand limit. Upgrade to track more brands.",
};

export default function BillingView({
  tier,
  tierName,
  monthlyPrice,
  billingInterval,
  cancelAtPeriodEnd,
  renewal,
  hasSubscription,
  stripeCustomerId,
  maxScheduled,
  frequency,
  success,
  reason,
}: Props) {
  // Team follow-ups, item 6: billing is the owner's (the billing routes answer 403 otherwise).
  const canManageBilling = useCan("manage_billing");
  const router = useRouter();
  const [showRetention, setShowRetention] = useState(false);
  const [busy, setBusy] = useState(false);
  // Follow-ups from af8de42..d1eb5a1, part 1: Manage subscription's failure was an empty `catch {}` (the
  // button did nothing), a refused downgrade closed the offer as if it had worked, and Pause ignored every
  // answer. Each says why now; the retention offer stays open with the reason.
  const [portalError, setPortalError] = useState<string | null>(null);

  const message = reason ? (REASON_MESSAGES[reason] ?? null) : null;

  const handlePortal = useCallback(async () => {
    setBusy(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) {
        setPortalError(await actionFailureMessage(res, "The billing portal couldn't be opened."));
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) window.location.href = data.url;
      else setPortalError("The billing portal couldn't be opened.");
    } catch {
      setPortalError("The billing portal couldn't be opened. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDowngrade = useCallback(async () => {
    const res = await fetch("/api/billing/downgrade", { method: "POST" });
    if (!res.ok)
      throw new Error(await actionFailureMessage(res, "The downgrade couldn't be made."));
    router.refresh();
  }, [router]);

  const handlePause = useCallback(async () => {
    let schedules: { id: string; status: string }[];
    try {
      ({ schedules } = await fetchJson<{ schedules: { id: string; status: string }[] }>(
        "/api/audit-schedules",
      ));
    } catch (e) {
      const why = e instanceof LoadFailure ? e.detail : null;
      throw new Error(why ?? "Your scheduled audits couldn't be read, so none were paused.");
    }
    const answers = await Promise.all(
      schedules
        .filter((schedule) => schedule.status === "active")
        .map((schedule) =>
          fetch(`/api/audit-schedules/${schedule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "paused" }),
          }),
        ),
    );
    const refused = answers.find((res) => !res.ok);
    router.refresh();
    if (refused) {
      throw new Error(
        await actionFailureMessage(refused, "Not every scheduled audit could be paused."),
      );
    }
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
          <CheckCircle style={{ width: 16, height: 16, color: "var(--success)", flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "var(--success)", margin: 0 }}>
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
          {monthlyPrice !== "A$0" && monthlyPrice !== "Custom" && <span> / month</span>}
          {" · "}
          {billingInterval === "annual" ? "Annual" : "Monthly"} billing
        </div>

        {renewal.kind === "ends" && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: 16,
              backgroundColor: "rgba(245,158,11,0.1)",
              color: "var(--warning)",
              fontSize: 13,
            }}
          >
            Your plan will downgrade to Free on {renewal.value}.
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
              {renewal.label}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {renewal.value}
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
              {billingRegionLabel()}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          {!canManageBilling ? (
            <p
              className="text-sm"
              style={{ color: "var(--text-secondary)" }}
              data-role-locked="manage_billing"
            >
              {refusalMessage("manage_billing")}
            </p>
          ) : tier === "free" ? (
            <a
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: "var(--accent-blue)", color: "var(--accent-blue-fg)" }}
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
                    backgroundColor: "var(--bg-subtle)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <CreditCard style={{ width: 14, height: 14 }} />
                  Manage subscription
                  <ExternalLink style={{ width: 12, height: 12 }} />
                </button>
              )}
              <ActionError message={portalError} />
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
