interface DirectoryEntry {
  directory: string;
  present: boolean;
  url: string | null;
}

export function DirectoryPresenceMatrix({
  directories,
}: {
  directories: DirectoryEntry[];
}) {
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
        AU Directory Presence
      </div>
      {directories.map((dir) => (
        <div
          key={dir.directory}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
            {dir.directory.replace(/_/g, " ")}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 9999,
              background: dir.present
                ? "var(--success-soft)"
                : "var(--danger-soft)",
              color: dir.present ? "var(--success)" : "var(--danger)",
            }}
          >
            {dir.present ? "Found" : "Not found"}
          </span>
        </div>
      ))}
    </div>
  );
}
