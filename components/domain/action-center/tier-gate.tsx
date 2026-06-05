import Link from "next/link";

interface TierGateProps {
  isFree: boolean;
  children: React.ReactNode;
}

export function TierGate({ isFree, children }: TierGateProps) {
  if (!isFree) return <>{children}</>;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(4px)", pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Link
          href="/settings/billing"
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: "var(--accent-primary)",
            color: "var(--accent-primary-fg)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Upgrade to Starter to unlock
        </Link>
      </div>
    </div>
  );
}
