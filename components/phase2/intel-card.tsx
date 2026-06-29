"use client";

interface IntelCardProps {
  title: string;
  value: string | number;
  unit?: string;
  delta?: number | null;
  loading?: boolean;
}

function DeltaPill({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span
        className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: `color-mix(in srgb, var(--text-secondary) 15%, transparent)`,
          color: "var(--text-secondary)",
        }}
      >
        ±0
      </span>
    );
  }
  const positive = delta > 0;
  return (
    <span
      className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: positive
          ? "var(--success-soft)"
          : "var(--danger-soft)",
        color: positive ? "var(--success)" : "var(--danger)",
      }}
    >
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

export function IntelCard({ title, value, unit, delta, loading }: IntelCardProps) {
  if (loading) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "var(--elevation-rest)",
        }}
        aria-busy="true"
      >
        <div
          className="h-3 w-24 rounded anim-shimmer mb-3"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        <div
          className="h-6 w-16 rounded anim-shimmer"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4 transition-shadow"
      style={{
        backgroundColor: "var(--bg-elevated)",
        boxShadow: "var(--elevation-rest)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "var(--elevation-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "var(--elevation-rest)")
      }
    >
      <p
        className="text-xs font-medium mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {title}
      </p>
      <div className="flex items-baseline">
        <span
          className="text-2xl font-semibold"
          style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="ml-1 text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            {unit}
          </span>
        )}
        {delta != null && <DeltaPill delta={delta} />}
      </div>
    </div>
  );
}
