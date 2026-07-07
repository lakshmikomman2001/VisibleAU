"use client";

interface ConsensusRow {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  nameMatch: boolean;
  serviceMatch: boolean;
  locationMatch: boolean;
  differentiatorsMatch: boolean;
  consistencyScore: number | null;
  discrepancies: Array<{ field: string; thisSource: string; websiteValue: string }>;
}

export function ConsensusDiscrepancyCard({ check }: { check: ConsensusRow }) {
  const score = check.consistencyScore ?? 0;
  const isLow = score < 70;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: isLow
          ? "color-mix(in srgb, var(--warning) 30%, transparent)"
          : "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-medium" style={{ color: "var(--foreground)" }}>
          {check.sourceType.replace(/_/g, " ")}
        </p>
        <span
          className="text-sm font-bold"
          style={{
            color: isLow ? "var(--warning)" : "var(--success)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}/100
        </span>
      </div>

      <div className="mt-2 flex gap-3 text-xs">
        {(["nameMatch", "serviceMatch", "locationMatch", "differentiatorsMatch"] as const).map((field) => (
          <span
            key={field}
            style={{ color: check[field] ? "var(--success)" : "var(--destructive)" }}
          >
            {check[field] ? "✓" : "✗"} {field.replace("Match", "")}
          </span>
        ))}
      </div>

      {check.discrepancies.length > 0 && (
        <div className="mt-3 space-y-1">
          {check.discrepancies.map((d, i) => (
            <div key={i} className="rounded px-3 py-2 text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)" }}>
              <span style={{ color: "var(--foreground)" }}>{d.field}:</span>{" "}
              <span style={{ color: "var(--muted)" }}>
                this source says &ldquo;{d.thisSource}&rdquo;, website says &ldquo;{d.websiteValue}&rdquo;
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
