export function DriftIndicator({
  severity,
}: {
  severity: string | null;
}) {
  if (!severity || severity === "within_noise") return null;

  if (severity === "significant_drop") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 6px",
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 600,
          background: "var(--danger-soft)",
          color: "var(--danger)",
        }}
      >
        ↓ Drop
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 9999,
        fontSize: 10,
        fontWeight: 600,
        background: "var(--success-soft)",
        color: "var(--success)",
      }}
    >
      ↑ Rise
    </span>
  );
}
