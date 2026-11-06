import { SettingsIndex } from "@/components/domain/settings-index";

export default function SettingsPage() {
  return (
    <div style={{ padding: "28px 32px", maxWidth: 720 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          margin: 0,
        }}
      >
        Account
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "4px 0 24px" }}>
        Your workspace's team, notification emails, report branding and plan.
      </p>
      <SettingsIndex />
    </div>
  );
}
