"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDowngrade: () => Promise<void>;
  onPause: () => Promise<void>;
  onCancelAnyway: () => void;
}

export default function RetentionModal({
  open,
  onClose,
  onDowngrade,
  onPause,
  onCancelAnyway,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!open) return null;

  async function handle(action: string, fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
      onClose();
    } catch {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="rounded-lg w-full max-w-md p-6 relative"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4"
          style={{ color: "var(--text-tertiary)" }}
          aria-label="Close"
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Before you go...
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          We&apos;d hate to see you leave. Here are some options:
        </p>

        <div className="space-y-3">
          <button
            onClick={() => handle("downgrade", onDowngrade)}
            disabled={busy !== null}
            className="w-full rounded-md px-4 py-3 text-sm font-medium text-left disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <div className="font-medium">Downgrade to Free</div>
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Keep your data, switch to the free plan at the end of your billing
              period.
            </div>
          </button>

          <button
            onClick={() => handle("pause", onPause)}
            disabled={busy !== null}
            className="w-full rounded-md px-4 py-3 text-sm font-medium text-left disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
            }}
          >
            <div className="font-medium">Pause for 1 month</div>
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Pause all scheduled audits. Resume anytime.
            </div>
          </button>

          <button
            onClick={() => {
              setBusy("cancel");
              onCancelAnyway();
            }}
            disabled={busy !== null}
            className="w-full rounded-md px-4 py-3 text-sm font-medium text-left disabled:opacity-50"
            style={{
              backgroundColor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#ef4444",
            }}
          >
            Cancel anyway
          </button>
        </div>
      </div>
    </div>
  );
}
