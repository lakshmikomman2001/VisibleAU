"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Check, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { AuditChange } from "@/lib/visibility/audit-change";

interface DriftAlert {
  id: string;
  brandId: string;
  brandName: string;
  severity: string;
  scoreDelta: string | null;
  dimensionDeltas: Record<string, { delta: number; severity: string }>;
  /** 17 Nov, part 3: the change between the alert's two audits (lib/visibility/audit-change.ts). */
  change?: AuditChange | null;
  acknowledged: boolean;
  createdAt: Date;
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ style?: React.CSSProperties }>;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: "var(--radius-lg, 8px)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{label}</span>
        <Icon
          style={{
            width: 14,
            height: 14,
            color: "var(--text-tertiary)",
            flexShrink: 0,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function DriftAlertsView({
  activeCount,
  weekCount,
  resolvedCount,
  alerts: initialAlerts,
}: {
  activeCount: number;
  weekCount: number;
  resolvedCount: number;
  alerts: DriftAlert[];
}) {
  const [alerts, setAlerts] = useState(initialAlerts);

  const handleAcknowledge = async (id: string) => {
    const res = await fetch(`/api/drift-alerts/${id}`, { method: "PATCH" });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
  };

  return (
    <div style={{ padding: "28px 32px" }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: "0 0 24px",
        }}
      >
        Drift Alerts
      </h1>

      {/* Three across from 640px, stacked on a phone. */}
      <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12, marginBottom: 28 }}>
        <KpiCard label="Active alerts" value={activeCount} icon={AlertTriangle} />
        {/* 17 Nov, part 3: what they count -- raised in the last 7 days (dismissed or not); dismissed in the
            last 30 days ("Resolved" read as if something was fixed). */}
        <KpiCard label="Raised in the last 7 days" value={weekCount} icon={TrendingDown} />
        <KpiCard label="Dismissed in the last 30 days" value={resolvedCount} icon={Check} />
      </div>

      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          Unacknowledged Alerts
        </div>

        {alerts.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: 13,
            }}
          >
            No active drift alerts.
          </div>
        ) : (
          alerts.map((alert) => {
            // Task #46 Phase 2, Part 1: a null scoreDelta means the
            // backing comparison mixed a frequency_only (zero true
            // mentions) composite with a weighted one -- never a real,
            // like-for-like composite point-delta (see
            // inngest/functions/detect-drift.ts's persist step). Show
            // it plainly as insufficient data, never as a fabricated
            // Drop/Rise number.
            // 17 Nov, part 3: the badge and line come from the measured change between the alert's two audits
            // (alert.change); without one, the stored delta's sign -- and only a significant drop or rise is called one.
            const change = alert.change ?? null;
            const direction =
              change?.kind === "measured"
                ? change.direction
                : alert.severity === "significant_drop"
                  ? "down"
                  : alert.severity === "significant_rise"
                    ? "up"
                    : null;
            const isInsufficient = change?.kind !== "measured" && alert.scoreDelta === null;
            const isDrop = direction === "down";
            const Icon = isInsufficient ? AlertTriangle : isDrop ? TrendingDown : TrendingUp;
            const toneColor = isInsufficient
              ? "var(--text-tertiary)"
              : direction === "down"
                ? "var(--danger)"
                : direction === "up"
                  ? "var(--success)"
                  : "var(--text-secondary)";
            const toneSoft = isInsufficient
              ? "var(--bg-hover)"
              : direction === "down"
                ? "var(--danger-soft)"
                : direction === "up"
                  ? "var(--success-soft)"
                  : "var(--bg-hover)";
            const badge = isInsufficient
              ? "Not comparable"
              : direction === "down"
                ? "Drop"
                : direction === "up"
                  ? "Rise"
                  : "No change";
            // What changed, in words: Visibility (the headline is the frequency dimension); sentiment and context
            // have no classifier behind them, so they're never named.
            const DIMENSION_WORDS: Record<string, string> = { frequency: "Visibility" };
            const affectedDims = Object.entries(alert.dimensionDeltas ?? {})
              .filter(([k, v]) => v.severity !== "within_noise" && DIMENSION_WORDS[k])
              .map(([k]) => DIMENSION_WORDS[k]);
            const line =
              change?.kind === "measured"
                ? change.line
                : change?.kind === "not_comparable" || change?.kind === "not_measured"
                  ? change.reason
                  : affectedDims.length > 0
                    ? `Changed: ${affectedDims.join(", ")}`
                    : "Visibility changed";

            return (
              <div
                key={alert.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <Icon
                  style={{
                    width: 16,
                    height: 16,
                    color: toneColor,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    {alert.brandName}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                    }}
                  >
                    <span data-drift-change={change?.kind ?? "none"}>{line}</span>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    fontWeight: 500,
                    background: toneSoft,
                    color: toneColor,
                  }}
                >
                  {badge}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    minWidth: 64,
                    textAlign: "right",
                  }}
                >
                  {formatDistanceToNow(new Date(alert.createdAt), {
                    addSuffix: true,
                  }).replace("about ", "")}
                </span>
                <button
                  type="button"
                  onClick={() => handleAcknowledge(alert.id)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Acknowledge
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
