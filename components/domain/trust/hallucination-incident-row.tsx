"use client";

interface Incident {
  id: string;
  engine: string;
  claimType: string;
  severity: "critical" | "warning" | "info";
  incorrectClaim: string;
  correctValue: string | null;
  isAcknowledged: boolean;
  isFalsePositive: boolean;
  createdAt: string;
}

const SEVERITY_CONFIG = {
  critical: { bg: "color-mix(in srgb, var(--destructive) 15%, transparent)", color: "var(--destructive)", label: "Critical" },
  warning: { bg: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)", label: "Warning" },
  info: { bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)", color: "var(--accent-primary)", label: "Info" },
};

interface Props {
  incident: Incident;
  onAcknowledge: () => void;
  onMarkFalsePositive: () => void;
}

export function HallucinationIncidentRow({ incident, onAcknowledge, onMarkFalsePositive }: Props) {
  const sev = SEVERITY_CONFIG[incident.severity];

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: sev.bg, color: sev.color }}
        >
          {sev.label}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{incident.engine}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>{incident.claimType.replace(/_/g, " ")}</span>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-xs font-medium" style={{ color: "var(--destructive)" }}>AI claimed:</p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>{incident.incorrectClaim}</p>
        </div>
        {incident.correctValue && (
          <div>
            <p className="text-xs font-medium" style={{ color: "var(--success)" }}>Actual:</p>
            <p className="text-sm" style={{ color: "var(--foreground)" }}>{incident.correctValue}</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!incident.isAcknowledged && (
          <button
            onClick={onAcknowledge}
            className="rounded px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              color: "var(--accent-primary)",
            }}
            aria-label="Acknowledge incident"
          >
            Acknowledge
          </button>
        )}
        {!incident.isFalsePositive && (
          <button
            onClick={onMarkFalsePositive}
            className="rounded px-3 py-1 text-xs font-medium transition-colors"
            style={{
              backgroundColor: "color-mix(in srgb, var(--muted) 15%, transparent)",
              color: "var(--muted)",
            }}
            aria-label="Mark as false positive"
          >
            Mark false positive
          </button>
        )}
        {incident.isAcknowledged && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Acknowledged</span>
        )}
        {incident.isFalsePositive && (
          <span className="text-xs" style={{ color: "var(--success)" }}>False positive</span>
        )}
      </div>
    </div>
  );
}
