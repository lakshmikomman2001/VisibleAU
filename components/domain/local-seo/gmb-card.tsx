interface NapFindingEntry {
  source: string;
  name: string;
  address: string;
  phone: string;
}

interface GmbCardProps {
  gmbPresent: boolean;
  gmbCompleteness: string | null;
  gmbReviewCount: number;
  gmbAvgRating: string | null;
  napFindings: NapFindingEntry[];
}

function FieldRow({ label, value }: { label: string; value: string | null }) {
  const present = value != null && value.length > 0;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
      {present ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 9999,
            background: "var(--success-soft)",
            color: "var(--success)",
          }}
        >
          {value}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
      )}
    </div>
  );
}

export function GmbCard({
  gmbPresent,
  gmbCompleteness,
  gmbReviewCount,
  gmbAvgRating,
  napFindings,
}: GmbCardProps) {
  if (!gmbPresent) {
    return (
      <div
        style={{
          padding: 20,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 16px",
          }}
        >
          Google Business Profile
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>
          No Google Business Profile found for this brand.
        </p>
      </div>
    );
  }

  const gmbSource = napFindings.find((f) => f.source === "gmb");
  const completeness = gmbCompleteness ? Number(gmbCompleteness) : 0;

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: "0 0 16px",
        }}
      >
        Google Business Profile
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <FieldRow label="Business name" value={gmbSource?.name || null} />
        <FieldRow label="Phone number" value={gmbSource?.phone || null} />
        <FieldRow label="Address" value={gmbSource?.address || null} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 0",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Reviews</span>
          {gmbReviewCount > 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-primary)" }}>
              {Number(gmbAvgRating ?? 0).toFixed(1)} ({gmbReviewCount})
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 0",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Completeness</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 9999,
              background: completeness >= 80 ? "var(--success-soft)" : "var(--accent-muted)",
              color: completeness >= 80 ? "var(--success)" : "var(--text-tertiary)",
            }}
          >
            {completeness}%
          </span>
        </div>
      </div>
    </div>
  );
}
