interface SuburbEntry {
  suburb: string;
  mentionedInContent: boolean;
  mentionedInMeta: boolean;
  mentionedInSchema: boolean;
}

export function SuburbCoverageCard({
  suburbs,
}: {
  suburbs: SuburbEntry[];
}) {
  if (suburbs.length === 0) return null;

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
        Suburb Coverage
      </div>
      {suburbs.map((s) => (
        <div
          key={s.suburb}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
            {s.suburb}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "Content", val: s.mentionedInContent },
              { label: "Meta", val: s.mentionedInMeta },
              { label: "Schema", val: s.mentionedInSchema },
            ].map((c) => (
              <span
                key={c.label}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 6px",
                  borderRadius: 9999,
                  background: c.val
                    ? "var(--success-soft)"
                    : "var(--accent-muted)",
                  color: c.val
                    ? "var(--success)"
                    : "var(--text-tertiary)",
                }}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
