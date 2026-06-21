interface NapFindingEntry {
  source: string;
  name: string;
  address: string;
  phone: string;
}

export function NapConsistencyTable({
  findings,
}: {
  findings: NapFindingEntry[];
}) {
  if (findings.length === 0) return null;

  return (
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
        NAP Signals
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 3fr 3fr 2fr",
          padding: "8px 20px",
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-tertiary)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>Source</div>
        <div>Name</div>
        <div>Address</div>
        <div>Phone</div>
      </div>
      {findings.map((f) => (
        <div
          key={f.source}
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 3fr 3fr 2fr",
            padding: "8px 20px",
            fontSize: 12,
            color: "var(--text-secondary)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
            {f.source}
          </div>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {f.name || "—"}
          </div>
          <div
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {f.address || "—"}
          </div>
          <div>{f.phone || "—"}</div>
        </div>
      ))}
    </div>
  );
}
