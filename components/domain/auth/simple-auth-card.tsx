import type { CSSProperties, ReactNode } from "react";
import { AppLogo } from "@/components/domain/app-logo";

/** The plain card the password-reset pages sit in. */
export function SimpleAuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "var(--bg-base)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <AppLogo />
        <h1
          style={{
            marginTop: 24,
            marginBottom: 8,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}

export const authInputStyle: CSSProperties = {
  height: 36,
  borderRadius: 6,
  fontSize: 14,
  padding: "0 12px",
  outline: "none",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  boxShadow: "var(--shadow-soft)",
};

export const authButtonStyle: CSSProperties = {
  marginTop: 8,
  height: 40,
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 500,
  background: "var(--accent-primary)",
  color: "var(--accent-primary-fg)",
  border: "none",
  cursor: "pointer",
  width: "100%",
};

export const authLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
};

export const authTextStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: "22px",
  color: "var(--text-secondary)",
  margin: "0 0 16px",
};

export function AuthNotice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        fontSize: 13,
        lineHeight: "20px",
        background: tone === "error" ? "var(--danger-soft)" : "var(--accent-blue-soft)",
        color: tone === "error" ? "var(--danger)" : "var(--text-primary)",
      }}
    >
      {children}
    </div>
  );
}
