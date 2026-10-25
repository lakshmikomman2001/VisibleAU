/** The visibleau wordmark -- the sidebar's logo, also used by the phone top bar. */
export function AppLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 22,
          height: 22,
          background: "var(--accent-primary)",
          color: "var(--accent-primary-fg)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 13,
            position: "relative",
            zIndex: 1,
          }}
        >
          V
        </span>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%)",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          visible
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: "-0.02em",
            color: "var(--text-tertiary)",
          }}
        >
          au
        </span>
      </div>
    </div>
  );
}
