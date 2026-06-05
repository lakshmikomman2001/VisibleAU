import { Lightbulb } from "lucide-react";
import { redirect } from "next/navigation";
import { PackBrowser } from "@/components/domain/vertical/pack-browser";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function VerticalsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          Vertical packs
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          AU-tuned prompt libraries. 3 active (v1: Tradies, SaaS, Allied Health) &middot; 2 coming
          v1.1 (Professional Services, Real Estate) &middot; 3 coming soon.
        </p>
      </div>

      <PackBrowser mode="browser" />

      <div
        style={{
          marginTop: 32,
          padding: 16,
          borderRadius: 8,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          background: "var(--bg-subtle)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Lightbulb
          style={{
            width: 16,
            height: 16,
            marginTop: 2,
            flexShrink: 0,
            color: "var(--accent-amber)",
          }}
        />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Vertical packs are updated based on AU search behaviour. New prompts added monthly.
          Suggest a vertical via the support widget.
        </p>
      </div>
    </div>
  );
}
