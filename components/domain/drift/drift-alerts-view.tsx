"use client";

import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Check, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

interface DriftAlert {
  id: string;
  brandId: string;
  brandName: string;
  severity: string;
  scoreDelta: string | null;
  dimensionDeltas: Record<string, { delta: number; severity: string }>;
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
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {label}
        </span>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <KpiCard label="Active alerts" value={activeCount} icon={AlertTriangle} />
        <KpiCard label="This week" value={weekCount} icon={TrendingDown} />
        <KpiCard label="Resolved (30d)" value={resolvedCount} icon={Check} />
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
            const isDrop = alert.severity === "significant_drop";
            const delta = Number(alert.scoreDelta ?? 0);
            const Icon = isDrop ? TrendingDown : TrendingUp;

            const affectedDims = Object.entries(
              alert.dimensionDeltas ?? {},
            )
              .filter(([, v]) => v.severity !== "within_noise")
              .map(([k]) => k);

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
                    color: isDrop ? "var(--danger)" : "var(--success)",
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
                    {affectedDims.length > 0
                      ? `Affected: ${affectedDims.join(", ")}`
                      : "Composite score drift"}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: isDrop ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 9999,
                    fontWeight: 500,
                    background: isDrop
                      ? "var(--danger-soft)"
                      : "var(--success-soft)",
                    color: isDrop ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {isDrop ? "Drop" : "Rise"}
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
