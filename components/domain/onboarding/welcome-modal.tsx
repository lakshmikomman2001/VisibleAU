"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  orgName: string;
}

export default function WelcomeModal({ orgName }: Props) {
  const [open, setOpen] = useState(true);

  async function handleDismiss() {
    try {
      await fetch("/api/onboarding/complete", { method: "POST" });
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="rounded-lg w-full max-w-md p-8 text-center"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(59,130,246,0.15)" }}
        >
          <Sparkles style={{ width: 24, height: 24, color: "#3b82f6" }} />
        </div>

        <h2
          className="text-xl font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Welcome to VisibleAU!
        </h2>

        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          {orgName} is all set up. Your first audit is running now — we&apos;ll
          notify you when the results are ready. In the meantime, explore your
          dashboard.
        </p>

        <button
          onClick={handleDismiss}
          className="rounded-md px-6 py-2 text-sm font-medium"
          style={{ backgroundColor: "#3b82f6", color: "#fff" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
